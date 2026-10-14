import type { ClientSession, Db } from "mongodb";
import { demoProject, demoPoolSchema, demoGrantSchema, grantInputSchema, demoDecisionSchema,
  usageInputSchema, capacityCheckSchema, checkDemoCapacity, hasDemoGrant, validObservation,
  type DemoPool, type DemoGrant } from "@/domain/demo-authority";
import type { EmployeeAccount } from "@/domain/identity";
import { redact } from "@/domain/redaction";
import { identityStore, identityTransaction } from "@/lib/identity-store";
import { SupportError } from "@/lib/support-repository";
import { identityAudit } from "./identity";

// This adapter returns demo evidence only. A future trusted IAM/capacity adapter
// must validate its own source/identity; never relabel these records as verified.
export interface AuthorityRegistry {
  read(employee: EmployeeAccount): Promise<{ pool: DemoPool | null; grants: DemoGrant[]; canManage: boolean; assurance: "demo" }>;
}
async function activeEmployee(db: Db, id: string, session?: ClientSession) {
  const employee = await db.collection<EmployeeAccount>("identity_employees").findOne({ id, status: "ACTIVE" }, { session });
  if (!employee) throw new SupportError("AUTHENTICATION_REQUIRED", "ID không còn hiệu lực.", 401);
  return employee;
}
async function poolFor(db: Db, session?: ClientSession) {
  const value = await db.collection<DemoPool>("identity_demo_pool").findOne({ id: demoProject }, { session, projection: { _id: 0 } });
  return value ? demoPoolSchema.parse(value) : null;
}
async function requireOwner(db: Db, id: string, session?: ClientSession) {
  const employee = await activeEmployee(db, id, session);
  const pool = await poolFor(db, session);
  if (!pool || !employee.roles.includes("identity-admin") || !pool.ownerIds.includes(id))
    throw new SupportError("RESOURCE_OWNER_REQUIRED", "Chưa được gán owner cho DEMO-SANDBOX. Vai trò IT không tự cấp quyền này.", 403);
  return pool;
}
export const mongoDemoAuthority: AuthorityRegistry = {
  async read(employee) {
    const { db } = await identityStore();
    const current = await activeEmployee(db, employee.id);
    const pool = await poolFor(db);
    const canManage = Boolean(pool?.ownerIds.includes(current.id) && current.roles.includes("identity-admin"));
    const rows = await db.collection<DemoGrant>("identity_demo_grants")
      .find(canManage ? {} : { employeeId: current.id }, { projection: { _id: 0 } })
      .sort({ createdAt: -1, id: 1 }).limit(100).toArray();
    return { pool, grants: rows.map((row) => demoGrantSchema.parse(row)), canManage, assurance: "demo" };
  },
};
export async function requestDemoGrant(value: unknown, employeeId: string) {
  const input = grantInputSchema.parse(value);
  input.reason = redact(input.reason).text;
  return identityTransaction(async (db, session) => {
    await activeEmployee(db, employeeId, session);
    if (!await poolFor(db, session)) throw new SupportError("DEMO_NOT_CONFIGURED", "Sổ demo chưa được operator khởi tạo. Chưa lưu đơn.", 503);
    const rows = db.collection<DemoGrant>("identity_demo_grants");
    const existing = await rows.findOne({ id: input.id }, { session, projection: { _id: 0 } });
    if (existing) {
      const old = demoGrantSchema.parse(existing);
      if (old.employeeId !== employeeId || JSON.stringify({ id: old.id, scope: old.scope, hours: old.hours, reason: old.reason }) !== JSON.stringify(input))
        throw new SupportError("IDEMPOTENCY_CONFLICT", "Mã gửi đã dùng cho đơn khác.", 409);
      return old;
    }
    const row: DemoGrant = { ...input, employeeId, status: "PENDING", version: 0, createdAt: new Date().toISOString(), assurance: "demo" };
    await rows.insertOne(row, { session });
    await identityAudit(db, session, employeeId, "DEMO_GRANT_REQUESTED", row.id, JSON.stringify({ scope: row.scope, hours: row.hours, reason: row.reason }));
    return row;
  });
}
export async function decideDemoGrant(value: unknown, actor: string) {
  const input = demoDecisionSchema.parse(value);
  input.reason = redact(input.reason).text;
  return identityTransaction(async (db, session) => {
    const pool = await requireOwner(db, actor, session);
    const rows = db.collection<DemoGrant>("identity_demo_grants");
    const raw = await rows.findOne({ id: input.id }, { session, projection: { _id: 0 } });
    if (!raw) throw new SupportError("NOT_FOUND", "Không tìm thấy đơn.", 404);
    const row = demoGrantSchema.parse(raw);
    if (row.scope.target !== pool.id || row.employeeId === actor)
      throw new SupportError("SELF_APPROVAL_FORBIDDEN", "Không được tự xử lý đơn của mình hoặc duyệt ngoài phạm vi.", 403);
    if (row.version !== input.version || row.status !== (input.action === "revoke" ? "APPROVED" : "PENDING"))
      throw new SupportError("VERSION_CONFLICT", "Đơn đã đổi trạng thái; tải lại trước khi quyết định.", 409);
    if (input.action === "approve") await activeEmployee(db, row.employeeId, session);
    const now = new Date();
    const updated: DemoGrant = { ...row, version: row.version + 1,
      status: input.action === "approve" ? "APPROVED" : input.action === "reject" ? "REJECTED" : "REVOKED",
      decidedBy: actor, decidedAt: now.toISOString(), decisionReason: input.reason,
      ...(input.action === "approve" ? { expiresAt: new Date(+now + row.hours * 3_600_000).toISOString() } : {}),
    };
    // Updating the pool version serializes decisions against concurrent usage/config updates.
    const lock = await db.collection<DemoPool>("identity_demo_pool").updateOne({ id: pool.id, version: pool.version }, { $inc: { version: 1 } }, { session });
    if (lock.modifiedCount !== 1) throw new SupportError("VERSION_CONFLICT", "Cấu hình đã đổi. Tải lại.", 409);
    const result = await rows.updateOne({ id: row.id, version: input.version, status: row.status }, { $set: updated }, { session });
    if (result.modifiedCount !== 1) throw new SupportError("VERSION_CONFLICT", "Đơn đã đổi. Tải lại.", 409);
    await identityAudit(db, session, actor, `DEMO_GRANT_${updated.status}`, row.id,
      JSON.stringify({ scope: row.scope, employeeId: row.employeeId, reason: input.reason, expiresAt: updated.expiresAt, assurance: "demo", executed: false }), updated.version);
    return updated;
  });
}
export async function updateDemoUsage(value: unknown, actor: string) {
  const input = usageInputSchema.parse(value);
  if (!validObservation(input, Date.now())) throw new SupportError("INVALID_OBSERVATION", "Cần thời điểm quan sát không ở tương lai và thời hạn hiệu lực chưa hết.", 422);
  return identityTransaction(async (db, session) => {
    const pool = await requireOwner(db, actor, session);
    if (pool.version !== input.version) throw new SupportError("VERSION_CONFLICT", "Quota đã đổi. Tải lại.", 409);
    const next: DemoPool = { ...pool, used: input.used, reserved: input.reserved,
      observedAt: input.observedAt, validUntil: input.validUntil, version: pool.version + 1 };
    const result = await db.collection<DemoPool>("identity_demo_pool").updateOne({ id: pool.id, version: pool.version }, { $set: next }, { session });
    if (result.modifiedCount !== 1) throw new SupportError("VERSION_CONFLICT", "Quota đã đổi. Tải lại.", 409);
    await identityAudit(db, session, actor, "DEMO_USAGE_UPDATED", pool.id,
      JSON.stringify({ before: pool, after: next, reason: redact(input.reason).text }), next.version);
    return next;
  });
}
export async function checkDemoAuthority(value: unknown, employee: EmployeeAccount) {
  const input = capacityCheckSchema.parse(value);
  // Query exact scope/status directly, not the bounded UI list (which may omit old active grants).
  const { db } = await identityStore();
  await activeEmployee(db, employee.id);
  const pool = await poolFor(db);
  const grants = await db.collection<DemoGrant>("identity_demo_grants").find({
    employeeId: employee.id, status: "APPROVED", "scope.operation": input.scope.operation,
    expiresAt: { $gte: new Date(Date.now() + input.hours * 3_600_000).toISOString() },
  }, { projection: { _id: 0 } }).limit(100).toArray();
  const now = Date.now();
  const entitlement = hasDemoGrant(grants.map((row) => demoGrantSchema.parse(row)), employee.id, input.scope, input.hours, now);
  const quota = checkDemoCapacity(pool, input.requested, input.hours, now);
  const result = { entitlement: entitlement ? "demo-allowed" : "unverified", quota,
    budget: "unconfigured", assurance: "demo", executed: false, policyAuthority: "unchanged" } as const;
  await identityTransaction((auditDb, session) => identityAudit(auditDb, session, employee.id, "DEMO_SCOPE_QUOTA_CHECK", demoProject, JSON.stringify({ input, result, poolVersion: pool?.version })));
  return result;
}
