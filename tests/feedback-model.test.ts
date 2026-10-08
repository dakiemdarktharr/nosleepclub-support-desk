import { afterEach, expect, it, vi } from "vitest";
import { analyzeSupportSentiment } from "@/lib/feedback-model";
import type { ModelCall } from "@/lib/support-model";

afterEach(() => vi.unstubAllEnvs());

it("returns the model label with exact evidence for a new support request", async () => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("AI_CONVERSATION_MODEL", "Luna");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
  const text = "Sao chưa có vậy? Mấy tiếng rồi đấy";
  const run = vi.fn(async (call: ModelCall) => {
    expect(call.purpose).toBe("sentiment");
    expect(call.model).toBe("Luna");
    expect(JSON.parse(call.data)).toEqual({ message: text });
    return {
      sentiment: "negative",
      evidence: "Mấy tiếng rồi",
      explanation: "Cụm từ này thể hiện sự sốt ruột vì phải chờ lâu.",
    };
  });

  await expect(analyzeSupportSentiment(text, "support-request", { run }))
    .resolves.toMatchObject({
      sentiment: "negative",
      source: "model",
      model: "Luna",
      evidence: "Mấy tiếng rồi",
    });
});

it("falls back with a clear reason when model evidence is not in the request", async () => {
  vi.stubEnv("AI_PROVIDER", "openai");
  const text = "Sao chưa có vậy? Mấy tiếng rồi đấy";
  const run = vi.fn(async () => ({
    sentiment: "negative",
    evidence: "Mất cả ngày rồi",
    explanation: "Bạn đang sốt ruột vì phải chờ.",
  }));

  await expect(analyzeSupportSentiment(text, "support-request", { run }))
    .resolves.toMatchObject({
      sentiment: "negative",
      source: "rule-based",
      evidence: "Mấy tiếng rồi",
      explanation: "Cụm từ này thể hiện sự sốt ruột hoặc không hài lòng.",
    });
});

it("keeps a bare thank-you neutral in a new support request", async () => {
  vi.stubEnv("AI_PROVIDER", "mock");

  await expect(analyzeSupportSentiment("Nhận được rồi, cảm ơn", "support-request"))
    .resolves.toMatchObject({
      sentiment: "neutral",
      source: "rule-based",
      explanation: "Câu mô tả sự cố hoặc yêu cầu, chưa có dấu hiệu cảm xúc rõ ràng.",
    });
});
