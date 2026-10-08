import { randomBytes } from "node:crypto";
import { type EmployeeAccount, loginSchema } from "@/domain/identity";
import { identityStore, identityTransaction } from "./identity-store";
import { identityAudit, identityHash } from "@/services/identity";
import { SupportError } from "./support-repository";

export const identityCookie = "vng_identity";
type IdentitySession = { hash: string; employeeId: string; assurance: "demo" | "verified"; expiresAt: Date };
// Legacy OTP documents are left untouched; no challenge is read or issued.

export async function identityRateLimit(key: string, limit: number) {
  const { db } = await identityStore();
  const minute = Math.floor(Date.now() / 60_000);
  const result = await db.collection<{ key: string; count: number; expiresAt: Date }>("identity_limits").findOneAndUpdate(
    { key: `${key}:${minute}` }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((minute + 2) * 60_000) } }, { upsert: true, returnDocument: "after" },
  );
  if (!result || result.count > limit) throw new SupportError("RATE_LIMITED", "Quá nhiều lần thử. Chờ một phút rồi thử lại.", 429);
}
async function issueSession(employee: EmployeeAccount) {
  const token = randomBytes(32).toString("hex");
  await identityTransaction(async (db, session) => {
    const current = await db.collection<EmployeeAccount>("identity_employees").findOne({ id: employee.id, status: "ACTIVE" }, { session });
    if (!current) throw new SupportError("INVALID_EMPLOYEE_ID", "ID không còn hiệu lực.", 401);
    await db.collection<IdentitySession>("identity_sessions").insertOne({ hash: identityHash(token), employeeId: employee.id, assurance: "demo", expiresAt: new Date(Date.now() + 8 * 60 * 60_000) }, { session });
    await identityAudit(db, session, employee.id, "SESSION_CREATED", employee.id, "Truy cập demo chỉ bằng ID; chưa xác minh danh tính. Quyền IT phụ thuộc role được operator cấp.");
  });
  return token;
}
export async function startIdentityLogin(value: unknown) {
  const input = loginSchema.parse(value);
  await identityRateLimit(`login:${identityHash(input.employeeId)}`, 5);
  const { db } = await identityStore();
  const employee = await db.collection<EmployeeAccount>("identity_employees").findOne({ id: input.employeeId, status: "ACTIVE" });
  if (!employee) throw new SupportError("INVALID_EMPLOYEE_ID", "ID không hợp lệ, chưa được cấp hoặc đã bị IT vô hiệu hóa. Kiểm tra trạng thái đơn.", 401);
  return {
    token: await issueSession(employee),
    assurance: "demo" as const,
    canReviewIds: employee.roles.includes("identity-admin"),
  };
}
export function sessionToken(request: Request) {
  const token = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${identityCookie}=`))?.slice(identityCookie.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function requireIdentitySession(request: Request, admin = false) {
  const token = sessionToken(request);
  if (!token) throw new SupportError("AUTHENTICATION_REQUIRED", "Đăng nhập để tiếp tục.", 401);
  const { db } = await identityStore();
  const session = await db.collection<IdentitySession>("identity_sessions").findOne({ hash: identityHash(token), expiresAt: { $gt: new Date() } });
  const employee = session && await db.collection<EmployeeAccount>("identity_employees").findOne({ id: session.employeeId, status: "ACTIVE" }, { projection: { _id: 0 } });
  if (!session || !employee) throw new SupportError("AUTHENTICATION_REQUIRED", "Phiên hết hạn hoặc ID không còn hiệu lực. Đăng nhập lại.", 401);
  if (admin && !employee.roles.includes("identity-admin"))
    throw new SupportError("IT_AUTHORITY_REQUIRED", "Cần đăng nhập bằng ID có vai trò xử lý ID do operator cấp; tên job hoặc header không cấp quyền IT.", 403);
  // No session is advertised as verified in the ID-only demo, including legacy sessions.
  return { employee, assurance: "demo" as const };
}
export async function logoutIdentity(request: Request) {
  const token = sessionToken(request);
  if (token) {
    const { db } = await identityStore();
    await db.collection<IdentitySession>("identity_sessions").deleteOne({ hash: identityHash(token) });
  }
}
export function identitySessionCookie(token: string, clear = false) {
  return `${identityCookie}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : 28800}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
