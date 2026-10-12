import { afterEach, beforeEach, expect, it, vi } from "vitest";
import official from "../mlai26_new/data/verify/verify_cases.json";
import development from "../mlai26_new/data/ground-truth/synthetic_tickets.json";
import type { SupportInput } from "@/domain/contracts";
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
