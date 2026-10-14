import { beforeEach, expect, it, vi } from "vitest";
import { demoLimits, demoPoolSchema, capacityCheckSchema, grantInputSchema, checkDemoCapacity, hasDemoGrant, type DemoPool, type DemoGrant } from "@/domain/demo-authority";
import { requestDemoGrant, decideDemoGrant, updateDemoUsage, checkDemoAuthority } from "@/services/demo-authority";
import type { EmployeeAccount } from "@/domain/identity";
// Test-only transactional double. No claim of MongoDB concurrency/persistence evidence.
const fake = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, unavailable: false, failAudit: false }));
vi.mock("@/lib/identity-store", () => {
  function match(row: Record<string, unknown>, query: Record<string, unknown>) {
    return Object.entries(query).every(([key, value]) => {
      const actual = key.split(".").reduce<unknown>((current, field) => (current as Record<string, unknown>)?.[field], row);
      if (value && typeof value === "object" && "$gte" in value) return String(actual) >= String(value.$gte);
      return actual === value;
    });
  }
  const db = { collection: (name: string) => {
    const rows = fake.rows[name] ??= [];
    return {
      findOne: async (query: Record<string, unknown>) => structuredClone(rows.find((row) => match(row, query)) ?? null),
      insertOne: async (row: Record<string, unknown>) => { if (fake.failAudit && name === "identity_audit") throw new Error("AUDIT_UNAVAILABLE"); rows.push(structuredClone(row)); return { acknowledged: true }; },
      updateOne: async (query: Record<string, unknown>, update: { $set?: Record<string, unknown>; $inc?: Record<string, number> }) => {
        const row = rows.find((row) => match(row, query)); if (!row) return { modifiedCount: 0 };
        Object.assign(row, update.$set); for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = Number(row[key]) + value;
        return { modifiedCount: 1 };
      },
      find: (query: Record<string, unknown>) => { const cursor = { sort: () => cursor, limit: () => cursor, toArray: async () => structuredClone(rows.filter((row) => match(row, query))) }; return cursor; },
    };
  } };
  const identityStore = async () => { if (fake.unavailable) throw new Error("DB_UNAVAILABLE"); return { db }; };
  return { identityStore, identityTransaction: async (work: (db: unknown, session: object) => Promise<unknown>) => {
    await identityStore(); const snapshot = structuredClone(fake.rows);
    try { return await work(db, {}); } catch (error) { fake.rows = snapshot; throw error; }
  } };
});
const zero = { cpu: 0, ramGb: 0, diskGb: 0, gpuT4: 0 };
const scope = { target: "DEMO-SANDBOX", environment: "sandbox", resource: "cloud", operation: "create" } as const;
const pool = (): DemoPool => ({ id: "DEMO-SANDBOX", assurance: "demo", version: 0, ownerIds: ["demoit"], limits: demoLimits, used: { ...zero }, reserved: { ...zero },
  observedAt: new Date(Date.now() - 1000).toISOString(), validUntil: new Date(Date.now() + 3_600_000).toISOString(), maxHours: 24, budget: "unconfigured" });
