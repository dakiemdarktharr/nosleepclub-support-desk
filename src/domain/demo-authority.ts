import { z } from "zod";

export const demoProject = "DEMO-SANDBOX";
export const demoLimits = { cpu: 16, ramGb: 64, diskGb: 500, gpuT4: 4 };
const quantity = z.number().finite().nonnegative().max(1_000_000);
export const capacitySchema = z.object({ cpu: quantity, ramGb: quantity, diskGb: quantity, gpuT4: quantity.int() }).strict();
export type Capacity = z.infer<typeof capacitySchema>;
export const demoScopeSchema = z.object({
  target: z.literal(demoProject), environment: z.literal("sandbox"),
  resource: z.literal("cloud"), operation: z.enum(["read", "create"]),
}).strict();
export const demoPoolSchema = z.object({
  id: z.literal(demoProject), assurance: z.literal("demo"), version: z.number().int().nonnegative(),
  ownerIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/)).min(1).max(10),
  limits: capacitySchema, used: capacitySchema, reserved: capacitySchema,
  observedAt: z.string().datetime(), validUntil: z.string().datetime(),
  maxHours: z.literal(24), budget: z.literal("unconfigured"),
}).strict();
export type DemoPool = z.infer<typeof demoPoolSchema>;
export const grantInputSchema = z.object({
  id: z.string().uuid(), scope: demoScopeSchema,
  hours: z.number().finite().positive().max(24), reason: z.string().trim().min(8).max(500),
}).strict();
export const demoGrantSchema = grantInputSchema.extend({
  employeeId: z.string(), status: z.enum(["PENDING", "APPROVED", "REJECTED", "REVOKED"]),
  version: z.number().int().nonnegative(), createdAt: z.string().datetime(),
  decidedBy: z.string().optional(), decidedAt: z.string().datetime().optional(),
  decisionReason: z.string().optional(), expiresAt: z.string().datetime().optional(),
  assurance: z.literal("demo"),
}).strict();
export type DemoGrant = z.infer<typeof demoGrantSchema>;
export const demoDecisionSchema = z.object({
  id: z.string().uuid(), version: z.number().int().nonnegative(),
  action: z.enum(["approve", "reject", "revoke"]), reason: z.string().trim().min(8).max(500),
}).strict();
export const usageInputSchema = z.object({
  version: z.number().int().nonnegative(), used: capacitySchema, reserved: capacitySchema,
  observedAt: z.string().datetime(), validUntil: z.string().datetime(),
  reason: z.string().trim().min(8).max(500),
}).strict();
export const capacityCheckSchema = z.object({
  scope: demoScopeSchema, requested: capacitySchema, hours: z.number().finite().positive().max(8760),
}).strict();
export function validObservation(pool: Pick<DemoPool, "observedAt" | "validUntil">, now: number) {
  return Date.parse(pool.observedAt) <= now && now < Date.parse(pool.validUntil) &&
    Date.parse(pool.observedAt) < Date.parse(pool.validUntil);
}
export function checkDemoCapacity(pool: DemoPool | null, requested: Capacity, hours: number, now: number) {
  capacitySchema.parse(requested);
  z.number().finite().positive().parse(hours);
  if (!pool || !validObservation(pool, now))
    return { status: "unavailable" as const, reason: "Thiếu hoặc hết hiệu lực dữ liệu quota/usage. Cần Capacity owner xác minh." };
  const exceeded = (Object.keys(requested) as Array<keyof Capacity>).filter(
    (key) => pool.used[key] + pool.reserved[key] + requested[key] > pool.limits[key],
  );
  if (exceeded.length || hours > pool.maxHours)
    return { status: "exceeded" as const, reason: `Cần owner xem xét: ${[...exceeded, ...(hours > pool.maxHours ? ["thời hạn trên 24 giờ"] : [])].join(", ")}.` };
  return { status: "owner_required" as const, reason: "Trong quota tài nguyên demo, nhưng chưa cấu hình/xác minh ngân sách. Chuyển Capacity owner; chưa được cấp tài nguyên." };
}
export function hasDemoGrant(grants: DemoGrant[], employeeId: string, scope: z.infer<typeof demoScopeSchema>, hours: number, now: number) {
  demoScopeSchema.parse(scope);
  if (!Number.isFinite(hours) || hours <= 0) return false;
  return grants.some((grant) => grant.assurance === "demo" && grant.status === "APPROVED" &&
    grant.employeeId === employeeId && grant.decidedBy && grant.decidedBy !== employeeId &&
    grant.scope.target === scope.target && grant.scope.environment === scope.environment &&
    grant.scope.resource === scope.resource && grant.scope.operation === scope.operation &&
    grant.expiresAt && Date.parse(grant.expiresAt) >= now + hours * 3_600_000);
}
