import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { type EmployeeAccount, loginSchema } from "@/domain/identity";
import { identityStore, identityTransaction } from "./identity-store";
import { identityAudit, identityHash } from "@/services/identity";
import { SupportError } from "./support-repository";

export const identityCookie = "vng_identity";
type IdentitySession = { hash: string; employeeId: string; assurance: "demo" | "verified"; expiresAt: Date };
type Challenge = { id: string; employeeId: string; channelHash: string; codeHash: string; attempts: number; used: boolean; expiresAt: Date };
export async function identityRateLimit(key: string, limit: number) {
  const { db } = await identityStore();
  const minute = Math.floor(Date.now() / 60_000);
  const result = await db.collection<{ key: string; count: number; expiresAt: Date }>("identity_limits").findOneAndUpdate(
    { key: `${key}:${minute}` }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((minute + 2) * 60_000) } }, { upsert: true, returnDocument: "after" },
  );
  if (!result || result.count > limit) throw new SupportError("RATE_LIMITED", "Quá nhiều lần thử. Chờ một phút rồi thử lại.", 429);
}
function relayConfig() {
  const url = process.env.IDENTITY_OTP_RELAY_URL;
  const token = process.env.IDENTITY_OTP_RELAY_TOKEN;
  const signingKey = process.env.IDENTITY_OTP_SIGNING_KEY;
  const parsed = url ? URL.parse(url) : null;
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password || !token || !signingKey || signingKey.length < 32)
    throw new SupportError("VERIFICATION_UNAVAILABLE", "IT chưa cấu hình kênh OTP tin cậy. Bạn có thể dùng truy cập demo để gửi hỗ trợ; chưa thể xác minh quyền IT.", 503);
  return { url: parsed.toString(), token, signingKey };
}
function otpHash(id: string, code: string, key: string) {
  return createHmac("sha256", key).update(`${id}:${code}`).digest("hex");
}
async function issueSession(employee: EmployeeAccount, assurance: IdentitySession["assurance"]) {
  const token = randomBytes(32).toString("hex");
  await identityTransaction(async (db, session) => {
    const current = await db.collection<EmployeeAccount>("identity_employees").findOne({ id: employee.id, status: "ACTIVE" }, { session });
    if (!current) throw new SupportError("INVALID_EMPLOYEE_ID", "ID không còn hiệu lực.", 401);
    await db.collection<IdentitySession>("identity_sessions").insertOne({ hash: identityHash(token), employeeId: employee.id, assurance, expiresAt: new Date(Date.now() + 8 * 60 * 60_000) }, { session });
    await identityAudit(db, session, employee.id, "SESSION_CREATED", employee.id, assurance === "demo" ? "Truy cập demo bằng ID; chưa xác minh danh tính." : "OTP trên kênh đã được IT xác minh.");
  });
  return token;
}
export async function startIdentityLogin(value: unknown) {
  const input = loginSchema.parse(value);
  await identityRateLimit(`login:${identityHash(input.employeeId)}`, 5);
  const { db } = await identityStore();
  const employee = await db.collection<EmployeeAccount>("identity_employees").findOne({ id: input.employeeId, status: "ACTIVE" });
  if (!employee) throw new SupportError("INVALID_EMPLOYEE_ID", "ID không hợp lệ, chưa được cấp hoặc đã bị IT vô hiệu hóa. Kiểm tra trạng thái đơn.", 401);
  if (!input.verified) return { token: await issueSession(employee, "demo"), assurance: "demo" as const };
  const config = relayConfig();
  if (!employee.verifiedChannel?.destination || !employee.verifiedChannel.verifiedBy || !employee.verifiedChannel.verifiedAt)
    throw new SupportError("CHANNEL_UNAVAILABLE", "Chưa có kênh xác minh cho ID này. Liên hệ IT qua quy trình nội bộ; không gửi thông tin liên hệ vào đơn công khai.", 409);
  const id = randomUUID(), code = String(randomInt(100000, 1000000));
  await db.collection<Challenge>("identity_challenges").insertOne({ id, employeeId: employee.id, channelHash: identityHash(JSON.stringify(employee.verifiedChannel)), codeHash: otpHash(id, code, config.signingKey), attempts: 0, used: false, expiresAt: new Date(Date.now() + 5 * 60_000) });
  try {
    const response = await fetch(config.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify({ destination: employee.verifiedChannel.destination, code, expiresInSeconds: 300, purpose: "VNG Support sign-in" }) });
    if (!response.ok) throw new Error("DELIVERY_FAILED");
  } catch {
    await db.collection<Challenge>("identity_challenges").updateOne({ id }, { $set: { used: true } });
    throw new SupportError("OTP_DELIVERY_FAILED", "Chưa gửi được mã xác minh. Thử lại sau hoặc liên hệ IT.", 503);
  }
  return { challengeId: id, assurance: "pending" as const };
}
export async function verifyIdentityLogin(value: unknown) {
  const input = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict().parse(value);
  const config = relayConfig();
  const { db } = await identityStore();
  const challenge = await db.collection<Challenge>("identity_challenges").findOneAndUpdate(
    { id: input.challengeId, used: false, attempts: { $lt: 5 }, expiresAt: { $gt: new Date() } },
    { $inc: { attempts: 1 } }, { returnDocument: "after" },
  );
  const digest = otpHash(input.challengeId, input.code, config.signingKey);
  if (!challenge || !/^[a-f0-9]{64}$/.test(challenge.codeHash) || !timingSafeEqual(Buffer.from(challenge.codeHash, "hex"), Buffer.from(digest, "hex")))
    throw new SupportError("INVALID_OTP", "Mã sai, đã dùng, quá 5 lần thử hoặc hết hạn. Yêu cầu mã mới.", 401);
  const token = randomBytes(32).toString("hex");
  await identityTransaction(async (store, session) => {
    const consumed = await store.collection<Challenge>("identity_challenges").updateOne({ id: challenge.id, used: false, expiresAt: { $gt: new Date() } }, { $set: { used: true } }, { session });
    const employee = await store.collection<EmployeeAccount>("identity_employees").findOne({ id: challenge.employeeId, status: "ACTIVE" }, { session });
    if (!consumed.modifiedCount || !employee?.verifiedChannel || identityHash(JSON.stringify(employee.verifiedChannel)) !== challenge.channelHash) throw new SupportError("INVALID_OTP", "Mã không còn hiệu lực hoặc kênh xác minh đã thay đổi.", 401);
    await store.collection<IdentitySession>("identity_sessions").insertOne({ hash: identityHash(token), employeeId: employee.id, assurance: "verified", expiresAt: new Date(Date.now() + 8 * 60 * 60_000) }, { session });
    await identityAudit(store, session, employee.id, "SESSION_VERIFIED", employee.id, "OTP đã xác minh; phiên có thời hạn 8 giờ.");
  });
  return { token, assurance: "verified" as const };
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
  if (admin && (session.assurance !== "verified" || !employee.roles.includes("identity-admin")))
    throw new SupportError("IT_AUTHORITY_REQUIRED", "Cần phiên OTP và quyền xử lý ID do operator cấp; ID hoặc tên job không cấp quyền IT.", 403);
  return { employee, assurance: session.assurance };
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
