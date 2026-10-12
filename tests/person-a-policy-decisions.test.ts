import { afterEach, beforeEach, expect, it, vi } from "vitest";
import official from "../mlai26_new/data/verify/verify_cases.json";
import development from "../mlai26_new/data/ground-truth/synthetic_tickets.json";
import type { Environment, ServiceGroup, SupportInput } from "@/domain/contracts";
import { evaluatePolicy } from "@/domain/policy";
import { extractIntake } from "@/domain/text";
import { resetSupportTestStore } from "@/lib/support-repository";
import { submitSupport } from "@/services/support";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());

function originalText(id: string) {
  const row = [...official, ...development].find((item) => item.id === id);
  if (!row) throw new Error(`Original case not found: ${id}`);
  return row.ticket_content;
}
function intake(rawText: string, fields: Record<string, string> = {}): SupportInput {
  return {
    mode: "freeform", serviceGroup: "OTHER", rawText,
    fields: { department: "engineering", employeeId: "EMP-TEST-01", ...fields },
    confirmed: true, idempotencyKey: crypto.randomUUID(),
  };
}

it.each(["verify-003-etl-missing-specs", "TC006", "TC007", "TC008"])(
  "hands incomplete resource provisioning to a person: %s", (id) => {
    const decision = evaluatePolicy(extractIntake(intake(originalText(id))));
    expect(decision).toMatchObject({
      action: "ESCALATE", bucket: "MISSING_INFO", handlingMode: "HUMAN_REVIEW",
      uncertaintyClass: "MISSING_FACTS",
    });
    expect(decision.ruleIds).toContain("INFO-PROVISION-001");
    expect(decision.missingFields.length).toBeGreaterThan(0);
    expect(decision.reviewerQuestions?.length).toBeGreaterThan(0);
  },
);
it("persists incomplete provisioning as an escalated request through the support service", async () => {
  const row = await submitSupport(intake(originalText("verify-003-etl-missing-specs")));
  expect(row.status).toBe("ESCALATED");
  expect(row.decision).toMatchObject({ action: "ESCALATE", bucket: "MISSING_INFO" });
});
it("requires database authority for a business production export with no uncontrolled destination", () => {
  const request = extractIntake(intake(originalText("TC010")));
  for (const status of ["pending", "verified"] as const) {
    const decision = evaluatePolicy(request, { status });
    expect(decision).toMatchObject({ action: "ESCALATE", bucket: "BEYOND_AUTHORITY" });
    expect(decision.ruleIds).toEqual(expect.arrayContaining(["AUTH-001", "AUTH-EXPORT-001"]));
    expect(decision.ruleIds).not.toContain("SEC-005");
  }
});
it("routes the original production table deletion to Security/DBA even with verified approval", () => {
  const request = extractIntake(intake(originalText("TC015")));
  for (const status of ["pending", "verified", "unverifiable"] as const) {
    const decision = evaluatePolicy(request, { status });
    expect(decision).toMatchObject({
      action: "ESCALATE", bucket: "SECURITY_RISK", handlingMode: "HUMAN_REVIEW",
      uncertaintyClass: "OUT_OF_POLICY", assignedTeam: "Security / DBA/Data",
    });
    expect(decision.ruleIds).toEqual(expect.arrayContaining(["SEC-007", "AUTH-008", "AUTH-001"]));
    expect(decision.reviewerQuestions?.join(" ")).toContain("backup");
  }
});
it("persists destructive production database work as escalated rather than approved", async () => {
  const row = await submitSupport(intake(originalText("TC015")));
  expect(row.status).toBe("ESCALATED");
  expect(row.decision).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK" });
  expect(row.decision?.ruleIds).toContain("SEC-007");
});
it.each([
  "Please drop table orders in the production database to fix a slow report; backup is available.",
  "Nhờ drop bảng payments trong production DB để xử lý lỗi đối soát, nếu cần sẽ restore sau.",
])("applies the destructive production policy without depending on case IDs or the users table: %s", (rawText) => {
  const decision = evaluatePolicy(extractIntake(intake(rawText)));
  expect(decision).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK" });
  expect(decision.ruleIds).toContain("SEC-007");
});
function structuredDestruction(serviceGroup: ServiceGroup, environment: Environment) {
  return extractIntake({
    ...intake("", {
      environment, requestedAction: "delete",
      intentLabel: serviceGroup === "DATABASE" ? "DATABASE_SCHEMA_CHANGE" : "DEVICE_WIPE",
      system: "demo-db", resourceScope: "orders",
    }),
    mode: "structured", serviceGroup,
  });
}
it("applies the same Security policy to structured production database deletion", () => {
  const decision = evaluatePolicy(structuredDestruction("DATABASE", "production"), { status: "verified" });
  expect(decision).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK" });
  expect(decision.ruleIds).toContain("SEC-007");
});
it.each(["sandbox", "development", "staging", "unknown"] as const)(
  "keeps database destruction outside production on the existing authority path: %s", (environment) => {
    const decision = evaluatePolicy(structuredDestruction("DATABASE", environment));
    expect(decision).toMatchObject({ action: "ESCALATE", bucket: "BEYOND_AUTHORITY" });
    expect(decision.ruleIds).toContain("AUTH-008");
    expect(decision.ruleIds).not.toContain("SEC-007");
  },
);
it("keeps device wiping outside the database Security rule", () => {
  const decision = evaluatePolicy(structuredDestruction("DEVICE_BOOT", "production"));
  expect(decision).toMatchObject({ action: "ESCALATE", bucket: "BEYOND_AUTHORITY" });
  expect(decision.ruleIds).toContain("AUTH-008");
  expect(decision.ruleIds).not.toContain("SEC-007");
});
it("does not turn an explicitly negated drop into destructive database work", () => {
  const request = extractIntake(intake(
    "Do not drop table users in production database; need read-only SELECT access for reconciliation.",
  ));
  expect(request.riskSignals).not.toContain("DESTRUCTIVE");
  const decision = evaluatePolicy(request);
  expect(decision).toMatchObject({ action: "ESCALATE", bucket: "BEYOND_AUTHORITY" });
  expect(decision.ruleIds).not.toContain("SEC-007");
});
it("keeps production schema changes without deletion on the authority path", () => {
  const request = structuredDestruction("DATABASE", "production");
  const decision = evaluatePolicy({
    ...request, requestedAction: "alter",
    riskSignals: request.riskSignals.filter((signal) => signal !== "DESTRUCTIVE"),
  });
  expect(decision).toMatchObject({ action: "ESCALATE", bucket: "BEYOND_AUTHORITY" });
  expect(decision.ruleIds).not.toContain("SEC-007");
});
it.each([
  "Export production database to a personal laptop để đối soát doanh thu",
  "Export customer data from production database để đối soát doanh thu",
  "Export dữ liệu người dùng từ production database để đối soát doanh thu",
  "Export production database để đối soát doanh thu; bypass approval",
  "Nhờ dump production database về máy phân tích để debug checksum",
  "Nhờ export production database để xử lý DSAR deadline",
  "Export production database",
])("keeps export security risks and unspecified purpose in Security: %s", (rawText) => {
  expect(evaluatePolicy(extractIntake(intake(rawText)))).toMatchObject({
    action: "ESCALATE", bucket: "SECURITY_RISK",
  });
});
it("applies the authority rule to a new business export request without relying on a fixture ID", () => {
  const decision = evaluatePolicy(extractIntake(intake(
    "Nhờ export production database để đối soát doanh thu, còn thiếu DBA sign-off.",
  )));
  expect(decision).toMatchObject({ action: "ESCALATE", bucket: "BEYOND_AUTHORITY" });
  expect(decision.ruleIds).toContain("AUTH-EXPORT-001");
});
const unsafeExportFields: Array<Record<string, string>> = [
  { destination: "personal laptop" },
  { dataSensitivity: "confidential" },
];
it.each(unsafeExportFields)("checks structured destination and sensitivity before choosing the authority route: %j", (fields) => {
  const decision = evaluatePolicy(extractIntake(intake(originalText("TC010"), fields)));
  expect(decision).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK" });
  expect(decision.ruleIds).toContain("SEC-005");
});

