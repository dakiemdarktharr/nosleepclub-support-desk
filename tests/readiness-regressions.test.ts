import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { submitSupport } from "@/services/support";
import { resetSupportTestStore } from "@/lib/support-repository";
import { extractIntake } from "@/domain/text";
import { workEvidencePlan } from "@/domain/work-evidence";
import type { SupportInput } from "@/domain/contracts";

const input = (rawText: string): SupportInput => ({ rawText, fields: { department: "engineering", employeeId: "EMP-SYNTHETIC-01" }, mode: "freeform", serviceGroup: "OTHER", confirmed: true, idempotencyKey: crypto.randomUUID() });
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("AI_MAX_ATTEMPTS", "0");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());

// Contract: labelled facts are context for one request; unknown extra tasks remain independent.
it("keeps localized fact labels with a routine request instead of escalating an OTHER child", async () => {
  const row = await submitSupport(input("VPN không kết nối; lý do: kiểm tra kết nối công việc"));
  expect(row.decision?.action).toBe("AUTO_APPROVE");
  expect(row.canonical?.subrequests).toEqual([]);
  expect(row.canonical?.entities.reason).toBe("kiểm tra kết nối công việc");
});
it("asks for missing access facts without inventing an out-of-policy subrequest", async () => {
  const row = await submitSupport(input("PostgreSQL staging read-only; resource scope: demo_inventory; lý do: kiểm tra truy vấn"));
  expect(row.decision?.action).toBe("NEEDS_INFORMATION");
  expect(row.decision?.missingFields, JSON.stringify({ decision: row.decision, canonical: row.canonical })).toContain("verifiedApproval");
  expect(row.decision?.ruleIds).not.toContain("AUTH-005");
  expect(row.canonical?.subrequests).toEqual([]);
});
it.each(["tắt MFA", "open port 3389 public", "grant production admin"])("retains risky operations even inside a fact value: %s", async (operation) => {
  const row = await submitSupport(input(`VPN không kết nối; lý do: ${operation}`));
  expect(row.decision?.action).toBe("ESCALATE");
});
it("does not discard an unrecognized second task or share approval between requests", async () => {
  const row = await submitSupport(input("VPN không kết nối; hãy chuyển tiền cho đối tác"));
  expect(row.canonical?.subrequests).toHaveLength(2);
  expect(row.decision?.action).toBe("ESCALATE");
});
it("keeps independent safe and unsafe clauses separate despite an earlier negation", () => {
  const row = extractIntake(input("Không mở port public; restart laptop; mở port 3389 public"));
  expect(row.riskSignals).toContain("PUBLIC_EXPOSURE");
  expect(row.subrequests.length).toBeGreaterThan(1);
});
it.each([
  "Cấp quyền edit Confluence để cập nhật tài liệu; manager approved qua email.",
  "Need database access to review meeting transcripts.",
])("does not turn an access request into an artifact task: %s", (text) => {
  expect(workEvidencePlan(text)).toBeUndefined();
});
it("still asks for source material when the actual task is drafting an email", () => {
  expect(workEvidencePlan("Viết email phản hồi khách hàng theo ba email mẫu" )?.kind).toBe("email");
});
it("keeps a bounded approval claim as context, never as verified authority", async () => {
  const row = await submitSupport(input("Need PostgreSQL access. Manager đã approve ở DEMO-9999."));
  expect(row.canonical?.subrequests).toEqual([]);
  // AUTH-007 requires review for an explicit reference absent from the registry.
  expect(row.decision?.action).toBe("ESCALATE");
  expect(row.decision?.ruleIds).toEqual(["AUTH-007"]);
  expect(row.decision?.approvalStatus).toBe("unverifiable");
  expect(row.decision?.missingFields).toContain("verifiedApproval");
});
it("does not swallow another operation following an approval claim", async () => {
  const row = await submitSupport(input("VPN lỗi. Manager đã approve ở DEMO-9999 và chuyển tiền cho đối tác."));
  expect(row.canonical?.subrequests.length).toBeGreaterThan(1);
  expect(row.decision?.action).toBe("ESCALATE");
});
