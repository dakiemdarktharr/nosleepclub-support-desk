import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sharedFaqAnswer, resetSharedFaqForTest, createIsolatedFaqCache } from "@/lib/shared-faq-cache";
import { supportDatabase } from "@/lib/support-repository";
import { prepareInput } from "@/services/support";
import { extractIntake } from "@/domain/text";
import { evaluatePolicy } from "@/domain/policy";
import { guidanceTemplate } from "@/domain/guidance";
import { FAQ_TTL_MS } from "@/domain/shared-support";
import type { Assistance } from "@/domain/contracts";

vi.mock("@/lib/support-repository", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/support-repository")>(), supportDatabase: vi.fn() }));
function fixture(text = "VPN không kết nối") {
  const { input } = prepareInput({ requesterMode: "guest", rawText: text, idempotencyKey: crypto.randomUUID() });
  const canonical = extractIntake(input);
  const decision = evaluatePolicy(canonical);
  const template: Assistance = { ...guidanceTemplate(canonical), source: "deterministic", timestamp: new Date().toISOString(), generationReason: "REVIEWED_TEMPLATE_SUFFICIENT" };
  return { input, canonical, decision, template };
}
beforeEach(() => { resetSharedFaqForTest(); vi.mocked(supportDatabase).mockReset().mockReturnValue(null); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("hits only matching public FAQs and returns the current server template", async () => {
  const f = fixture();
  expect((await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template)).source).toBe("deterministic");
  const next = { ...f.input, rawText: "VPN không kết nối!" };
  const hit = await sharedFaqAnswer(next, f.canonical, f.decision, f.template);
  expect(hit).toMatchObject({ source: "cache", cache: { kind: "FAQ", similarity: 1 } });
  expect(hit.stepByStepInstructions).toEqual(f.template.stepByStepInstructions);
  expect(hit.warning).toBe(f.template.warning);
});
it("read-only lookup never warms the cache and expires at seven days exactly", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const f = fixture();
  await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template, "read");
  expect((await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template)).source).toBe("deterministic");
  vi.setSystemTime(Date.now() + FAQ_TTL_MS - 1);
  expect((await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template)).source).toBe("cache");
  vi.setSystemTime(Date.now() + 1);
  expect((await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template)).source).toBe("deterministic");
});
it.each(["warning", "expectedResult", "summary"] as const)("invalidates when reviewed %s changes", async field => {
  const f = fixture();
  await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template);
  const updated = { ...f.template, [field]: f.template[field] + " Nội dung đã rà soát mới." };
  expect((await sharedFaqAnswer(f.input, f.canonical, f.decision, updated)).source).toBe("deterministic");
});
it.each(["private", "risk", "missing", "model-failure", "verify", "compound", "operational-field", "fallback"])("never reuses an existing FAQ for %s", async mode => {
  const f = fixture();
  await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template);
  if (mode === "private") f.input.rawText += " cho demo@example.invalid";
  if (mode === "risk") f.canonical.riskSignals.push("PUBLIC_EXPOSURE");
  if (mode === "missing") f.decision.missingFields.push("system");
  if (mode === "model-failure") f.canonical.model.failure = "UNAVAILABLE";
  if (mode === "verify") f.input.verifyRunId = crypto.randomUUID();
  if (mode === "compound") f.canonical.subrequests = [f.canonical.subrequests[0], f.canonical.subrequests[0]];
  if (mode === "operational-field") f.input.fields.environment = "production";
  if (mode === "fallback") f.template.fallbackReason = "PROVIDER_UNAVAILABLE";
  expect((await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template)).source).toBe("deterministic");
});
it("Mongo outage returns the safe template without starting a new fallback cache", async () => {
  const f = fixture();
  vi.mocked(supportDatabase).mockImplementation(() => { throw Error("offline"); });
  expect(await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template)).toBe(f.template);
  vi.mocked(supportDatabase).mockReturnValue(null);
  expect((await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template, "read")).source).toBe("deterministic");
});
it("stores the complete answer and fixes; old metadata-only entries and tampered bodies are misses", async () => {
  const store = createIsolatedFaqCache();
  const f = fixture();
  await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template, "write", store);
  const saved = [...store.values()][0];
  expect(saved.answer).toMatchObject({ summary: f.template.summary,
    stepByStepInstructions: f.template.stepByStepInstructions, nextQuestion: f.template.nextQuestion });
  expect(saved.answer).not.toHaveProperty("model");
  const hit = await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template, "read", store);
  hit.stepByStepInstructions.push("Caller mutation");
  expect(saved.answer.stepByStepInstructions).toEqual(f.template.stepByStepInstructions);
  saved.answer.summary = "Injected text";
  expect((await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template, "read", store)).source).toBe("deterministic");
  Object.assign(saved, { answer: undefined });
  expect((await sharedFaqAnswer(f.input, f.canonical, f.decision, f.template, "read", store)).source).toBe("deterministic");
});
