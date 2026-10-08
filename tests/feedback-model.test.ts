import { expect, it } from "vitest";
import { supportRequestSentimentFallback } from "@/lib/feedback-model";

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
