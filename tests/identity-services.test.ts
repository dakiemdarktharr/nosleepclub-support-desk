import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Scope } from "@/domain/identity";
import { decideIdentityApplication, submitIdentityApplication, trackIdentityApplication } from "@/services/identity";
import { requireIdentitySession, startIdentityLogin, verifyIdentityLogin } from "@/lib/identity-auth";
import { identityHash } from "@/services/identity";
import { requireEmployeeIdentity } from "@/lib/support-http";
// Test-only adapter models rollback and compare-and-set; it is never a runtime fallback.
const fake = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, unavailable: false, failAudit: false }));
vi.mock("@/lib/identity-store", () => {
  function match(row: Record<string, unknown>, query: Record<string, unknown>) {
    return Object.entries(query).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Date)) {
        const rule = value as Record<string, unknown>;
        if ("$in" in rule) return (rule.$in as unknown[]).includes(row[key]);
        if ("$gt" in rule) return (row[key] as number) > (rule.$gt as number);
        if ("$lt" in rule) return (row[key] as number) < (rule.$lt as number);
      }
      return row[key] === value;
    });
  }
  function patch(row: Record<string, unknown>, update: Record<string, Record<string, unknown>>) {
    Object.assign(row, update.$set);
    for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = Number(row[key] ?? 0) + Number(value);
  }
  const db = { collection: (name: string) => {
    const rows = fake.rows[name] ??= [];
    return {
      findOne: async (query: Record<string, unknown>) => structuredClone(rows.find((row) => match(row, query)) ?? null),
      insertOne: async (row: Record<string, unknown>) => { if (fake.failAudit && name === "identity_audit") throw new Error("AUDIT_UNAVAILABLE"); rows.push(structuredClone(row)); return { acknowledged: true }; },
      updateOne: async (query: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => { const row = rows.find((row) => match(row, query)); if (row) patch(row, update); return { modifiedCount: row ? 1 : 0 }; },
      findOneAndUpdate: async (query: Record<string, unknown>, update: Record<string, Record<string, unknown>>, options?: { upsert?: boolean }) => {
        let row = rows.find((row) => match(row, query));
        if (!row && options?.upsert) { row = { ...query, ...update.$setOnInsert }; rows.push(row); }
        if (row) patch(row, update); return structuredClone(row ?? null);
      },
    };
  } };
  const store = async () => { if (fake.unavailable) throw new Error("DB_UNAVAILABLE"); return { db }; };
  return { identityStore: store, identityTransaction: async (work: (db: unknown, session: unknown) => Promise<unknown>) => {
    await store(); const snapshot = structuredClone(fake.rows);
    try { return await work(db, {}); } catch (error) { fake.rows = snapshot; throw error; }
  } };
});
const scope: Scope = { environment: "sandbox", resource: "project", operation: "read", target: "project-demo" };
const input = () => ({ id: randomUUID(), trackingToken: "a".repeat(64), fullName: "Nhân Viên Giả Lập Alpha", job: { kind: "new" as const, name: "Job giả lập", scopes: [scope] } });
const decision = { action: "approve", version: 0, reason: "Đã xác minh qua quy trình thử nghiệm", approvedScopes: [scope] };
beforeEach(() => { fake.rows = {}; fake.unavailable = false; fake.failAudit = false; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("persists pending applications idempotently without issuing an ID", async () => {
  const request = input(); await submitIdentityApplication(request); await submitIdentityApplication(request);
  expect(fake.rows.identity_applications).toHaveLength(1); expect(fake.rows.identity_employees).toBeUndefined();
  expect(fake.rows.identity_applications[0]).not.toHaveProperty("trackingToken");
  expect((await trackIdentityApplication(request.id, request.trackingToken)).employeeId).toBeUndefined();
  await expect(submitIdentityApplication({ ...request, fullName: "Nhân Viên Giả Lập Beta" })).rejects.toMatchObject({ code: "APPLICATION_CONFLICT" });
});
it("requires the private tracking capability", async () => {
  const request = input(); await submitIdentityApplication(request);
  await expect(trackIdentityApplication(request.id, "b".repeat(64))).rejects.toMatchObject({ status: 404 });
});
it("creates a pinned profile, account and audit only after approval", async () => {
  const request = input(); await submitIdentityApplication(request); const result = await decideIdentityApplication(request.id, decision, "verified-it");
  expect(result.employeeId).toBe("alphanvgl"); expect(fake.rows.identity_employees[0].roles).toEqual([]);
  expect(fake.rows.identity_profiles[0]).toMatchObject({ version: 1, scopes: [scope] });
  expect((await trackIdentityApplication(request.id, request.trackingToken)).grantedScopes).toEqual([scope]);
  expect(fake.rows.identity_audit.map((row) => row.action)).toEqual(["APPLICATION_SUBMITTED", "PROFILE_CREATED", "APPROVED"]);
  await expect(decideIdentityApplication(request.id, decision, "verified-it")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
});
it("pins existing job permissions and refuses permission modification", async () => {
  const profile = { id: randomUUID(), version: 2, active: true, scopes: [scope], name: "Profile giả lập", createdAt: new Date().toISOString(), createdBy: "operator" };
  fake.rows.identity_profiles = [profile]; const request = { ...input(), job: { kind: "existing", profileId: profile.id, version: 2 } };
  await submitIdentityApplication(request);
  await expect(decideIdentityApplication(request.id, decision, "verified-it")).rejects.toMatchObject({ code: "PROFILE_IMMUTABLE" });
  await decideIdentityApplication(request.id, { action: "approve", version: 0, reason: decision.reason }, "verified-it");
  expect(fake.rows.identity_profiles).toHaveLength(1); expect(fake.rows.identity_employees[0].profileVersion).toBe(2);
});
it("does not grant scopes outside the submitted request", async () => {
  const request = input(); await submitIdentityApplication(request);
  await expect(decideIdentityApplication(request.id, { ...decision, approvedScopes: [{ ...scope, target: "another-project" }] }, "verified-it")).rejects.toMatchObject({ code: "SCOPE_ESCALATION" });
  expect(fake.rows.identity_employees ?? []).toHaveLength(0);
});
it("keeps rejected applications and reasons without accounts", async () => {
  const request = input(); await submitIdentityApplication(request);
  await decideIdentityApplication(request.id, { action: "reject", version: 0, reason: "Cần xác minh lại phạm vi công việc" }, "verified-it");
  expect((await trackIdentityApplication(request.id, request.trackingToken))).toMatchObject({ status: "REJECTED", reason: "Cần xác minh lại phạm vi công việc" });
  expect(fake.rows.identity_employees).toBeUndefined();
});
it("records collisions and requires deliberate IT disambiguation", async () => {
  const first = input(); await submitIdentityApplication(first); await decideIdentityApplication(first.id, decision, "verified-it");
  const second = input(); await submitIdentityApplication(second);
  await expect(decideIdentityApplication(second.id, { ...decision, suffix: "2" }, "verified-it")).rejects.toMatchObject({ code: "SUFFIX_NOT_NEEDED" });
  await expect(decideIdentityApplication(second.id, decision, "verified-it")).rejects.toMatchObject({ code: "ID_COLLISION" });
  expect((await trackIdentityApplication(second.id, second.trackingToken)).status).toBe("ID_CONFLICT");
  await decideIdentityApplication(second.id, { ...decision, version: 1, suffix: "2" }, "verified-it");
  expect(fake.rows.identity_employees.map((row) => row.id)).toEqual(["alphanvgl", "alphanvgl-2"]);
});
it("rolls back profile/account/decision when audit writing fails", async () => {
  const request = input(); await submitIdentityApplication(request); fake.failAudit = true;
  await expect(decideIdentityApplication(request.id, decision, "verified-it")).rejects.toThrow("AUDIT_UNAVAILABLE");
  expect(fake.rows.identity_employees ?? []).toHaveLength(0); expect(fake.rows.identity_profiles ?? []).toHaveLength(0);
  expect(fake.rows.identity_applications[0].status).toBe("PENDING");
});
it("fails all application writes when Mongo is unavailable", async () => {
  fake.unavailable = true; await expect(submitIdentityApplication(input())).rejects.toThrow("DB_UNAVAILABLE"); expect(fake.rows).toEqual({});
});
async function account() { const request = input(); await submitIdentityApplication(request); await decideIdentityApplication(request.id, decision, "verified-it"); return fake.rows.identity_employees[0]; }
it("permits an active issued ID in labelled demo mode but never grants IT authority", async () => {
  const employee = await account(); employee.roles = ["identity-admin"];
  const login = await startIdentityLogin({ employeeId: "ALPHANVGL" }); expect(login.assurance).toBe("demo");
  const request = new Request("http://localhost", { headers: { cookie: `vng_identity=${login.token}` } });
  expect((await requireIdentitySession(request)).assurance).toBe("demo");
  await expect(requireIdentitySession(request, true)).rejects.toMatchObject({ status: 403 });
  employee.status = "DISABLED"; await expect(requireIdentitySession(request)).rejects.toMatchObject({ status: 401 });
});
it("rejects unknown or disabled IDs without creating sessions", async () => {
  await expect(startIdentityLogin({ employeeId: "unknown" })).rejects.toMatchObject({ status: 401 });
  const employee = await account(); employee.status = "DISABLED";
  await expect(startIdentityLogin({ employeeId: "alphanvgl" })).rejects.toMatchObject({ status: 401 });
  expect(fake.rows.identity_sessions ?? []).toHaveLength(0);
});
it("binds submitted Support identity to the active session instead of trusting changed form data", async () => {
  await account(); const login = await startIdentityLogin({ employeeId: "alphanvgl" });
  const request = new Request("http://localhost", { headers: { cookie: `vng_identity=${login.token}` } });
  const body = { mode: "freeform", serviceGroup: "NETWORK_VPN", rawText: "VPN không kết nối", fields: { department: "engineering", employeeId: "someone-else" }, confirmed: false, idempotencyKey: randomUUID() };
  await expect(requireEmployeeIdentity(body, request)).rejects.toMatchObject({ code: "IDENTITY_MISMATCH", status: 403 });
  expect((await requireEmployeeIdentity({ ...body, fields: { ...body.fields, employeeId: "ALPHANVGL" } }, request)).fields.employeeId).toBe("alphanvgl");
});
it("does not silently upgrade demo sessions when OTP relay/channel is missing", async () => {
  await account(); await expect(startIdentityLogin({ employeeId: "alphanvgl", verified: true })).rejects.toMatchObject({ code: "VERIFICATION_UNAVAILABLE" });
  expect(fake.rows.identity_sessions ?? []).toHaveLength(0);
});
it("delivers OTP only to the trusted channel, consumes once and checks admin separately", async () => {
  const employee = await account(); employee.verifiedChannel = { destination: "synthetic@example.invalid", verifiedBy: "operator", verifiedAt: new Date().toISOString() };
  vi.stubEnv("IDENTITY_OTP_RELAY_URL", "https://relay.example.invalid/send"); vi.stubEnv("IDENTITY_OTP_RELAY_TOKEN", "synthetic-token"); vi.stubEnv("IDENTITY_OTP_SIGNING_KEY", "x".repeat(32));
  const relay = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", relay);
  const started = await startIdentityLogin({ employeeId: "alphanvgl", verified: true }); expect(started).not.toHaveProperty("code");
  const delivered = JSON.parse(relay.mock.calls[0][1].body); expect(delivered.destination).toBe("synthetic@example.invalid");
  const login = await verifyIdentityLogin({ challengeId: started.challengeId, code: delivered.code });
  expect(fake.rows.identity_sessions[0].hash).toBe(identityHash(login.token));
  await expect(verifyIdentityLogin({ challengeId: started.challengeId, code: delivered.code })).rejects.toMatchObject({ status: 401 });
  const request = new Request("http://localhost", { headers: { cookie: `vng_identity=${login.token}` } });
  await expect(requireIdentitySession(request, true)).rejects.toMatchObject({ status: 403 });
  employee.roles = ["identity-admin"]; expect((await requireIdentitySession(request, true)).assurance).toBe("verified");
});
it.each(['expired', 'exhausted', 'channel-changed', 'delivery-failed'])("rejects unusable OTP: %s", async (failure) => {
  const employee = await account(); employee.verifiedChannel = { destination: "synthetic@example.invalid", verifiedBy: "operator", verifiedAt: new Date().toISOString() };
  vi.stubEnv("IDENTITY_OTP_RELAY_URL", "https://relay.example.invalid/send"); vi.stubEnv("IDENTITY_OTP_RELAY_TOKEN", "synthetic-token"); vi.stubEnv("IDENTITY_OTP_SIGNING_KEY", "x".repeat(32));
  const relay = vi.fn().mockResolvedValue({ ok: failure !== "delivery-failed" }); vi.stubGlobal("fetch", relay);
  if (failure === "delivery-failed") {
    await expect(startIdentityLogin({ employeeId: "alphanvgl", verified: true })).rejects.toMatchObject({ code: "OTP_DELIVERY_FAILED" });
    expect(fake.rows.identity_challenges[0].used).toBe(true);
  } else {
    const started = await startIdentityLogin({ employeeId: "alphanvgl", verified: true });
    const delivered = JSON.parse(relay.mock.calls[0][1].body);
    if (failure === "expired") fake.rows.identity_challenges[0].expiresAt = new Date(0);
    if (failure === "channel-changed") employee.verifiedChannel = { destination: "changed@example.invalid", verifiedBy: "operator", verifiedAt: new Date().toISOString() };
    if (failure === "exhausted") for (let attempt = 0; attempt < 5; attempt++) await expect(verifyIdentityLogin({ challengeId: started.challengeId, code: "000000" })).rejects.toMatchObject({ code: "INVALID_OTP" });
    await expect(verifyIdentityLogin({ challengeId: started.challengeId, code: delivered.code })).rejects.toMatchObject({ code: "INVALID_OTP" });
  }
  expect(fake.rows.identity_sessions ?? []).toHaveLength(0);
});
