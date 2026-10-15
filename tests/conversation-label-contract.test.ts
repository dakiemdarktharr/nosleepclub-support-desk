import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupportInput } from "@/domain/contracts";
import { conversationRoute, type ConversationLabel } from "@/domain/conversation";
import { extractIntake } from "@/domain/text";
import { knowledgeSeed } from "@/domain/knowledge";
import { validateAnswer } from "@/lib/conversation-model";
import { resetSupportTestStore } from "@/lib/support-repository";
import { resetAnswerCacheForTest } from "@/lib/answer-cache";
import { submitSupport } from "@/services/support";
import type { ModelCall } from "@/lib/support-model";

const input = (rawText: string): SupportInput => ({
  rawText, mode: "freeform", serviceGroup: "OTHER",
  fields: { department: "engineering", employeeId: "SYNTHETIC-LABEL-01" },
  confirmed: true, idempotencyKey: crypto.randomUUID(),
});
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("AI_WEB_SEARCH", "false");
  resetSupportTestStore();
  resetAnswerCacheForTest();
});
afterEach(() => vi.unstubAllEnvs());

it.each<[string, ConversationLabel]>([
  ["DNS là gì? Hãy giải thích ngắn gọn.", "GENERAL_GUIDE"],
  ["Xin chào", "GREETING"],
  ["Hôm nay ăn gì?", "EVERYDAY"],
  ["What is an operating system?", "GENERAL_GUIDE"],
  ["Chính sách công ty về nghỉ phép?", "COMPANY_POLICY"],
  ["Làm sao khôi phục tài khoản Google?", "GOOGLE_RECOVERY"],
])("uses one server label for routing, answer and audit: %s", async (text, label) => {
  const request = input(text);
  expect(conversationRoute(request, extractIntake(request))?.label).toBe(label);
  const run = vi.fn(async (call: ModelCall) => {
    expect(call.purpose).toBe("assistance");
    expect(call.responseSchema).toMatchObject({ properties: { label: { enum: [label] } } });
    expect(call.instructions).toContain("server-owned routing label");
    const data = JSON.parse(call.data) as { contextLabel: string; articles: { _id: string; answer: string }[] };
    expect(data.contextLabel).toBe(label);
    const article = data.articles[0];
    return {
      // A valid enum value, but deliberately inconsistent with server routing.
      label: label === "EVERYDAY" ? "GENERAL_GUIDE" : "EVERYDAY",
      text: "Đây là hướng dẫn tham khảo; hãy làm theo tài liệu đã được xác minh.",
      knowledgeIds: article ? [article._id] : [],
      evidence: article ? [{ knowledgeId: article._id, quote: article.answer.slice(0, 80) }] : [],
    };
  });
  const row = await submitSupport(request, { run });
  expect(row.canonical?.intentLabel).toBe(`CHAT_${label}`);
  expect(row.assistance[0].answer?.label).toBe(label);
  const event = row.events.find(event => event.action === "ANSWER");
  expect(JSON.parse(event!.explanation).label).toBe(label);
  if (label === "COMPANY_POLICY") expect(run).not.toHaveBeenCalled();
  else expect(run).toHaveBeenCalledOnce();
});

it("keeps evidence validation when a recovery answer supplies a benign label", () => {
  const article = knowledgeSeed.find(row => row.label === "GOOGLE_RECOVERY")!;
  expect(() => validateAnswer({
    label: "EVERYDAY", text: "Làm theo hướng dẫn chính thức để khôi phục tài khoản.",
    knowledgeIds: [article._id], evidence: [],
  }, article.sources, [article._id], "GOOGLE_RECOVERY", [article])).toThrow();
});

it("keeps safety validation before replacing a mismatched answer label", () => {
  expect(() => validateAnswer({
    label: "EVERYDAY", text: "Hãy tắt MFA rồi thử đăng nhập lại.", knowledgeIds: [],
  }, [], [], "GENERAL_GUIDE", [])).toThrow();
});

it("rejects a model label outside the contract instead of silently fixing malformed output", () => {
  expect(() => validateAnswer({
    label: "APPROVED", text: "Đây là câu trả lời không có nhãn hợp lệ.", knowledgeIds: [],
  }, [], [], "GENERAL_GUIDE", [])).toThrow();
});
