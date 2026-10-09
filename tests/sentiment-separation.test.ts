import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as sentimentModel from "@/lib/feedback-model";
import { submitSupport } from "@/services/support";
import { continueConversation } from "@/services/conversation";
import { feedbackSupport } from "@/services/review";
import { resetSupportTestStore } from "@/lib/support-repository";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("AI_MAX_ATTEMPTS", "0");
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("AI_WEB_SEARCH", "false");
  resetSupportTestStore();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const create = () => submitSupport({
  rawText: "VPN không kết nối", fields: { department: "engineering", employeeId: "EMP-SYNTH-01" },
  confirmed: true, idempotencyKey: crypto.randomUUID(),
});
function mood(sentiment: "positive" | "negative" | "neutral") {
  return vi.spyOn(sentimentModel, "analyzeSupportSentiment").mockResolvedValue({
    sentiment, source: "model", evidence: "cảm xúc", explanation: "Stub kiểm tra boundary, không phải inference.",
  });
}

it.each(["positive", "negative"] as const)("emotion %s alone cannot close or hand off a ticket", async (sentiment) => {
  const row = await create();
  const model = mood(sentiment);
  const next = await continueConversation(row.id, { version: row.version, question: sentiment === "positive" ? "Tôi rất hài lòng." : "Tôi rất bực mình." });
  expect(next.status).toBe("AUTO_APPROVED");
  expect(next.decision).toEqual(row.decision);
  expect(next.knowledgeCandidate).toBeUndefined();
  expect(next.feedback.at(-1)?.sentiment).toBe(sentiment);
  expect(next.feedback.at(-1)?.sentimentAssessment?.source).toBe("model");
  expect(model).toHaveBeenCalledOnce();
});

it("workflow buttons do not manufacture emotional labels or call the model", async () => {
  const row = await create();
  const model = mood("positive");
  const next = await feedbackSupport(row.id, { version: row.version, choice: "ADMIN" });
  expect(next.status).toBe("ESCALATED");
  expect(next.feedback.at(-1)?.sentiment).toBe("neutral");
  expect(next.feedback.at(-1)?.sentimentAssessment).toBeUndefined();
  expect(model).not.toHaveBeenCalled();
});

it("satisfaction with an unresolved issue cannot close it even if the model says positive", async () => {
  const row = await create();
  mood("positive");
  const next = await continueConversation(row.id, { version: row.version, question: "Rất hài lòng, nhưng VPN vẫn không kết nối." });
  expect(next.status).not.toBe("COMPLETED");
  expect(next.knowledgeCandidate).toBeUndefined();
});

it("explicit resolution is independent of negative tone", async () => {
  const row = await create();
  mood("negative");
  const next = await continueConversation(row.id, { version: row.version, question: "Tôi bực mình vì chờ lâu, nhưng đã làm được." });
  expect(next.status).toBe("COMPLETED");
  expect(next.feedback.at(-1)?.sentiment).toBe("negative");
  expect(next.knowledgeCandidate?.status).toBe("PENDING_REVIEW");
});

it("a direct resolved choice cannot contradict an unresolved free-text reply", async () => {
  const row = await create();
  mood("positive");
  await expect(feedbackSupport(row.id, { version: row.version, choice: "RESOLVED", replyText: "Tôi rất hài lòng nhưng VPN vẫn không kết nối." }))
    .rejects.toMatchObject({ code: "FEEDBACK_REQUIRES_CONVERSATION" });
});

it.each([
  "Đã làm được chưa?", "Tôi chưa làm được", "Nếu đã làm được thì tôi báo sau",
  "Bạn nói đã làm được nhưng tôi vẫn lỗi",
])("does not infer explicit resolution from a question, negation or conditional: %s", async (question) => {
  const row = await create();
  mood("positive");
  const next = await continueConversation(row.id, { version: row.version, question });
  expect(next.status).not.toBe("COMPLETED");
});

it("repeated affect comments never exhaust the diagnostic rounds or trigger a handoff", async () => {
  let row = await create();
  mood("negative");
  for (let turn = 0; turn < 4; turn++) {
    row = await continueConversation(row.id, { version: row.version, question: "Tôi rất bực mình." });
  }
  expect(row.status).toBe("AUTO_APPROVED");
  expect(row.assistance).toHaveLength(1);
  expect(row.events.at(-1)?.explanation).toContain("Không đổi trạng thái");
});

it("positive affect with synthetic PII remains subject to policy and redaction in persistence/audit", async () => {
  const row = await create();
  const model = mood("positive");
  const next = await continueConversation(row.id, {
    version: row.version, question: "Tôi rất hài lòng; email synthetic@example.invalid, OTP: 123456",
  });
  expect(next.status).toBe("ESCALATED");
  expect(next.decision?.bucket).toBe("SECURITY_RISK");
  expect(model).not.toHaveBeenCalled();
  expect(JSON.stringify(next)).not.toContain("synthetic@example.invalid");
  expect(JSON.stringify(next)).not.toContain("123456");
});
