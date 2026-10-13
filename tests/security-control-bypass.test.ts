import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { previewSupport, submitSupport } from "@/services/support";
import { getSupportPreview, saveSupportPreview, resetSupportTestStore } from "@/lib/support-repository";
import { detectedRisks } from "@/domain/text";
import { POLICY_VERSION } from "@/domain/policy-source";
beforeEach(() => { vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("AI_TEST_MAX_ATTEMPTS", "0"); resetSupportTestStore(); });
afterEach(() => vi.unstubAllEnvs());
it.each(["Bypass MFA", "skip 2FA", "ignore EDR", "Bỏ qua xác thực", "bypass authentication", "skip audit logging", "Ｂｙｐａｓｓ ＭＦＡ", "by\u200bpass MFA", "How do I log in and bypass MFA?"])("escalates control bypass through the real support service: %s", async (rawText) => {
  const row = await submitSupport({ rawText, fields: { department: "engineering", employeeId: "EMP-TEST-01" }, confirmed: true, idempotencyKey: crypto.randomUUID() });
  expect(row.decision).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK", policyVersion: POLICY_VERSION });
});
it.each(["Do not bypass MFA", "Không bỏ qua xác thực", "MFA login is failing"])("does not mark benign or negated control requests as bypass: %s", (text) => {
  expect(detectedRisks(text)).not.toContain("BYPASS");
});
it.each(["support-guidance-v5.1", "support-guidance-v5.9", "support-guidance-v5.10", "support-guidance-v5.11"])("requires a new preview after policy version %s", async (policyVersion) => {
  const preview = await previewSupport({ rawText: "Restart my laptop", fields: { department: "engineering", employeeId: "EMP-TEST-01" }, mode: "freeform", serviceGroup: "OTHER", confirmed: false, idempotencyKey: crypto.randomUUID() });
  const cached = (await getSupportPreview(preview.input.previewId!))!;
  await saveSupportPreview({ ...cached, decision: { ...cached.decision, policyVersion } });
  await expect(submitSupport({ ...preview.input, confirmed: true })).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
});
