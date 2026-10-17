import { afterEach, expect, it, vi } from "vitest";
import { completeAnalysis, prepareInput } from "@/services/support";

const question = "VPN liên tục ngắt kết nối trên laptop của tôi. Hướng dẫn tôi kiểm tra an toàn.";
function output(field = "deviceType", quote = "laptop") {
  return {
    language: "vi", routing: { route: "support", serviceGroup: "NETWORK_VPN", intentLabel: "VPN_NOT_CONNECTING", requestKind: "GUIDANCE" },
    entityFacts: [{ field: "symptom", quote: "VPN liên tục ngắt kết nối" }, { field, quote }, { field: "requestedAction", quote: "Hướng dẫn tôi kiểm tra an toàn" }],
    environment: "unknown", requestedAction: "guidance", riskSignals: [], missingFields: [],
    intentEvidence: "VPN liên tục ngắt kết nối", ambiguities: [],
    sentiment: { sentiment: "neutral", evidence: question, explanation: "Mô tả sự cố." },
  };
}
afterEach(() => vi.unstubAllEnvs());
it("retains a literally evidenced laptop as useful VPN context, without granting authority", async () => {
  vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("MONGODB_URI", "");
  const { input, markers } = prepareInput({ requesterMode: "guest", rawText: question, idempotencyKey: crypto.randomUUID() });
  const result = await completeAnalysis(input, markers, { run: async () => output() });
  expect(result.canonical.model.failure).toBeUndefined();
  expect(result.canonical.entities.deviceType).toBe("laptop");
  expect(result.canonical.evidence).toContainEqual({ field: "deviceType", quote: "laptop" });
  expect(result.decision.action).toBe("AUTO_APPROVE");
  expect(result.decision.handlingMode).toBe("LLM_ASSIST");
});
it.each([["deviceType", "desktop"], ["licenseType", "laptop"]])("still rejects invented or wrong-service facts: %s %s", async (field, quote) => {
  vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("MONGODB_URI", "");
  const { input, markers } = prepareInput({ requesterMode: "guest", rawText: question, idempotencyKey: crypto.randomUUID() });
  const result = await completeAnalysis(input, markers, { run: async () => output(field, quote) });
  expect(result.canonical.model.failure).toBe("MODEL_EVIDENCE_INVALID");
  expect(result.decision.action).toBe("ESCALATE");
});
