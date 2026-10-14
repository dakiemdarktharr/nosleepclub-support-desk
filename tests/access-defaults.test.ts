import { afterEach, expect, it, vi } from "vitest";
import { extractIntake } from "@/domain/text";
import { evaluatePolicy, type PolicyEvidence } from "@/domain/policy";
import { verifyApproval } from "@/services/approvals";
import { proposeAccessDuration, jiraRoleProfile } from "@/domain/access-defaults";
import { previewSupport } from "@/services/support";
import { resetSupportTestStore } from "@/lib/support-repository";
import type { CanonicalRequest, SupportInput } from "@/domain/contracts";
const input = (text: string): SupportInput => ({ rawText: text, mode: "freeform", serviceGroup: "OTHER", fields: {}, requesterMode: "guest", confirmed: false, idempotencyKey: crypto.randomUUID() });
const git = (): CanonicalRequest => extractIntake(input("Xin read-only repo demo/docs trên GitHub để kiểm tra hướng dẫn thử nghiệm."));
afterEach(() => vi.unstubAllEnvs());
it.each([["read-only", 8], ["write", 4]] as const)("proposes %s duration without adding a fact or approval", (permission, hours) => {
  const request = git(); request.entities.permission = permission;
  const before = JSON.stringify(request);
  expect(proposeAccessDuration(request)).toMatchObject({ hours, value: `${hours} hours` });
  expect(JSON.stringify(request)).toBe(before);
  expect(evaluatePolicy(request, verifyApproval).action).not.toBe("AUTO_APPROVE");
});
it.each(["2 hours", "forever", "0 hours", "-1 hours"])("does not replace an explicit duration %s", (duration) => {
  const request = git(); request.entities.duration = duration; expect(proposeAccessDuration(request)).toBeNull();
});
it.each(["admin", "root", "unknown"])("does not propose a duration for %s permission", (permission) => {
  const request = git(); request.entities.permission = permission; expect(proposeAccessDuration(request)).toBeNull();
});
it("excludes production, risks, multiple requests and sensitive data", () => {
  const request = git();
  expect(proposeAccessDuration({ ...request, environment: "production" })).toBeNull();
  expect(proposeAccessDuration({ ...request, riskSignals: ["USER_HANDOFF"] })).toBeNull();
  expect(proposeAccessDuration({ ...request, subrequests: [request] })).toBeNull();
  expect(proposeAccessDuration({ ...request, entities: { ...request.entities, dataSensitivity: "customer" } })).toBeNull();
});
it("proposes VPN 8h only with QA/dev target and source, never for unknown or production network", () => {
  const request = { ...git(), serviceGroup: "NETWORK_VPN", intentLabel: "VPN_SETUP", environment: "development",
    entities: { service: "VPN", source: "managed laptop", target: "QA subnet" } } as CanonicalRequest;
  expect(proposeAccessDuration(request)?.hours).toBe(8);
  expect(proposeAccessDuration({ ...request, environment: "unknown" })).toBeNull();
  expect(proposeAccessDuration({ ...request, entities: { source: "managed laptop" } })).toBeNull();
});
it.each([["role Developer", "developer-assigned", "assigned-tickets"], ["quyền standard agent", "agent-assigned", "assigned-queue"]])(
  "maps %s to bounded operations, never an entitlement", (role, permission, scope) => {
    const request = extractIntake(input(`Xin ${role} trong Jira project DEMO để xử lý công việc thử nghiệm.`));
    expect(request.entities.accessType).toBe(permission);
    expect(jiraRoleProfile(permission)?.scope).toBe(scope);
    expect(proposeAccessDuration(request)?.hours).toBe(4);
    request.entities.duration = "4 hours";
    expect(evaluatePolicy(request, verifyApproval).action).not.toBe("AUTO_APPROVE");
  },
);
it("retains the narrower named role when ordinary ticket operations are also described", () => {
  const request = extractIntake(input("Xin role Developer trong Jira project DEMO để create tickets cho kiểm thử."));
  expect(request.entities.accessType).toBe("developer-assigned");
  expect(request.riskSignals).not.toContain("CONFLICT");
});
it("unknown and negated Jira roles do not acquire a role mapping", () => {
  for (const role of ["role Wizard", "không cần role Developer"]) {
    const request = extractIntake(input(`Xin truy cập Jira project DEMO; ${role}.`));
    expect(request.entities.accessType).not.toBe("developer-assigned");
  }
});
it("a named role needs server evidence for assignment boundaries even when the action mentions editing tickets", () => {
  const request = extractIntake(input("Xin role Developer trong Jira project DEMO để xử lý công việc thử nghiệm."));
  request.environment = "sandbox"; request.entities.duration = "4 hours"; request.requestedAction = "edit ticket";
  const evidence: PolicyEvidence = { entitlement: { status: "allowed", scope: "matched", requesterAuthenticated: true, requesterIdentityMatched: true, source: "synthetic-test-adapter" }, accessTtlWithinPolicy: true, dataClassification: "ordinary" };
  expect(evaluatePolicy(request, verifyApproval, evidence).action).not.toBe("AUTO_APPROVE");
  expect(evaluatePolicy(request, verifyApproval, { ...evidence, jiraRoleScope: "assigned-queue" }).action).not.toBe("AUTO_APPROVE");
  expect(evaluatePolicy(request, verifyApproval, { ...evidence, jiraRoleScope: "assigned-tickets" }).action).toBe("AUTO_APPROVE");
});
it("preview exposes a proposal; explicitly applying it still cannot bypass entitlement", async () => {
  vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("SUPPORT_STORAGE", "memory-demo"); resetSupportTestStore();
  const value = input("Xin read-only repo demo/docs trên GitHub để kiểm tra hướng dẫn thử nghiệm.");
  const preview = await previewSupport(value);
  expect(preview.durationProposal?.hours).toBe(8);
  expect(preview.input.fields.duration).toBeUndefined();
  expect(preview.canonical.entities.duration).toBeUndefined();
  const applied = await previewSupport({ ...value, fields: { duration: "8 hours" } });
  expect(applied.durationProposal).toBeNull();
  expect(applied.decision.action).not.toBe("AUTO_APPROVE");
});
