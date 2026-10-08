import { z } from "zod";
import { employeeIdPattern, normalizeEmployeeId } from "./employee-identity";

export function generateEmployeeId(fullName: string): string {
  const parts = fullName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d").toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!parts.length || parts.some((part) => !/^[a-z]+$/.test(part)))
    throw new TypeError("Họ tên chỉ gồm chữ và khoảng trắng.");
  const id = parts.at(-1)! + parts.slice(0, -1).map((part) => part[0]).join("");
  if (!employeeIdPattern.test(id)) throw new TypeError("Tên tạo ID dài quá 32 ký tự; cần IT xử lý.");
  return id;
}
export const environments = { sandbox: "Thử nghiệm riêng", staging: "Kiểm thử", production: "Production — rủi ro cao" } as const;
export const resources = {
  project: "Task / dự án", repository: "Repository / mã nguồn", logs: "Log phòng ban",
  database: "Database / schema", cloud: "Tài nguyên cloud", configuration: "Cấu hình",
  secrets: "Secrets", keys: "Khóa mã hóa", administration: "Quản trị / root",
} as const;
export const operations = {
  read: "Đọc", create: "Tạo", update: "Sửa", delete: "Xóa", execute: "Thực thi",
  approve: "Phê duyệt", configure: "Cấu hình", export: "Xuất dữ liệu", rotate: "Luân chuyển khóa", revoke: "Thu hồi khóa",
} as const;
export const scopeSchema = z.object({
  environment: z.enum(["sandbox", "staging", "production"]),
  resource: z.enum(["project", "repository", "logs", "database", "cloud", "configuration", "secrets", "keys", "administration"]),
  operation: z.enum(["read", "create", "update", "delete", "execute", "approve", "configure", "export", "rotate", "revoke"]),
  target: z.string().trim().min(2).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9_./:-]*$/)
    .refine((value) => !["all", "any", "root"].includes(value.toLowerCase()) && !value.split("/").includes(".."), "Cần đích cụ thể, không chọn tất cả."),
}).strict();
export type Scope = z.infer<typeof scopeSchema>;
export const scopeKey = (scope: Scope) => JSON.stringify([scope.environment, scope.resource, scope.operation, scope.target]);
export const scopesSchema = z.array(scopeSchema).min(1).max(30).refine(
  (scopes) => new Set(scopes.map(scopeKey)).size === scopes.length, "Phạm vi bị lặp.",
);
export function scopeRisk(scope: Scope): string | null {
  if (["secrets", "keys", "administration"].includes(scope.resource)) return "SECURITY_RISK";
  if (scope.environment === "production" || ["delete", "execute", "approve", "configure", "export", "rotate", "revoke"].includes(scope.operation))
    return "BEYOND_AUTHORITY";
  return null;
}
export const profileSchema = z.object({
  id: z.string().uuid(), version: z.number().int().positive(), name: z.string().trim().min(2).max(100),
  scopes: scopesSchema, active: z.boolean(), createdAt: z.string(), createdBy: z.string(),
});
export type JobProfile = z.infer<typeof profileSchema>;
const fullName = z.string().trim().min(2).max(120).transform((value) => value.replace(/\s+/g, " "))
  .refine((value) => { try { generateEmployeeId(value); return true; } catch { return false; } }, "Tên không hợp lệ hoặc ID quá dài.");
export const applicationInputSchema = z.object({
  id: z.string().uuid(), trackingToken: z.string().regex(/^[a-f0-9]{64}$/), fullName,
  job: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("existing"), profileId: z.string().uuid(), version: z.number().int().positive() }).strict(),
    z.object({ kind: z.literal("new"), name: z.string().trim().min(2).max(100), scopes: scopesSchema }).strict(),
  ]),
}).strict();
export type ApplicationInput = z.infer<typeof applicationInputSchema>;
export type IdentityAudit = { id: string; at: string; actor: string; action: string; subject: string; reason: string; version?: number };
export type IdentityApplication = {
  id: string; fullName: string; job: ApplicationInput["job"]; profile: JobProfile | null;
  requestedScopes: Scope[]; trackingHash: string; fingerprint: string;
  status: "PENDING" | "ID_CONFLICT" | "APPROVED" | "REJECTED"; version: number;
  createdAt: string; updatedAt: string; decisionReason?: string; decidedBy?: string;
  employeeId?: string; grantedProfile?: { id: string; version: number };
};
export type EmployeeAccount = {
  id: string; fullName: string; status: "ACTIVE" | "DISABLED"; profileId: string; profileVersion: number;
  roles: Array<"identity-admin">; createdAt: string; applicationId: string;
  // Legacy delivery metadata; not used by ID-only login and never returned publicly.
  verifiedChannel?: { destination: string; verifiedBy: string; verifiedAt: string };
};
export const decisionSchema = z.object({
  version: z.number().int().nonnegative(), action: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(8).max(1000),
  approvedScopes: scopesSchema.optional(), suffix: z.string().regex(/^[1-9][0-9]{0,3}$/).optional(),
}).strict();
export const loginSchema = z.object({ employeeId: z.string().trim().transform(normalizeEmployeeId).pipe(z.string().regex(employeeIdPattern)) }).strict();
export function evaluateScope(granted: Scope[], requested: Scope) {
  if (!granted.some((scope) => scopeKey(scope) === scopeKey(requested)))
    return { allowed: false, bucket: "OUT_OF_SCOPE", reason: "Thao tác hoặc đích không nằm trong profile đã duyệt." };
  const risk = scopeRisk(requested);
  return risk
    ? { allowed: false, bucket: risk, reason: "Cần người có thẩm quyền kiểm tra policy và duyệt riêng; duyệt job không cấp quyền này." }
    : { allowed: true, bucket: "IN_SCOPE", reason: "Trong phạm vi ít rủi ro đã duyệt. Connector vẫn phải kiểm tra policy nghiệp vụ trước khi thực thi." };
}
