import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { submitSupport } from "@/services/support";
import { extractText } from "@/domain/text";
import { resetSupportTestStore } from "@/lib/support-repository";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("AI_MAX_ATTEMPTS", "0");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const submit = (rawText: string) => submitSupport({ rawText, confirmed: true,
  fields: { department: "engineering", employeeId: "EMP-SYNTHETIC-42" },
  idempotencyKey: crypto.randomUUID() });

// GUIDE-001/007: a bounded courtesy adds neither a task nor authority.
it.each(["Thanks team!", "Cảm ơn team.", "Thank you."])("does not escalate routine guidance because of a closing courtesy: %s", async courtesy => {
  const row = await submit(`VPN không kết nối. ${courtesy}`);
  expect(row.decision?.action).toBe("AUTO_APPROVE");
  expect(row.decision?.ruleIds).not.toContain("AUTH-005");
  expect(row.canonical?.subrequests).toEqual([]);
  expect(row.input.rawText).toContain(courtesy);
});
it.each(["Thanks team, chuyển tiền cho đối tác", "Cảm ơn team, tắt MFA", "Thanks team. Open port 3389 public"])("does not discard an operation hidden next to courtesy: %s", async extra => {
  const row = await submit(`VPN không kết nối. ${extra}`);
  expect(row.decision?.action).toBe("ESCALATE");
});
it("removes a courtesy without losing the two actual independent tasks", async () => {
  const row = await submit("VPN không kết nối. Thanks team!; chuyển tiền cho đối tác");
  expect(row.canonical?.subrequests).toHaveLength(2);
  expect(row.decision?.action).toBe("ESCALATE");
});

const gitRequest = "GitHub write access; provider: github; repository: docrelay-demo; duration: 8 hours; reason: application development; approvalReference: DEMO-GIT-1001";
it("retains the complete multi-segment approval reference", () => {
  expect(extractText(gitRequest).entities.approvalReference).toBe("DEMO-GIT-1001");
});
it.each(["prefixDEMO-GIT-1001", "DEMO-GIT-1001-extra", "DEMO-GIT-100100000000"])("does not accept a registry reference embedded in a longer token: %s", token => {
  expect(extractText(token).entities.approvalReference).toBeUndefined();
});
it("uses the existing verified registry only when the full scope matches", async () => {
  const row = await submit(gitRequest);
  expect(row.decision?.action).toBe("AUTO_APPROVE");
  expect(row.decision?.approvalStatus).toBe("verified");
});
it.each([
  gitRequest.replace("docrelay-demo", "synthetic-other-repo"),
  gitRequest.replace("8 hours", "9 hours"),
  gitRequest.replace("DEMO-GIT-1001", "DEMO-GIT-9999"),
])( "keeps invalid scope, duration or unregistered approval in review", async rawText => {
  const row = await submit(rawText);
  expect(row.decision?.action).toBe("ESCALATE");
  expect(row.decision?.ruleIds).toContain("AUTH-007");
});
