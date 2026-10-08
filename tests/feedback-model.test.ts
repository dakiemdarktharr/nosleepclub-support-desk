import { afterEach, expect, it, vi } from "vitest";
import { analyzeSupportSentiment, supportRequestSentimentFallback } from "@/lib/feedback-model";
import type { ModelCall } from "@/lib/support-model";

afterEach(() => vi.restoreAllMocks());

it("uses grounded model output and redacts recognized input before the model boundary", async () => {
  const run = vi.fn(async (call: ModelCall) => {
    expect(call.purpose).toBe("sentiment");
    expect(call.data).not.toContain("synthetic@example.invalid");
    expect(call.data).not.toContain("123456");
    expect(call.data).toContain("[REDACTED_EMAIL]");
    return JSON.stringify({
      sentiment: "neutral", evidence: "Tôi đã nhận hướng dẫn",
      explanation: "Chỉ xác nhận đã nhận hướng dẫn.",
    });
  });
  const assessment = await analyzeSupportSentiment(
    "Tôi đã nhận hướng dẫn, liên hệ synthetic@example.invalid; OTP: 123456",
    "post-answer", { run },
  );
  expect(assessment).toMatchObject({ sentiment: "neutral", source: "model" });
  expect(run).toHaveBeenCalledOnce();
});

it.each([
  { sentiment: "positive", evidence: "invented evidence", explanation: "Hài lòng." },
  { sentiment: "positive", evidence: "Đã làm được", explanation: "Gửi OTP: 123456" },
  { sentiment: "positive", evidence: "Đã làm được", explanation: "Gửi synthetic@example.invalid" },
  { sentiment: "positive", evidence: "Đã làm được", explanation: "Đã xong.", extra: true },
  "invalid JSON",
])("falls back on ungrounded, sensitive or malformed model output: %j", async (output) => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = await analyzeSupportSentiment("Đã làm được", "post-answer", {
    run: async () => output,
  });
  expect(result).toMatchObject({ sentiment: "positive", source: "rule-based" });
  expect(JSON.stringify(result)).not.toContain("123456");
  expect(JSON.stringify(result)).not.toContain("synthetic@example.invalid");
});

it("returns a labelled fallback on model timeout", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = await analyzeSupportSentiment("Đã làm được", "post-answer", {
    run: () => new Promise(() => {}), timeoutMs: 1,
  });
  expect(result).toMatchObject({ sentiment: "positive", source: "rule-based" });
});

it("uses explicit waiting language as negative fallback evidence", () => {
  expect(supportRequestSentimentFallback("Sao chưa có vậy? Mấy tiếng rồi đấy"))
    .toMatchObject({
      sentiment: "negative",
      source: "rule-based",
      evidence: "Mấy tiếng rồi",
    });
});

it("keeps a bare thank-you neutral for a new support request", () => {
  expect(supportRequestSentimentFallback("Nhận được rồi, cảm ơn"))
    .toMatchObject({
      sentiment: "neutral",
      source: "rule-based",
      explanation: "Câu mô tả sự cố hoặc yêu cầu, chưa có dấu hiệu cảm xúc rõ ràng.",
    });
});

it("does not infer negative sentiment from a factual problem description", () => {
  expect(supportRequestSentimentFallback("VPN không kết nối"))
    .toMatchObject({ sentiment: "neutral", source: "rule-based" });
});

it("shows an explicit satisfaction cue as positive fallback", () => {
  expect(supportRequestSentimentFallback("Tôi rất hài lòng với cách hỗ trợ"))
    .toMatchObject({
      sentiment: "positive",
      source: "rule-based",
      evidence: "rất hài lòng",
    });
});

it("does not claim to assess an empty structured request", () => {
  expect(supportRequestSentimentFallback(""))
    .toMatchObject({ sentiment: "neutral", source: "not-assessed" });
});
