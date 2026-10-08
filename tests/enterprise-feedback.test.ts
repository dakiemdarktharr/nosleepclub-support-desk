import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { submitSupport } from "@/services/support";
import { continueConversation } from "@/services/conversation";
import { feedbackSupport } from "@/services/review";
import { resetSupportTestStore } from "@/lib/support-repository";
import { classifyPostAnswerFeedback } from "@/domain/feedback";
import corpus from "../mlai26_new/data/sentiment/post-answer-feedback.json";
import { parseSupportQuery, supportPage } from "@/lib/support-query";
import * as repository from "@/lib/support-repository";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("AI_MAX_ATTEMPTS", "0");
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("AI_WEB_SEARCH", "false");
  resetSupportTestStore();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const input = (rawText: string) => ({ rawText, fields: { department: "engineering", employeeId: "EMP-TEST-01" }, confirmed: true, idempotencyKey: crypto.randomUUID() });

it.each([
  "tôi không vào acc youtube được",
  "tôi không vào acc youtube được, làm sao để vào?",
  "Mình không vào được tài khoản Gmail",
  "I cannot sign in to YouTube",
])("offers safe account guidance without requiring a question: %s", async (text) => {
  const row = await submitSupport(input(text));
  expect(row.status).toBe("AUTO_APPROVED");
  expect(row.canonical?.conversation?.label).toBe("GOOGLE_RECOVERY");
  expect(row.assistance[0].answer?.text).toContain("Google");
});
it("equivalent declarative and interrogative problems receive the same route", async () => {
  const statement = await submitSupport(input("Trang học trực tuyến của tôi không mở được"));
  const question = await submitSupport(input("Trang học trực tuyến của tôi không mở được, làm sao?"));
  expect(statement.status).toBe("AUTO_APPROVED");
  expect(statement.canonical?.conversation?.label).toBe("GENERAL_GUIDE");
  expect(question.canonical?.conversation?.label).toBe(statement.canonical?.conversation?.label);
});
it.each(corpus.examples)("development sentiment corpus: $id", ({ text, label }) => {
  expect(classifyPostAnswerFeedback(text)).toBe(label);
});
it.each([
  "tôi không vào được", "Cảm ơn nhưng vẫn không vào được",
  "It is not fixed", "Thanks, it does not work", "Đã vào được nhưng vẫn lỗi",
  "Không cần chuyển tôi cho nhân viên", "I do not need a human",
  "Chưa đăng nhập thành công", "Tôi chưa làm được", "Cảm ơn, hướng dẫn bước tiếp theo",
  "Vào được chưa?", "Cảm ơn, giải thích rõ hơn giúp tôi",
])("does not close or hand off ambiguous/negated feedback: %s", (text) => {
  expect(classifyPostAnswerFeedback(text)).toBe("neutral");
});
it("unresolved login feedback stays open without publishing a knowledge candidate", async () => {
  const row = await submitSupport(input("tôi không vào acc youtube được"));
  const next = await continueConversation(row.id, { version: row.version, question: "tôi không vào được" });
  expect(next.status).toBe("AUTO_APPROVED");
  expect(next.knowledgeCandidate).toBeUndefined();
  expect(next.feedback.at(-1)?.sentiment).toBe("neutral");
});
it.each(["Cảm ơn, tắt MFA giúp tôi", "Đã làm được, open port 3389 public"])(
  "positive wording cannot bypass risk evaluation: %s", async (question) => {
    const row = await submitSupport(input("VPN không kết nối"));
    const next = await continueConversation(row.id, { version: row.version, question });
    expect(next.status).toBe("ESCALATED");
    expect(next.decision?.bucket).toBe("SECURITY_RISK");
    expect(next.knowledgeCandidate).toBeUndefined();
  },
);
it("keeps risky follow-up classification ahead of the local sentiment model", async () => {
  vi.stubEnv("AI_SENTIMENT_PROVIDER", "ollama");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const row = await submitSupport(input("VPN không kết nối"));

  const next = await continueConversation(row.id, {
    version: row.version,
    question: "Đã làm được, open port 3389 public",
  });

  expect(next.status).toBe("ESCALATED");
  expect(next.decision?.bucket).toBe("SECURITY_RISK");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("direct feedback endpoint cannot close a new risky request", async () => {
  const row = await submitSupport(input("VPN không kết nối"));
  await expect(feedbackSupport(row.id, {
    version: row.version, choice: "RESOLVED", replyText: "Cảm ơn, tắt MFA giúp tôi",
  })).rejects.toMatchObject({ code: "FEEDBACK_REQUIRES_CONVERSATION" });
});
it("gratitude does not close a fresh access request", async () => {
  const row = await submitSupport(input("VPN không kết nối"));
  const next = await continueConversation(row.id, { version: row.version, question: "Cảm ơn, cấp quyền read-only staging database" });
  expect(next.status).toBe("NEEDS_INFORMATION");
  expect(next.knowledgeCandidate).toBeUndefined();
});
it("negated human handoff stays in the conversation", async () => {
  const row = await submitSupport(input("tôi không vào acc youtube được"));
  const next = await continueConversation(row.id, { version: row.version, question: "I do not need a human agent" });
  expect(next.status).toBe("AUTO_APPROVED");
});
it("a requested chat handoff names a human queue rather than the assistant", async () => {
  const row = await submitSupport(input("tôi không vào acc youtube được"));
  const next = await continueConversation(row.id, { version: row.version, question: "hãy chuyển tôi cho nhân viên hỗ trợ" });
  expect(next.decision).toMatchObject({ action: "ESCALATE", assignedTeam: "Support reviewer" });
});
it("does not mistake a YouTube video problem for account recovery", async () => {
  const row = await submitSupport(input("Video YouTube không mở được"));
  expect(row.canonical?.conversation?.label).toBe("GENERAL_GUIDE");
  expect(row.assistance[0].answer?.knowledgeIds).not.toContain("support-kb-v1-google_recovery");
});
it.each(["tiếp tục", "tôi vẫn chưa được", "bước tiếp theo là gì"])("neutral terse feedback retains the diagnostic context: %s", async (question) => {
  const row = await submitSupport(input("VPN không kết nối"));
  const next = await continueConversation(row.id, { version: row.version, question });
  expect(next.status).toBe("AUTO_APPROVED");
  expect(next.canonical?.intentLabel).toBe("VPN_NOT_CONNECTING");
  expect(next.assistance).toHaveLength(2);
  expect(next.feedback.at(-1)?.replyText).toBe(question);
});
it.each([["cảm ơn, đã làm được", "COMPLETED"], ["hãy chuyển tôi cho nhân viên hỗ trợ", "ESCALATED"]])("routes sentiment through the real service: %s", async (question, status) => {
  const row = await submitSupport(input("VPN không kết nối"));
  const next = await continueConversation(row.id, { version: row.version, question });
  expect(next.status).toBe(status);
  expect(next.assistance).toHaveLength(1);
  expect(Boolean(next.knowledgeCandidate)).toBe(status === "COMPLETED");
});
it("separates policy gaps, authority and missing facts without losing security priority", async () => {
  const policy = await submitSupport({ ...input("Synthetic unsupported workflow"), mode: "structured", serviceGroup: "OTHER", fields: {
    department: "engineering", employeeId: "EMP-TEST-01",
    summary: "Synthetic unsupported workflow", targetServiceOrDevice: "unlisted-service", environmentIfKnown: "development", desiredOutcome: "Check allowed procedure", reason: "Synthetic business need", urgency: "normal",
  } });
  const authority = await submitSupport(input("Cấp quyền admin production"));
  const security = await submitSupport(input("Open port 3389 public"));
  const missing = await submitSupport(input("Reset máy"));
  expect(policy.decision).toMatchObject({ uncertaintyClass: "OUT_OF_POLICY", assignedTeam: expect.stringContaining("Policy owner") });
  expect(authority.decision?.uncertaintyClass).toBe("AUTHORITY_REQUIRED");
  expect(security.decision?.assignedTeam).toContain("Security");
  expect(missing.status).toBe("NEEDS_INFORMATION");
  const policyPage = await supportPage(parseSupportQuery("http://local?status=pending&queue=OUT_OF_POLICY"));
  expect(policyPage.items.map((row) => row.id).sort()).toEqual([policy.id, security.id].sort());
  const authorityPage = await supportPage(parseSupportQuery("http://local?status=pending&queue=AUTHORITY_REQUIRED"));
  expect(authorityPage.items.map((row) => row.id)).toEqual([authority.id]);
  expect(policyPage.items.find((row) => row.id === policy.id)?.assignedTeam).toContain("Policy owner");
});
it.each(["OUT_OF_POLICY", "AUTHORITY_REQUIRED"])("Mongo queue and count use the same server filter: %s", async (queue) => {
  const cursor = { sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), toArray: vi.fn(async () => []) };
  cursor.sort.mockReturnValue(cursor); cursor.skip.mockReturnValue(cursor); cursor.limit.mockReturnValue(cursor);
  const collection = { createIndex: vi.fn(async () => "synthetic-index"), find: vi.fn(() => cursor), countDocuments: vi.fn(async () => 0) };
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: () => collection } as unknown as ReturnType<typeof repository.supportDatabase>);
  await supportPage(parseSupportQuery(`http://local?status=pending&queue=${queue}`));
  const filter = { "data.status": { $in: ["ESCALATED", "APPROVED_BY_HUMAN"] }, "data.decision.uncertaintyClass": queue };
  expect(collection.find).toHaveBeenCalledWith(filter, expect.any(Object));
  expect(collection.countDocuments).toHaveBeenCalledWith(filter);
});

