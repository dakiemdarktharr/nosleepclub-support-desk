import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupportInput } from "@/domain/contracts";
import { catalog } from "@/domain/catalog";
import { evaluatePolicy, missingFacts } from "@/domain/policy";
import { questionFor } from "@/domain/questions";
import { extractIntake } from "@/domain/text";
import { verifyApproval } from "@/services/approvals";
import { supportVerifyCases } from "@/lib/support-verify";
import { resetSupportTestStore } from "@/lib/support-repository";
import { submitSupport } from "@/services/support";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
function input(rawText: string, fields: Record<string, string> = {}): SupportInput {
  return { rawText, mode: "freeform", serviceGroup: "OTHER", confirmed: true,
    idempotencyKey: crypto.randomUUID(),
    fields: { department: "engineering", employeeId: "EMP-TEST-01", ...fields } };
}
function original(id: string) {
  const row = supportVerifyCases.find((item) => item.id === id);
  if (!row) throw new Error(`Missing original ${id}`);
  return extractIntake(input(row.rawText));
}

it.each(["TC001", "gt-routine-004-vpn-data-oncall", "gt-routine-010-vpn-qa-network"])(
  "asks for access facts rather than diagnostic symptoms for original VPN provisioning: %s", (id) => {
    const request = original(id);
    expect(request).toMatchObject({ intentLabel: "VPN_SETUP", requestKind: "ACCESS_REQUEST" });
    const missing = missingFacts(request);
    for (const field of ["symptom", "urgency", "requestedAction"])
      expect(missing).not.toContain(field);
    expect(missing).toContain("duration");
    expect(missing).not.toContain("reason");
    expect(evaluatePolicy(request, verifyApproval(request)).action).not.toBe("AUTO_APPROVE");
  },
);
it("uses database sizing facts instead of database-access permission for original TC007", () => {
  const request = original("TC007");
  const missing = missingFacts(request);
  expect(missing).toEqual(expect.arrayContaining(["cpu", "ram", "disk", "duration"]));
  expect(missing).not.toContain("permission"); expect(missing).not.toContain("resourceScope");
  expect(evaluatePolicy(request)).toMatchObject({ action: "ESCALATE", bucket: "MISSING_INFO" });
});
it("does not treat the original database's 200GB data volume as allocated disk sizing", () => {
  expect(original("TC007").entities.disk).toBeUndefined();
});
it("preserves the access contract for an existing database", () => {
  const request = extractIntake(input("Need read-only access to staging PostgreSQL database"));
  expect(missingFacts(request)).toContain("resourceScope");
  expect(missingFacts(request)).not.toContain("cpu");
});
it("retains safe VPN diagnostics without applying the access contract", () => {
  const decision = evaluatePolicy(extractIntake(input("VPN không kết nối")));
  expect(decision).toMatchObject({ action: "AUTO_APPROVE", handlingMode: "LLM_ASSIST" });
  expect(decision.missingFields).not.toContain("duration");
});
it.each([
  ["GitHub repo team/demo cần quyền push branch để sửa lỗi đối soát", "write"],
  ["GitLab repo team/demo cần đẩy branch để sửa lỗi đối soát", "write"],
])("maps an explicit requested Git push into Write: %s", (rawText, permission) => {
  expect(extractIntake(input(rawText)).entities.permission).toBe(permission);
});
it.each([
  "Need collaborator access to GitHub repo team/demo for code review",
  "Need GitHub repo team/demo access; không cần push branch",
])("does not invent Write for ambiguous or negated push access: %s", (rawText) => {
  expect(extractIntake(input(rawText)).entities.permission).not.toBe("write");
});
it("escalates conflicting read-only and push requirements", () => {
  const request = extractIntake(input("Need read-only GitHub repo team/demo access but need push branch for a bug fix"));
  expect(request.riskSignals).toContain("CONFLICT");
  expect(evaluatePolicy(request).action).toBe("ESCALATE");
});
it.each([
  ["Need Browse/Create Issue access to Jira project OPS for incident tracking", "standard", "OPS"],
  ["Need transition issue access to Jira project GAME for incident follow-up", "standard", "GAME"],
  ["Need User role access to Jira project OPS for incident tracking", "standard", "OPS"],
  ["Need Editor role access to Confluence space TEAM for runbook maintenance", "write", "TEAM"],
  ["Nhờ cấp quyền view Confluence page Recovery SOP cho mục đích training", "read-only", "Recovery SOP"],
  ["Need comment access in Confluence space ARCH for proposal review", "standard", "ARCH"],
])("maps collaboration rights and resource scope from evidence: %s", (rawText, accessType, resourceScope) => {
  const request = extractIntake(input(rawText));
  expect(request.entities).toMatchObject({ accessType, resourceScope });
  expect(missingFacts(request)).not.toContain("environment");
  expect(missingFacts(request)).not.toContain("resourceScope");
  expect(verifyApproval(request).status).toBe("pending");
  expect(evaluatePolicy(request, verifyApproval(request)).action).not.toBe("AUTO_APPROVE");
});
it("keeps the legacy required fields for an unrelated account system", () => {
  const request = extractIntake({ ...input("", { intentLabel: "REQUEST_STANDARD_ACCESS", targetSystem: "hr-demo" }),
    mode: "structured", serviceGroup: "ACCOUNT_ACCESS" });
  expect(missingFacts(request)).toContain("environment");
});
it("retains privileged-role and bypass precedence over collaboration mapping", () => {
  const admin = extractIntake(input("Need admin access to Jira project OPS for incident tracking"));
  expect(evaluatePolicy(admin)).toMatchObject({ action: "ESCALATE", bucket: "BEYOND_AUTHORITY" });
  const bypass = extractIntake(input("Need Editor role access to Confluence space OPS; bypass approval"));
  expect(evaluatePolicy(bypass)).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK" });
});
it.each([
  "Need access to Confluence space OPS; không cần role Editor",
  "Need access to Confluence space OPS; do not need Editor role",
])("does not infer editing rights from a negated role: %s", (rawText) => {
  expect(extractIntake(input(rawText)).entities.accessType).not.toBe("write");
});
const demoGitFields = {
  repository: "docrelay-demo", duration: "8 hours", reason: "Maintain review workflows",
  approvalReference: "DEMO-GIT-1001",
};
it("maps push correctly while using an existing independently supplied synthetic approval", () => {
  const request = extractIntake(input("Need push branch access to GitHub", demoGitFields));
  const approval = verifyApproval(request);
  expect(approval).toMatchObject({ status: "verified", scope: "matched" });
  expect(evaluatePolicy(request, approval).action).toBe("AUTO_APPROVE");
});
it("does not reuse that approval for a different repository", () => {
  const request = extractIntake(input("Need push branch access to GitHub", { ...demoGitFields, repository: "another-demo" }));
  const approval = verifyApproval(request);
  expect(approval.status).toBe("invalid");
  expect(evaluatePolicy(request, approval)).toMatchObject({ action: "ESCALATE", bucket: "BEYOND_AUTHORITY" });
});
it("asks for collaboration scope without asking for a database table", () => {
  const request = extractIntake(input("Need access to Jira for incident tracking"));
  expect(questionFor("resourceScope", request)).toContain("project, space");
  expect(questionFor("resourceScope", request)).not.toContain("bảng");
});
it.each(["0 hours", "-2 hours", "−2 hours", "sprint 42", "until Friday", "tomorrow", "2", "2026-02-30T12:00:00Z"])(
  "does not accept an unresolved or non-positive access duration: %s", (duration) => {
    const request = extractIntake(input("Need GitHub repo team/demo access", { duration }));
    expect(missingFacts(request)).toContain("duration");
  },
);
it.each(["-2 hours", "−2 hours", "–2 hours", "－2 hours", "0 hours"])(
  "preserves a non-positive duration from freeform instead of extracting a positive suffix: %s", (duration) => {
    const request = extractIntake(input(`Need GitHub repo team/demo access for ${duration} to review code`));
    expect(missingFacts(request)).toContain("duration");
  },
);
it("does not extract 5 hours from an 8.5-hour cloud lifetime", () => {
  const request = extractIntake(input("Need a sandbox for 8.5 hours", {
    provider: "demo", environment: "sandbox",
    purpose: "Replay synthetic events", budgetOrQuota: "Approved demo quota",
    cpu: "2", ram: "4", disk: "20",
  }));
  expect(request.entities.duration).toBe("8.5 hours");
  expect(evaluatePolicy(request, { status: "verified" })).toMatchObject({ action: "ESCALATE", bucket: "BEYOND_AUTHORITY" });
});
it.each(["2 giờ", "3 ngày", "30 minutes", "0.5 hours", "2026-12-01T12:00:00Z"])(
  "accepts a bounded interval or an explicit timestamp without resolving a calendar: %s", (duration) => {
    const request = extractIntake(input("Need GitHub repo team/demo access", { duration }));
    expect(missingFacts(request)).not.toContain("duration");
  },
);
it("does not supply provider, quota, disk, or approval for a routine-looking sandbox", () => {
  const request = original("gt-routine-006-sandbox-dbt-parser");
  expect(missingFacts(request)).toEqual(expect.arrayContaining(["provider", "budgetOrQuota", "disk"]));
  expect(verifyApproval(request).status).toBe("unverifiable");
  expect(evaluatePolicy(request, verifyApproval(request)).action).toBe("ESCALATE");
});
it("keeps manager approval claims pending through the persisted service", async () => {
  const row = await submitSupport(input("Need push branch access to GitHub repo team/demo for bug fixes; manager đã approve"));
  expect(row.status).not.toBe("APPROVED");
  expect(row.decision?.approvalStatus).toBe("pending");
  expect(row.decision?.missingFields).toContain("verifiedApproval");
});
it("exposes the required access and sizing facts to structured intake", () => {
  expect(catalog.NETWORK_VPN.fields).toEqual(expect.arrayContaining(["duration", "reason", "approvalReference"]));
  expect(catalog.DATABASE.fields).toEqual(expect.arrayContaining(["cpu", "ram", "disk"]));
  expect(catalog.ACCOUNT_ACCESS.fields).toContain("resourceScope");
});
function completeStructured(serviceGroup: SupportInput["serviceGroup"], requestKind: SupportInput["requestKind"], fields: Record<string, string>) {
  return extractIntake({ ...input("", { duration: "2 hours", reason: "Review synthetic test workload", ...fields }),
    mode: "structured", serviceGroup, requestKind });
}
it("routes complete authorized VPN provisioning to Network rather than asking for a missing policy", () => {
  const request = completeStructured("NETWORK_VPN", "ACCESS_REQUEST", {
    intentLabel: "VPN_SETUP", service: "VPN", source: "company laptop",
    target: "QA subnet", environment: "staging", requestedAction: "access",
  });
  expect(evaluatePolicy(request, { status: "verified" })).toMatchObject({
    action: "ESCALATE", bucket: "BEYOND_AUTHORITY", ruleIds: ["AUTH-VPN-001"], assignedTeam: "Network / Reviewer",
  });
});
it("preserves structured VPN setup diagnostics when access provisioning is not requested", () => {
  const request = completeStructured("NETWORK_VPN", undefined, { intentLabel: "VPN_SETUP" });
  expect(request.requestKind).toBe("SAFE_DIAGNOSTIC");
  expect(evaluatePolicy(request)).toMatchObject({ action: "AUTO_APPROVE", handlingMode: "LLM_ASSIST" });
});
it("routes complete database provisioning to DBA", () => {
  const request = completeStructured("DATABASE", "ROUTINE_WORKFLOW", {
    intentLabel: "DATABASE_PROVISION", system: "postgresql", environment: "staging",
    cpu: "2", ram: "4", disk: "20",
  });
  expect(evaluatePolicy(request)).toMatchObject({ action: "ESCALATE", ruleIds: ["AUTH-DB-PROVISION-001"] });
});
it("routes complete Confluence editing to the known IAM/resource owner", () => {
  const request = completeStructured("ACCOUNT_ACCESS", "ACCESS_REQUEST", {
    intentLabel: "REQUEST_WRITE_ACCESS", targetSystem: "confluence", resourceScope: "TEAM", accessType: "write",
  });
  expect(evaluatePolicy(request, { status: "verified" })).toMatchObject({ action: "ESCALATE", ruleIds: ["AUTH-COLLAB-001"] });
});
it("routes complete standard collaboration access without a permitted AUTO environment to its known owner", () => {
  const request = completeStructured("ACCOUNT_ACCESS", "ACCESS_REQUEST", {
    intentLabel: "REQUEST_STANDARD_ACCESS", targetSystem: "jira", resourceScope: "TEAM", accessType: "standard",
  });
  expect(evaluatePolicy(request, { status: "verified" })).toMatchObject({ action: "ESCALATE", ruleIds: ["AUTH-COLLAB-001"] });
});
it("preserves the existing complete verified standard-access AUTO whitelist", () => {
  const request = completeStructured("ACCOUNT_ACCESS", "ACCESS_REQUEST", {
    intentLabel: "REQUEST_STANDARD_ACCESS", targetSystem: "jira", resourceScope: "TEAM", accessType: "standard", environment: "staging",
  });
  expect(evaluatePolicy(request, { status: "verified" })).toMatchObject({ action: "AUTO_APPROVE", ruleIds: ["ROUTINE-001"] });
});