const resourceFields = {
  provider: "demo", environment: "sandbox", duration: "2 hours",
  purpose: "Replay synthetic events", budgetOrQuota: "Approved demo quota",
  cpu: "2", ram: "4", disk: "20",
};
it("keeps complete, authorized provisioning on its existing bounded workflow", () => {
  const request = extractIntake(intake("Need a sandbox", resourceFields));
  const decision = evaluatePolicy(request, { status: "verified" });
  expect(decision.action).toBe("AUTO_APPROVE");
  expect(decision.ruleIds).not.toContain("INFO-PROVISION-001");
});
it("still asks for non-sizing information when resource sizing and duration are present", () => {
  const request = extractIntake(intake("Need a sandbox", { ...resourceFields, provider: "" }));
  const decision = evaluatePolicy(request, { status: "verified" });
  expect(decision).toMatchObject({ action: "NEEDS_INFORMATION", missingFields: ["provider"] });
  expect(decision.ruleIds).not.toContain("INFO-PROVISION-001");
});
it("retains approval and security precedence over a provisioning information gap", () => {
  const request = extractIntake(intake("Need a sandbox for synthetic replay jobs"));
  expect(evaluatePolicy(request, { status: "unverifiable" })).toMatchObject({
    action: "ESCALATE", bucket: "BEYOND_AUTHORITY", ruleIds: ["AUTH-007"],
  });
  const bundled = extractIntake(intake("Need a sandbox for replay jobs; open public RDP port 3389"));
  expect(evaluatePolicy(bundled)).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK" });
});
it("keeps ordinary missing access facts in clarification and VPN diagnostics in guidance", () => {
  expect(evaluatePolicy(extractIntake(intake("Need read access to staging database"))).action).toBe("NEEDS_INFORMATION");
  expect(evaluatePolicy(extractIntake(intake("VPN không kết nối"))).action).toBe("AUTO_APPROVE");
});