const request = () => ({ id: crypto.randomUUID(), scope, hours: 4, reason: "Thử nghiệm dữ liệu giả lập" });
beforeEach(() => { fake.rows = { identity_demo_pool: [pool()], identity_employees: [
  { id: "demoit", status: "ACTIVE", roles: ["identity-admin"] }, { id: "demouser", status: "ACTIVE", roles: [] }, { id: "otherit", status: "ACTIVE", roles: ["identity-admin"] },
] }; fake.unavailable = false; fake.failAudit = false; });
it("includes both running usage and reservations, distinguishes GPU type and never verifies an absent budget", () => {
  const p = pool(); p.used.cpu = 12; p.reserved.cpu = 2;
  expect(checkDemoCapacity(p, { ...zero, cpu: 4 }, 6, Date.now()).status).toBe("exceeded");
  expect(checkDemoCapacity(p, { ...zero, cpu: 2 }, 24, Date.now()).status).toBe("owner_required");
  expect(checkDemoCapacity(p, zero, 48, Date.now()).status).toBe("exceeded");
  expect(() => capacityCheckSchema.parse({ scope, requested: { ...zero, gpuA100: 1 }, hours: 4 })).toThrow();
});
it("missing/stale/future observation is unavailable; no implicit zero or expiry reclamation", () => {
  expect(checkDemoCapacity(null, zero, 1, Date.now()).status).toBe("unavailable");
  const p = pool(); p.validUntil = new Date(0).toISOString(); p.reserved.gpuT4 = 4;
  expect(checkDemoCapacity(p, zero, 1, Date.now()).status).toBe("unavailable"); expect(p.reserved.gpuT4).toBe(4);
  p.observedAt = new Date(Date.now() + 60000).toISOString(); p.validUntil = new Date(Date.now() + 120000).toISOString();
  expect(checkDemoCapacity(p, zero, 1, Date.now()).status).toBe("unavailable");
  expect(() => demoPoolSchema.parse({ ...pool(), used: undefined })).toThrow();
});
it.each(["*", "demo/docs", "DEMO-SANDBOX/other"])("rejects unassigned target %s", (target) => {
  expect(() => grantInputSchema.parse({ ...request(), scope: { ...scope, target } })).toThrow();
});
it.each(["production", "staging"])("does not broaden the owner scope to %s", (environment) => {
  expect(() => grantInputSchema.parse({ ...request(), scope: { ...scope, environment } })).toThrow();
});
it("rejects client-supplied identity/authority, nonfinite quantities and negative resources", () => {
  expect(() => grantInputSchema.parse({ ...request(), employeeId: "demoit", status: "APPROVED" })).toThrow();
  for (const cpu of [-1, Infinity, NaN]) expect(() => checkDemoCapacity(pool(), { ...zero, cpu }, 1, Date.now())).toThrow();
});
it("persists pending request idempotently and records a bounded approval/expiry with audit", async () => {
  const input = request(); const first = await requestDemoGrant(input, "demouser");
  expect(first.status).toBe("PENDING"); expect(await requestDemoGrant(input, "demouser")).toEqual(first);
  await expect(requestDemoGrant({ ...input, hours: 8 }, "demouser")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  const result = await decideDemoGrant({ id: first.id, version: 0, action: "approve", reason: "Duyệt thử nghiệm trong phạm vi demo" }, "demoit");
  expect(result).toMatchObject({ status: "APPROVED", decidedBy: "demoit", assurance: "demo", version: 1 });
  expect(Date.parse(result.expiresAt!) - Date.parse(result.decidedAt!)).toBe(4 * 3_600_000);
  expect(fake.rows.identity_audit.map((row) => row.action)).toEqual(["DEMO_GRANT_REQUESTED", "DEMO_GRANT_APPROVED"]);
  await expect(decideDemoGrant({ id: first.id, version: 0, action: "approve", reason: "Đơn đã được xử lý trước" }, "demoit")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
});
it("ordinary IT without a matching owner assignment cannot decide or update quota", async () => {
  const first = await requestDemoGrant(request(), "demouser");
  for (const actor of ["demouser", "otherit"]) await expect(decideDemoGrant({ id: first.id, version: 0, action: "approve", reason: "Không có quyền trên đích này" }, actor)).rejects.toMatchObject({ code: "RESOURCE_OWNER_REQUIRED" });
});
it("forbids self approval and rechecks revoked IT role / inactive recipient", async () => {
  const self = await requestDemoGrant(request(), "demoit");
  await expect(decideDemoGrant({ id: self.id, version: 0, action: "approve", reason: "Thử tự duyệt bị từ chối" }, "demoit")).rejects.toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
  const row = await requestDemoGrant(request(), "demouser"); fake.rows.identity_employees[1].status = "DISABLED";
  await expect(decideDemoGrant({ id: row.id, version: 0, action: "approve", reason: "ID đã bị vô hiệu hóa" }, "demoit")).rejects.toMatchObject({ status: 401 });
  fake.rows.identity_employees[0].roles = [];
  await expect(decideDemoGrant({ id: row.id, version: 0, action: "reject", reason: "IT đã bị thu hồi role" }, "demoit")).rejects.toMatchObject({ status: 403 });
});
it("rolls back approval and pool version if audit fails", async () => {
  const row = await requestDemoGrant(request(), "demouser"); fake.failAudit = true;
  await expect(decideDemoGrant({ id: row.id, version: 0, action: "approve", reason: "Audit phải thành công cùng giao dịch" }, "demoit")).rejects.toThrow("AUDIT_UNAVAILABLE");
  expect(fake.rows.identity_demo_grants[0].status).toBe("PENDING"); expect(fake.rows.identity_demo_pool[0].version).toBe(0);
});
it("fails Mongo writes without fallback or receipt when unavailable/unconfigured", async () => {
  fake.unavailable = true; await expect(requestDemoGrant(request(), "demouser")).rejects.toThrow("DB_UNAVAILABLE");
  fake.unavailable = false; fake.rows.identity_demo_pool = [];
  await expect(requestDemoGrant(request(), "demouser")).rejects.toMatchObject({ code: "DEMO_NOT_CONFIGURED" });
  expect(fake.rows.identity_demo_grants ?? []).toHaveLength(0);
});
it("does not authorize a longer duration, wrong operation, expired or revoked grant", async () => {
  const row = await requestDemoGrant(request(), "demouser"); const approved = await decideDemoGrant({ id: row.id, version: 0, action: "approve", reason: "Thử nghiệm entitlement có thời hạn" }, "demoit");
  const check = (grant: DemoGrant, hours = 1) => hasDemoGrant([grant], "demouser", scope, hours, Date.now());
  expect(check(approved)).toBe(true); expect(check(approved, 5)).toBe(false);
  expect(check({ ...approved, scope: { ...scope, operation: "read" } })).toBe(false);
  expect(check({ ...approved, expiresAt: new Date(0).toISOString() })).toBe(false);
  const revoked = await decideDemoGrant({ id: row.id, version: 1, action: "revoke", reason: "Kết thúc quyền thử nghiệm sớm" }, "demoit");
  expect(check(revoked)).toBe(false);
  await expect(decideDemoGrant({ id: row.id, version: 2, action: "approve", reason: "Không được gia hạn đơn đã kết thúc" }, "demoit")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
});
it("rejects a refused grant permanently and requires a new request", async () => {
  const row = await requestDemoGrant(request(), "demouser");
  await decideDemoGrant({ id: row.id, version: 0, action: "reject", reason: "Chưa đủ căn cứ cho nhu cầu demo" }, "demoit");
  expect(fake.rows.identity_demo_grants[0].status).toBe("REJECTED");
  expect(fake.rows.identity_demo_grants[0].expiresAt).toBeUndefined();
});
it("updates observed usage with CAS and audit, never automatically frees reservations", async () => {
  const value = { version: 0, used: { ...zero, cpu: 12 }, reserved: { ...zero, cpu: 2 }, observedAt: pool().observedAt, validUntil: pool().validUntil, reason: "Quan sát dữ liệu quota mô phỏng" };
  const updated = await updateDemoUsage(value, "demoit"); expect(updated.version).toBe(1); expect(updated.reserved.cpu).toBe(2);
  await expect(updateDemoUsage(value, "demoit")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  await expect(updateDemoUsage({ ...value, version: 1 }, "otherit")).rejects.toMatchObject({ code: "RESOURCE_OWNER_REQUIRED" });
});
it("even approved demo entitlement and remaining quota cannot pass absent budget or execute", async () => {
  const row = await requestDemoGrant(request(), "demouser");
  await decideDemoGrant({ id: row.id, version: 0, action: "approve", reason: "Duyệt entitlement demo độc lập capacity" }, "demoit");
  const result = await checkDemoAuthority({ scope, requested: { ...zero, cpu: 2 }, hours: 1 }, { id: "demouser" } as EmployeeAccount);
  expect(result).toMatchObject({ entitlement: "demo-allowed", quota: { status: "owner_required" }, budget: "unconfigured", executed: false, assurance: "demo" });
  expect(fake.rows.identity_demo_pool[0].reserved).toEqual(zero);
});