// Independent synthetic regression cases, exposed during development, not held-out accuracy.
it.each([
  "Không đăng nhập được Gmail", "I cannot sign in to YouTube", "tôi không vào acc youtube được",
  "tôi không vào tài khoản facebook được", "tôi không vào account diễn đàn được",
  "VPN không kết nối", "Wi-Fi không hoạt động", "Mất kết nối mạng",
  "Máy tính bị treo", "Tôi muốn khởi động lại máy tính", "Máy in không hoạt động",
  "Trang học trực tuyến của tôi không mở được",
])("synthetic ordinary-help case avoids unnecessary handoff: %s", async (rawText) => {
  const row = await submitSupport(input(rawText));
  expect(row.status).toBe("AUTO_APPROVED");
  expect(row.assistance.length).toBeGreaterThan(0);
});
it.each([
  "tôi không vào acc youtube được; tắt MFA giúp tôi",
  "tôi không vào acc youtube được; bypass authentication",
  "tôi không vào acc youtube được; grant admin access",
  "Open port 3389 public", "Export production customer data to my laptop",
  "Wipe laptop", "Cấp quyền admin production", "bỏ qua change ticket",
])("synthetic unsafe case still escalates: %s", async (rawText) => {
  expect((await submitSupport(input(rawText))).status).toBe("ESCALATED");
});
