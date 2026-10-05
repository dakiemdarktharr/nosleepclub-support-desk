import { createHash, randomUUID } from "node:crypto";
import { MongoServerError, type ClientSession, type Db } from "mongodb";
import { applicationInputSchema, decisionSchema, generateEmployeeId, profileSchema, scopeKey,
  type IdentityApplication, type IdentityAudit, type EmployeeAccount, type JobProfile } from "@/domain/identity";
import { identityStore, identityTransaction } from "@/lib/identity-store";
import { SupportError } from "@/lib/support-repository";

export const identityHash = (value: string) => createHash("sha256").update(value).digest("hex");
export async function identityAudit(db: Db, session: ClientSession, actor: string, action: string, subject: string, reason: string, version?: number) {
  await db.collection<IdentityAudit>("identity_audit").insertOne({ id: randomUUID(), at: new Date().toISOString(), actor, action, subject, reason, version }, { session });
}
export async function listIdentityProfiles() {
  const { db } = await identityStore();
  const rows = await db.collection<JobProfile>("identity_profiles").find({ active: true }, { projection: { _id: 0 } }).sort({ name: 1, version: -1 }).limit(100).toArray();
  return rows.map((row) => profileSchema.parse(row));
}
export async function submitIdentityApplication(value: unknown) {
  const input = applicationInputSchema.parse(value);
  const fingerprint = identityHash(JSON.stringify({ fullName: input.fullName, job: input.job }));
  return identityTransaction(async (db, session) => {
    const collection = db.collection<IdentityApplication>("identity_applications");
    const existing = await collection.findOne({ id: input.id }, { session });
    if (existing) {
      if (existing.trackingHash !== identityHash(input.trackingToken) || existing.fingerprint !== fingerprint)
        throw new SupportError("APPLICATION_CONFLICT", "Mã gửi đã dùng cho đơn khác. Tạo đơn mới.", 409);
      return { id: existing.id, status: existing.status };
    }
    const profile = input.job.kind === "existing"
      ? await db.collection<JobProfile>("identity_profiles").findOne({ id: input.job.profileId, version: input.job.version, active: true }, { session, projection: { _id: 0 } }) : null;
    if (input.job.kind === "existing" && !profile) throw new SupportError("PROFILE_CHANGED", "Job không còn khả dụng. Tải lại và chọn profile hiện hành.", 409);
    const validated = profile ? profileSchema.parse(profile) : null;
    const now = new Date().toISOString();
    const row: IdentityApplication = {
      id: input.id, fullName: input.fullName, job: input.job, profile: validated,
      requestedScopes: input.job.kind === "new" ? input.job.scopes : validated!.scopes,
      trackingHash: identityHash(input.trackingToken), fingerprint,
      status: "PENDING", version: 0, createdAt: now, updatedAt: now,
    };
    await collection.insertOne(row, { session });
    await identityAudit(db, session, "applicant-unverified", "APPLICATION_SUBMITTED", row.id, "Đơn chờ IT xác minh nhân sự và phạm vi.", 0);
    return { id: row.id, status: row.status };
  });
}
export async function trackIdentityApplication(id: string, token: string) {
  const { db } = await identityStore();
  const row = await db.collection<IdentityApplication>("identity_applications").findOne({ id, trackingHash: identityHash(token) });
  if (!row) throw new SupportError("NOT_FOUND", "Không tìm thấy đơn. Kiểm tra mã và khóa theo dõi trong biên nhận.", 404);
  // A tracking capability can read this application, never a channel or an account session.
  const granted = row.status === "APPROVED" && row.grantedProfile ? await db.collection<JobProfile>("identity_profiles").findOne({ id: row.grantedProfile.id, version: row.grantedProfile.version }) : null;
  return { id: row.id, fullName: row.fullName, status: row.status, createdAt: row.createdAt,
    updatedAt: row.updatedAt, jobName: row.profile?.name ?? (row.job.kind === "new" ? row.job.name : "Job"),
    scopes: row.requestedScopes, grantedScopes: granted ? profileSchema.parse(granted).scopes : undefined, reason: row.decisionReason,
    employeeId: row.status === "APPROVED" ? row.employeeId : undefined };
}
export async function decideIdentityApplication(id: string, value: unknown, actor: string) {
  const decision = decisionSchema.parse(value);
  try {
    return await identityTransaction(async (db, session) => {
      const applications = db.collection<IdentityApplication>("identity_applications");
      const row = await applications.findOne({ id }, { session });
      if (!row) throw new SupportError("NOT_FOUND", "Không tìm thấy đơn.", 404);
      if (row.version !== decision.version || !["PENDING", "ID_CONFLICT"].includes(row.status))
        throw new SupportError("VERSION_CONFLICT", "Đơn đã thay đổi. Tải lại trước khi quyết định.", 409);
      let employeeId: string | undefined;
      let profile: JobProfile | null = row.profile;
      if (decision.action === "approve") {
        if (decision.suffix && row.status !== "ID_CONFLICT") throw new SupportError("SUFFIX_NOT_NEEDED", "Giữ đúng công thức ID; hậu tố chỉ dùng sau khi xác nhận trùng ID.", 422);
        employeeId = generateEmployeeId(row.fullName) + (decision.suffix ? `-${decision.suffix}` : "");
        if (employeeId.length > 32) throw new SupportError("ID_TOO_LONG", "ID có hậu tố vượt 32 ký tự.", 422);
        if (await db.collection<EmployeeAccount>("identity_employees").findOne({ id: employeeId }, { session }))
          throw new SupportError("ID_COLLISION", "ID bị trùng. Xác minh nhân sự, chọn hậu tố số và ghi lý do trước khi duyệt lại.", 409);
        if (row.job.kind === "existing") {
          if (decision.approvedScopes) throw new SupportError("PROFILE_IMMUTABLE", "Job có sẵn dùng nguyên phạm vi của phiên bản đã chọn.", 422);
          profile = await db.collection<JobProfile>("identity_profiles").findOne({ id: row.job.profileId, version: row.job.version, active: true }, { session, projection: { _id: 0 } });
          if (!profile) throw new SupportError("PROFILE_CHANGED", "Profile không còn hiệu lực; không thể cấp.", 409);
        } else {
          if (!decision.approvedScopes || decision.approvedScopes.some((scope) => !row.requestedScopes.some((requested) => scopeKey(requested) === scopeKey(scope))))
            throw new SupportError("SCOPE_ESCALATION", "IT phải chọn phạm vi từ đơn đã gửi; không tự thêm quyền ngoài đơn.", 422);
          profile = { id: randomUUID(), version: 1, name: row.job.name, scopes: decision.approvedScopes, active: true, createdAt: new Date().toISOString(), createdBy: actor };
          await db.collection<JobProfile>("identity_profiles").insertOne(profileSchema.parse(profile), { session });
          await identityAudit(db, session, actor, "PROFILE_CREATED", profile.id, decision.reason, 1);
        }
        const checked = profileSchema.parse(profile);
        await db.collection<EmployeeAccount>("identity_employees").insertOne({ id: employeeId, fullName: row.fullName, status: "ACTIVE", profileId: checked.id, profileVersion: checked.version, roles: [], applicationId: id, createdAt: new Date().toISOString() }, { session });
      }
      const status = decision.action === "approve" ? "APPROVED" : "REJECTED";
      const changed = await applications.updateOne({ id, version: decision.version }, { $set: { status, decisionReason: decision.reason, decidedBy: actor, employeeId, grantedProfile: decision.action === "approve" && profile ? { id: profile.id, version: profile.version } : undefined, updatedAt: new Date().toISOString() }, $inc: { version: 1 } }, { session });
      if (!changed.modifiedCount) throw new SupportError("VERSION_CONFLICT", "Đơn đã thay đổi. Tải lại trước khi quyết định.", 409);
      await identityAudit(db, session, actor, status, id, `${decision.reason}${decision.suffix ? ` Hậu tố ID do IT chọn: -${decision.suffix}.` : ""}`, row.version + 1);
      return { id, status, employeeId };
    });
  } catch (error) {
    if ((error instanceof SupportError && error.code === "ID_COLLISION") || (error instanceof MongoServerError && error.code === 11000)) {
      await identityTransaction(async (db, session) => {
        const changed = await db.collection<IdentityApplication>("identity_applications").updateOne({ id, version: decision.version, status: { $in: ["PENDING", "ID_CONFLICT"] } }, { $set: { status: "ID_CONFLICT", decisionReason: "Trùng ID; IT đang xác minh và chọn hậu tố. Chưa cấp tài khoản.", updatedAt: new Date().toISOString() }, $inc: { version: 1 } }, { session });
        if (changed.modifiedCount) await identityAudit(db, session, actor, "ID_COLLISION", id, "Không cấp trùng ID; yêu cầu IT xử lý hậu tố.", decision.version + 1);
      });
      throw new SupportError("ID_COLLISION", "ID bị trùng. Tải lại, xác minh nhân sự và chọn hậu tố số có lý do.", 409);
    }
    throw error;
  }
}
