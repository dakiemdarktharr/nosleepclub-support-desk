import { expect, it } from "vitest";
import { applicationInputSchema, decisionSchema, evaluateScope, generateEmployeeId, scopeSchema, scopeRisk, type Scope } from "@/domain/identity";
const scope: Scope = { environment: "sandbox", resource: "project", operation: "read", target: "project-demo/task-01" };
it.each([["Phạm Quang Minh Hòa", "hoapqm"], ["Trần Ngọc Anh", "anhtn"], ["  ĐẶNG   ĐỨC ĐẠT ", "datdd"], ["Nhân Viên Giả Lập Alpha", "alphanvgl"], ["Hòa".normalize("NFD"), "hoa"]])("generates Vietnamese ID for %s", (name, id) => expect(generateEmployeeId(name)).toBe(id));
it.each(["", "   ", "Demo *", "Name 123", "A".repeat(33)])("rejects malformed names %s", (name) => expect(() => generateEmployeeId(name)).toThrow());
it.each(["*", "all", "ANY", "db/*", "../prod", "project/../prod", "root"])("rejects unbounded targets %s", (target) => expect(scopeSchema.safeParse({ ...scope, target }).success).toBe(false));
it("checks exact operation, resource, environment and target on the server", () => {
  expect(evaluateScope([scope], scope).allowed).toBe(true);
  for (const patch of [{ target: "other-project" }, { resource: "logs" }, { environment: "staging" }, { operation: "update" }] as Partial<Scope>[]) expect(evaluateScope([scope], { ...scope, ...patch }).allowed).toBe(false);
});
it("never grants production, secrets, keys, root, exports or destructive operations merely through a profile", () => {
  for (const patch of [{ environment: "production" }, { resource: "secrets" }, { resource: "keys" }, { resource: "administration" }, { operation: "export" }, { operation: "delete" }, { operation: "approve" }] as Partial<Scope>[]) {
    const sensitive = { ...scope, ...patch }; expect(scopeRisk(sensitive)).not.toBeNull(); expect(evaluateScope([sensitive], sensitive).allowed).toBe(false);
  }
});
it("rejects self-declared roles, contact details and duplicate scopes", () => {
  const input = { id: "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb", trackingToken: "a".repeat(64), fullName: "Nhân Viên Giả Lập Alpha", job: { kind: "new", name: "Job giả lập", scopes: [scope] } };
  expect(applicationInputSchema.safeParse(input).success).toBe(true);
  for (const extra of [{ roles: ["identity-admin"] }, { email: "demo@example.invalid" }]) expect(applicationInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  expect(applicationInputSchema.safeParse({ ...input, job: { ...input.job, scopes: [scope, scope] } }).success).toBe(false);
  expect(decisionSchema.safeParse({ version: 0, action: "approve", reason: "x" }).success).toBe(false);
});
