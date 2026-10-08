import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as sentimentModel from "@/lib/feedback-model";
import { submitSupport } from "@/services/support";
import { feedbackSupport, reviewSupport } from "@/services/review";
import { continueConversation } from "@/services/conversation";
import { getSupportRequest, resetSupportTestStore } from "@/lib/support-repository";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("AI_MAX_ATTEMPTS", "0");
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("AI_WEB_SEARCH", "false");
  resetSupportTestStore();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const create = () => submitSupport({
  rawText: "VPN không kết nối",
  fields: { department: "engineering", employeeId: "EMP-SYNTH-01" },
  confirmed: true,
  idempotencyKey: crypto.randomUUID(),
});
function modelPositive() {
  return vi.spyOn(sentimentModel, "analyzeSupportSentiment").mockResolvedValue({
    sentiment: "positive", source: "model", evidence: "Đã làm được",
    explanation: "Xác nhận đã làm được.",
  });
}

it("rejects missing feedback targets before spending a sentiment call", async () => {
  const model = modelPositive();
  await expect(feedbackSupport(crypto.randomUUID(), {
    version: 0, choice: "RESOLVED", replyText: "Đã làm được",
  })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(model).not.toHaveBeenCalled();
});

it("rejects stale feedback before spending a sentiment call", async () => {
  const row = await create();
  const model = modelPositive();
  await expect(feedbackSupport(row.id, {
    version: row.version + 1, choice: "RESOLVED", replyText: "Đã làm được",
  })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(model).not.toHaveBeenCalled();
  expect(await getSupportRequest(row.id)).toEqual(row);
});

it.each(["STOP", "REJECT"] as const)("rejects %s feedback before calling a model", async (action) => {
  const row = await create();
  const closed = await reviewSupport(row.id, {
    version: row.version, action, reason: "Synthetic review for regression",
  }, "synthetic-reviewer");
  const model = modelPositive();
  await expect(feedbackSupport(row.id, {
    version: closed.version, choice: "RESOLVED", replyText: "Đã làm được",
  })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  expect(model).not.toHaveBeenCalled();
  expect(await getSupportRequest(row.id)).toEqual(closed);
});

it.each(["positive", "neutral"] as const)(
  "an explicit human request cannot be overridden by %s model sentiment",
  async (sentiment) => {
    const row = await create();
    const model = modelPositive();
    model.mockResolvedValue({
      sentiment, source: "model", evidence: "Cảm ơn",
      explanation: "Phản hồi lịch sự.",
    });
    const next = await continueConversation(row.id, {
      version: row.version, question: "Cảm ơn, chuyển admin giúp tôi",
    });
    expect(next.status).toBe("ESCALATED");
    expect(next.decision?.ruleIds).toContain("HANDOFF-001");
    expect(next.events.at(-1)?.ruleIds).toContain("HANDOFF-001");
    expect(next.knowledgeCandidate).toBeUndefined();
    expect(model).not.toHaveBeenCalled();
  },
);

it("direct feedback cannot close a policy handoff request", async () => {
  const row = await create();
  const model = modelPositive();
  await expect(feedbackSupport(row.id, {
    version: row.version, choice: "RESOLVED", replyText: "Cảm ơn, chuyển admin giúp tôi",
  })).rejects.toMatchObject({ code: "FEEDBACK_REQUIRES_CONVERSATION" });
  expect(model).not.toHaveBeenCalled();
  expect(await getSupportRequest(row.id)).toEqual(row);
});
