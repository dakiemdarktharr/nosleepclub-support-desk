import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupportInput } from "@/domain/contracts";
import { catalog } from "@/domain/catalog";
import { evaluatePolicy, missingFacts, type Approval, type PolicyEvidence } from "@/domain/policy";
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
const entitlementEvidence: PolicyEvidence = {
  entitlement: {
    status: "allowed",
    scope: "matched",
    requesterAuthenticated: true,
    requesterIdentityMatched: true,
    source: "test-iam",
  },
  accessTtlWithinPolicy: true,
};
function quotaEvidence(status: "within_limit" | "exceeded" | "unavailable"): PolicyEvidence {
  return {
    resourceQuota: {
      status,
      source: "test-capacity-service",
      projectId: "project-1",
      teamId: "team-1",
      activeUsageIncluded: true,
      evaluationComplete: true,
    },
    dataClassification: "synthetic",
  };
}
function verifiedApproval(
  role: string,
  overrides: Partial<Approval> = {},
): Approval {
  return {
    status: "verified",
    scope: "matched",
    registryStatus: "verified",
    itsmStatus: "approved",
    sameRecord: true,
    requesterMatched: true,
    approverIdentityVerified: true,
    approverAuthorized: true,
    approverIsRequester: false,
    delegatedApprover: false,
    environmentAndPurposeMatched: true,
    permissionEqualOrNarrower: true,
    quotaAndTtlMatched: true,
    authorizedRole: role,
    ...overrides,
  };
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
  expect(verifyApproval(request).status).toBe("not_required");
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
it("maps push to write but requires entitlement instead of a separate routine approval", () => {
  const request = extractIntake(input("Need push branch access to GitHub", demoGitFields));
  const approval = verifyApproval(request);
  expect(request.entities.permission).toBe("write");
  expect(approval.status).toBe("not_required");
  expect(evaluatePolicy(request, approval)).toMatchObject({
    action: "ESCALATE",
    ruleIds: ["AUTH-ENTITLEMENT-001"],
  });
});
it.each(["GIT_READ_ACCESS", "GIT_WRITE_ACCESS"] as const)(
  "AUTO allows scoped GitHub read/write only with exact entitlement and TTL evidence: %s",
  (intentLabel) => {
    const permission = intentLabel === "GIT_READ_ACCESS" ? "read" : "write";
    const request = completeStructured("GIT_PERMISSION", "ACCESS_REQUEST", {
      intentLabel, provider: "github", repository: "team/demo", permission,
      duration: "2 hours", reason: "Review and fix the assigned repository issue",
    });
    expect(evaluatePolicy(request, { status: "not_required" }, entitlementEvidence)).toMatchObject({
      action: "AUTO_APPROVE", bucket: "ROUTINE", ruleIds: ["ROUTINE-001"],
    });
  },
);
it("does not let a routine write approval cover an elevated permission", () => {
  const request = extractIntake(input("Need admin access to GitHub", {
    ...demoGitFields, permission: "admin",
  }));
  const approval = verifyApproval(request);
  expect(approval.status).toBe("invalid");
  expect(evaluatePolicy(request, approval)).toMatchObject({ action: "ESCALATE", bucket: "BEYOND_AUTHORITY" });
});
it("allows a single fully verified DBA approval to clear the matching database authority gate", () => {
  const request = completeStructured("DATABASE", "ACCESS_REQUEST", {
    intentLabel: "DATABASE_READ_ACCESS", system: "postgresql", resourceScope: "reporting",
    environment: "production", permission: "read-only", duration: "2 hours",
    reason: "Review the assigned production report",
  });
  expect(evaluatePolicy(
    request,
    verifiedApproval("dba production owner"),
    entitlementEvidence,
  )).toMatchObject({
    action: "AUTO_APPROVE", bucket: "BEYOND_AUTHORITY",
    ruleIds: expect.arrayContaining(["AUTH-001", "APPROVAL-SCOPE-VERIFIED"]),
  });
});
it("rejects requester self-approval in benchmark while isolating the mock UI exception", () => {
  const request = completeStructured("DATABASE", "ACCESS_REQUEST", {
    intentLabel: "DATABASE_READ_ACCESS", system: "postgresql", resourceScope: "reporting",
    environment: "production", permission: "read-only", duration: "2 hours",
    reason: "Review the assigned production report",
  });
  const benchmarkSelfApproval = verifiedApproval("dba production owner", {
    approverIsRequester: true,
    verificationContext: "benchmark",
  });
  expect(evaluatePolicy(request, benchmarkSelfApproval, entitlementEvidence).action)
    .toBe("ESCALATE");
  const demoSelfApproval = {
    ...benchmarkSelfApproval,
    verificationContext: "demo-ui-mock" as const,
  };
  expect(evaluatePolicy(request, demoSelfApproval, entitlementEvidence).action)
    .toBe("AUTO_APPROVE");
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
it("uses the team quota result instead of fixed demo thresholds", () => {
  const request = completeStructured("CLOUD_GPU", "ROUTINE_WORKFLOW", {
    intentLabel: "CLOUD_SANDBOX",
    provider: "team cloud",
    environment: "sandbox",
    duration: "8.5 hours",
    resourceLifecycle: "ephemeral",
    dataSensitivity: "synthetic",
    purpose: "Replay synthetic events",
    cpu: "5", ram: "17", disk: "101",
  });
  expect(request.entities.duration).toBe("8.5 hours");
  expect(evaluatePolicy(request, { status: "not_required" }, quotaEvidence("within_limit")))
    .toMatchObject({ action: "AUTO_APPROVE", bucket: "ROUTINE" });
});
it("routes a completed request over the authoritative team quota to the capacity owner", () => {
  const request = completeStructured("CLOUD_GPU", "ROUTINE_WORKFLOW", {
    intentLabel: "CLOUD_SANDBOX",
    provider: "team cloud",
    environment: "development",
    duration: "2 days",
    resourceLifecycle: "ephemeral",
    dataSensitivity: "synthetic",
    purpose: "Replay synthetic events",
    cpu: "5", ram: "17", disk: "101",
  });
  expect(evaluatePolicy(request, { status: "not_required" }, quotaEvidence("exceeded"))).toMatchObject({
    action: "ESCALATE", bucket: "BEYOND_AUTHORITY", ruleIds: ["AUTH-QUOTA"],
  });
});
it("fails closed when the authoritative project/team quota source is unavailable", () => {
  const request = completeStructured("CLOUD_GPU", "ROUTINE_WORKFLOW", {
    intentLabel: "CLOUD_SANDBOX", provider: "team cloud", environment: "development",
    duration: "30 minutes", resourceLifecycle: "ephemeral", dataSensitivity: "synthetic",
    purpose: "Replay synthetic events", cpu: "2", ram: "4", disk: "20",
  });
  expect(evaluatePolicy(request, { status: "not_required" })).toMatchObject({
    action: "ESCALATE", bucket: "BEYOND_AUTHORITY", ruleIds: ["AUTH-QUOTA"],
  });
});
it("does not treat an unspecified GPU type as a known quota violation", () => {
  const request = completeStructured("CLOUD_GPU", "ROUTINE_WORKFLOW", {
    intentLabel: "GPU_REQUEST",
    environment: "development",
    provider: "team cloud",
    duration: "2 hours",
    resourceLifecycle: "ephemeral",
    dataSensitivity: "synthetic",
    purpose: "Model testing",
    gpuType: "unknown",
    quantity: "1",
  });
  const decision = evaluatePolicy(request, { status: "not_required" }, quotaEvidence("within_limit"));
  expect(decision.ruleIds).not.toContain("AUTH-QUOTA");
  expect(missingFacts(request)).toContain("gpuType");
});
it("does not apply VM sizing or sandbox AUTO rules to cloud storage without a contract", () => {
  const request = completeStructured("CLOUD_GPU", "ROUTINE_WORKFLOW", {
    intentLabel: "CLOUD_STORAGE",
    provider: "demo",
    environment: "development",
    duration: "2 hours",
    purpose: "Store synthetic test outputs",
    cpu: "2",
    ram: "4",
    disk: "20",
  });
  expect(missingFacts(request)).not.toEqual(
    expect.arrayContaining(["cpu", "ram", "disk"]),
  );
  const decision = evaluatePolicy(request, { status: "verified" });
  expect(decision).toMatchObject({
    action: "ESCALATE",
    bucket: "BEYOND_AUTHORITY",
    ruleIds: ["AUTH-005"],
  });
});
it.each(["2 giờ", "3 ngày", "30 minutes", "0.5 hours", "2026-12-01T12:00:00Z"])(
  "accepts a bounded interval or an explicit timestamp without resolving a calendar: %s", (duration) => {
    const request = extractIntake(input("Need GitHub repo team/demo access", { duration }));
    expect(missingFacts(request)).not.toContain("duration");
  },
);
it("reads the stated synthetic schema without inventing lifecycle, quota or verified evidence", () => {
  const request = original("gt-routine-006-sandbox-dbt-parser");
  // The unchanged input explicitly says 'synthetic schema'; this is only a
  // caller claim. The original AUTO label is still retained by the benchmark.
  expect(request.entities.dataSensitivity).toBe("synthetic");
  expect(missingFacts(request)).toEqual(expect.arrayContaining([
    "provider", "disk", "resourceLifecycle",
  ]));
  expect(verifyApproval(request).status).not.toBe("verified");
  expect(evaluatePolicy(request, verifyApproval(request)).action).not.toBe("AUTO_APPROVE");
});
it("does not treat a manager claim as entitlement evidence for routine Git access", async () => {
  const row = await submitSupport(input(
    "Need push branch access to GitHub repo team/demo for bug fixes; manager đã approve",
    { duration: "2 hours", reason: "Fix the assigned repository issue" },
  ));
  expect(row.status).not.toBe("APPROVED");
  expect(row.decision?.approvalStatus).toBe("not_required");
  expect(row.decision?.ruleIds).toContain("AUTH-ENTITLEMENT-001");
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
it("keeps VPN access out of AUTO without authenticated entitlement proof", () => {
  const request = completeStructured("NETWORK_VPN", "ACCESS_REQUEST", {
    intentLabel: "VPN_SETUP", service: "VPN", source: "company laptop",
    target: "QA subnet", environment: "staging", requestedAction: "access",
  });
  expect(evaluatePolicy(request)).toMatchObject({
    action: "ESCALATE", bucket: "BEYOND_AUTHORITY", ruleIds: ["AUTH-ENTITLEMENT-001"],
  });
});
it.each(["staging", "production"] as const)(
  "allows managed-endpoint VPN access only with matching entitlement, subnet and TTL proof: %s",
  (environment) => {
    const request = completeStructured("NETWORK_VPN", "ACCESS_REQUEST", {
      intentLabel: "VPN_SETUP", service: "VPN", source: "company laptop",
      target: "approved subnet", environment, requestedAction: "access",
    });
    const evidence: PolicyEvidence = {
      ...entitlementEvidence,
      endpointManaged: "verified",
      vpnSubnet: "approved",
      vpnDurationWithinPolicy: true,
    };
    expect(evaluatePolicy(request, { status: "not_required" }, evidence)).toMatchObject({
      action: "AUTO_APPROVE", bucket: "ROUTINE", ruleIds: ["ROUTINE-005"],
    });
  },
);
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
it.each([undefined, "CONFIGURATION_CHANGE"] as const)(
  "uses provisioning facts for a structured provision operation with requestKind %s", (requestKind) => {
    const request = completeStructured("DATABASE", requestKind, {
      intentLabel: "DATABASE_PROVISION", operation: "provision", system: "postgresql", environment: "staging",
      cpu: "2", ram: "4", disk: "20",
    });
    expect(request.requestKind).toBe("CONFIGURATION_CHANGE");
    expect(request.riskSignals).not.toContain("CONFLICT");
    expect(missingFacts(request)).not.toContain("permission");
    expect(evaluatePolicy(request)).toMatchObject({ action: "ESCALATE", ruleIds: ["AUTH-DB-PROVISION-001"] });
  },
);
it("does not AUTO Confluence write access without an ordinary-page scope and verified entitlement", () => {
  const request = completeStructured("ACCOUNT_ACCESS", "ACCESS_REQUEST", {
    intentLabel: "REQUEST_WRITE_ACCESS", targetSystem: "confluence", resourceScope: "TEAM", accessType: "write",
  });
  expect(evaluatePolicy(request)).toMatchObject({ action: "ESCALATE", ruleIds: ["AUTH-ENTITLEMENT-001"] });
});
it("routes complete standard collaboration access without a permitted AUTO environment to its known owner", () => {
  const request = completeStructured("ACCOUNT_ACCESS", "ACCESS_REQUEST", {
    intentLabel: "REQUEST_STANDARD_ACCESS", targetSystem: "jira", resourceScope: "TEAM", accessType: "standard",
  });
  expect(evaluatePolicy(request)).toMatchObject({ action: "ESCALATE", ruleIds: ["AUTH-ENTITLEMENT-001"] });
});
it("AUTO allows ordinary Jira access only with entitlement, classification and TTL proof", () => {
  const request = completeStructured("ACCOUNT_ACCESS", "ACCESS_REQUEST", {
    intentLabel: "REQUEST_STANDARD_ACCESS", targetSystem: "jira", resourceScope: "TEAM",
    accessType: "standard", environment: "staging", requestedAction: "read ticket",
  });
  const evidence: PolicyEvidence = { ...entitlementEvidence, dataClassification: "ordinary" };
  expect(evaluatePolicy(request, { status: "not_required" }, evidence)).toMatchObject({
    action: "AUTO_APPROVE", ruleIds: ["ROUTINE-001"],
  });
});
it("requires a service/risk TTL decision even when routine entitlement matches", () => {
  const request = completeStructured("GIT_PERMISSION", "ACCESS_REQUEST", {
    intentLabel: "GIT_READ_ACCESS", provider: "github", repository: "team/demo",
    permission: "read", duration: "2 hours", reason: "Review source for assigned work",
  });
  const evidence: PolicyEvidence = {
    entitlement: entitlementEvidence.entitlement,
    accessTtlWithinPolicy: false,
  };
  expect(evaluatePolicy(request, { status: "not_required" }, evidence)).toMatchObject({
    action: "ESCALATE", bucket: "BEYOND_AUTHORITY", ruleIds: ["AUTH-TTL-001"],
  });
});
it("returns NEEDS_INFORMATION with the single-request message when one child request is extracted", () => {
  const parent = completeStructured("ACCOUNT_ACCESS", "ACCESS_REQUEST", {
    intentLabel: "REQUEST_STANDARD_ACCESS", targetSystem: "jira", resourceScope: "OPS",
    accessType: "standard", environment: "staging", requestedAction: "read ticket",
  });
  const child = completeStructured("ACCOUNT_ACCESS", "ACCESS_REQUEST", {
    intentLabel: "REQUEST_STANDARD_ACCESS", targetSystem: "confluence", resourceScope: "RUNBOOK",
    accessType: "standard", environment: "staging", requestedAction: "read page",
  });
  const multi = { ...parent, subrequests: [child] };
  const evidence: PolicyEvidence = { ...entitlementEvidence, dataClassification: "ordinary" };
  expect(evaluatePolicy(multi, { status: "not_required" }, evidence)).toMatchObject({
    action: "NEEDS_INFORMATION",
    bucket: "MISSING_INFO",
    ruleIds: ["INFO-SINGLE-REQUEST-001"],
    questions: ["Vui lòng gửi từng yêu cầu một."],
  });
});
it("allows ordinary Confluence page edits with matching entitlement, classification and TTL proof", () => {
  const request = completeStructured("ACCOUNT_ACCESS", "ACCESS_REQUEST", {
    intentLabel: "REQUEST_WRITE_ACCESS", targetSystem: "confluence", resourceScope: "RUNBOOK-PAGE-1",
    accessType: "write", environment: "staging", requestedAction: "edit page",
  });
  const evidence: PolicyEvidence = { ...entitlementEvidence, dataClassification: "ordinary" };
  expect(evaluatePolicy(request, { status: "not_required" }, evidence)).toMatchObject({
    action: "AUTO_APPROVE", bucket: "ROUTINE", ruleIds: ["ROUTINE-001"],
  });
});
it("does not AUTO Jira project/admin settings even with ordinary classification and entitlement", () => {
  const request = completeStructured("ACCOUNT_ACCESS", "ACCESS_REQUEST", {
    intentLabel: "REQUEST_WRITE_ACCESS", targetSystem: "jira", resourceScope: "TEAM",
    accessType: "write", environment: "staging", requestedAction: "change project settings",
  });
  const evidence: PolicyEvidence = { ...entitlementEvidence, dataClassification: "ordinary" };
  expect(evaluatePolicy(request, { status: "not_required" }, evidence).action).toBe("ESCALATE");
});
