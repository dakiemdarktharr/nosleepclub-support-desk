import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { completeAnalysis, prepareInput } from "@/services/support";
import { extractIntake } from "@/domain/text";
import { guidanceCacheContext } from "@/domain/guidance-cache-context";
import { FAQ_TTL_MS } from "@/domain/shared-support";
import { resetAnswerCacheForTest } from "@/lib/answer-cache";
import { resetSharedFaqForTest } from "@/lib/shared-faq-cache";
import { withSupportMeasurements, supportMeasurements } from "@/lib/support-telemetry";
import * as repository from "@/lib/support-repository";
import * as guidance from "@/domain/guidance";
import { withGuidanceAnswerCache } from "@/lib/guidance-answer-cache";
import { evaluatePolicy } from "@/domain/policy";
import { submitSupport } from "@/services/support";
import { continueConversation } from "@/services/conversation";

const original = "VPN không kết nối trên Windows";
const paraphrase = "Bạn ơi, trên Windows VPN của mình không kết nối được, giúp mình với!";
const input = (text: string) => prepareInput({ requesterMode: "guest", rawText: text,
  idempotencyKey: crypto.randomUUID() });
const analyze = async (text: string, options = {}) => {
  const safe = input(text);
  return completeAnalysis(safe.input, safe.markers, options);
};
const http = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("AI_MODEL", "synthetic-cache-model");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-unused-key"); vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("AI_WEB_SEARCH", "false"); vi.stubEnv("SUPPORT_SHARED_CACHE_TEST", "true");
  resetAnswerCacheForTest(); resetSharedFaqForTest(); repository.resetSupportTestStore();
  vi.spyOn(repository, "reserveModelAttemptForModel").mockResolvedValue(true);
  http.mockReset().mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    const data = JSON.parse(request.messages.at(-1).content);
    let value: unknown;
    if (request.response_format.json_schema.name === "support_extraction") {
      const { model: _m, redactions: _r, subrequests: _s, ...facts } = extractIntake(input(data.rawText).input);
      void _m; void _r; void _s;
      value = { language: facts.language,
        routing: { route: "support", serviceGroup: facts.serviceGroup, intentLabel: facts.intentLabel, requestKind: facts.requestKind },
        entityFacts: Object.entries(facts.entities).map(([field, quote]) => ({ field, quote })),
        environment: facts.environment, requestedAction: facts.requestedAction,
        riskSignals: facts.riskSignals, missingFields: facts.missingFields, intentEvidence: data.rawText,
        ambiguities: facts.ambiguities, sentiment: { sentiment: "neutral", evidence: data.rawText, explanation: "Đang mô tả sự cố cần hỗ trợ." },
      };
    } else {
      value = { summary: "Mình sẽ hướng dẫn kiểm tra đường truyền và ứng dụng VPN theo thứ tự an toàn.",
        stepIndexes: [0, 1, 3], stepExplanations: [
          "Bước này giúp kiểm tra đường truyền có hoạt động bình thường không.",
          "Bước này giúp đối chiếu ứng dụng và kết nối đang chọn.",
          "Bước này giúp kiểm tra lỗi còn xảy ra sau một lần thử hay không.",
        ], expectedResult: "Bạn kết nối được hoặc có thông báo lỗi để tiếp tục kiểm tra.",
        nextQuestion: "Bạn đang thấy thông báo lỗi gì sau lần thử này?",
        evidenceQuote: data.evidence[0].quote,
      };
    }
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
  });
  vi.stubGlobal("fetch", http);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("reuses the actual model answer and selected fixes for a paraphrase with zero further HTTP/model calls", async () => {
  const first = await analyze(original);
  expect(first.decision.action, JSON.stringify(first)).toBe("AUTO_APPROVE");
  expect(first.assistance?.source).toBe("openai");
  expect(first.assistance?.fallbackReason).toBeUndefined();
  expect(first.assistance?.stepExplanations).toHaveLength(3);
  expect(http).toHaveBeenCalledTimes(2);
  const result = await withSupportMeasurements(async () => ({ next: await analyze(paraphrase), diagnostics: supportMeasurements() }));
  expect(http).toHaveBeenCalledTimes(2);
  expect(result.diagnostics).toMatchObject({ answerCache: "hit", modelCalls: [] });
  expect(result.next.assistance).toMatchObject({ source: "cache", summary: first.assistance!.summary,
    stepByStepInstructions: first.assistance!.stepByStepInstructions, stepExplanations: first.assistance!.stepExplanations,
    nextQuestion: first.assistance!.nextQuestion, cache: { kind: "GUIDANCE", originalSource: "openai" } });
  expect(result.next.assistance?.model).toBeUndefined();
  expect(result.next.assistance?.contextEvidence).toBeUndefined();
  expect(result.next.canonical.evidence.some(row => row.quote.includes(paraphrase))).toBe(true);
  expect(result.next.decision.safeEvidence.some(quote => quote.includes(paraphrase))).toBe(true);
});

it("serves a similar generic FAQ from its saved answer without a second extraction call", async () => {
  const first = await analyze("VPN không kết nối");
  expect(first.assistance, JSON.stringify(first)).not.toBeNull();
  expect(http).toHaveBeenCalledTimes(1);
  const next = await analyze("VPN của em không kết nối được, nhờ hỗ trợ với");
  expect(http).toHaveBeenCalledTimes(1);
  expect(next.assistance).toMatchObject({ source: "cache", summary: first.assistance!.summary,
    stepByStepInstructions: first.assistance!.stepByStepInstructions });
});

it.each([
  ["VPN không kết nối trên Windows", "Trên Windows, VPN của mình không kết nối được", "VPN trên Windows kết nối không được, em nên làm gì", "Nhờ hỗ trợ VPN không vào được trên Windows", "VPN của tôi không hoạt động trên Windows", "Không thể kết nối VPN trên Windows, kiểm tra gì trước", "Cho em hỏi VPN chưa kết nối được trên Windows"],
  ["VPN không kết nối trên macOS", "Trên macOS, VPN của mình không kết nối được", "VPN trên macOS kết nối không được, em nên làm gì", "Nhờ hỗ trợ VPN không vào được trên macOS", "VPN của tôi không hoạt động trên macOS", "Không thể kết nối VPN trên macOS, kiểm tra gì trước", "Cho em hỏi VPN chưa kết nối được trên macOS"],
  ["VPN timeout trên Windows", "Trên Windows, VPN của mình báo timeout", "VPN trên Windows hết thời gian chờ kết nối", "Nhờ hỗ trợ VPN báo timeout trên Windows", "VPN của tôi báo lỗi timeout trên Windows", "VPN timed out trên Windows, kiểm tra gì trước", "Cho em hỏi VPN timeout trên Windows"],
])("reuses one saved AI resolution across seven natural requests: %s", async (...texts) => {
  const first = await analyze(texts[0]);
  expect(first.assistance?.source).toBe("openai");
  expect(http).toHaveBeenCalledTimes(2);
  for (const text of texts.slice(1)) {
    const next = await analyze(text);
    expect(next.assistance?.source, text).toBe("cache");
    expect(next.assistance?.summary).toBe(first.assistance?.summary);
    expect(next.assistance?.stepByStepInstructions).toEqual(first.assistance?.stepByStepInstructions);
    expect(next.canonical.evidence.some(row => row.quote.includes(text))).toBe(true);
  }
  expect(http).toHaveBeenCalledTimes(2);
});

it.each([
  "VPN không kết nối trên macOS", "VPN ngắt kết nối trên Windows", "VPN timeout trên Windows",
  "Wi-Fi không kết nối trên Windows", "VPN không kết nối",
])("does not use the Windows connection answer for different facts: %s", async text => {
  await analyze(original); http.mockClear();
  expect((await analyze(text)).assistance?.source).not.toBe("cache");
  expect(http).toHaveBeenCalled();
});

it.each([
  "VPN không còn ngắt kết nối trên Windows", "VPN không kết nối trên Windows 11",
  "VPN không kết nối trên Windows, mã lỗi 809", "VPN không kết nối trên Windows sau khi đổi DNS",
  "VPN không kết nối trên Windows, nhờ người thật hỗ trợ", "VPN không kết nối trên Windows, cấp quyền admin",
  "VPN không kết nối trên Windows cho demo@example.invalid", "VPN không kết nối trên Windows và macOS",
  "VPN không kết nối trên Windows, tôi đã làm mà vẫn lỗi", "VPN timeout nhưng không phải Windows",
])("does not discard private facts, negations, versions or follow-up context: %s", text => {
  expect(guidanceCacheContext(text)).toBeNull();
});

it("matches timeout paraphrases but keeps OS and a generic connection fault distinct", () => {
  expect(guidanceCacheContext("VPN báo timeout trên Windows")).toEqual(guidanceCacheContext("Trên Windows, VPN hết thời gian chờ kết nối"));
  expect(guidanceCacheContext(original)).not.toEqual(guidanceCacheContext("VPN timeout trên Windows"));
});

it("expires exactly at seven days and invalidates after model or guide changes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  await analyze(original);
  vi.setSystemTime(Date.now() + FAQ_TTL_MS - 1);
  expect((await analyze(paraphrase)).assistance?.source).toBe("cache");
  vi.setSystemTime(Date.now() + 1);
  expect((await analyze(paraphrase)).assistance?.source).toBe("openai");
  vi.stubEnv("AI_MODEL", "another-synthetic-model");
  expect((await analyze(original)).assistance?.source).toBe("openai");
  const oldTemplate = guidance.guidanceTemplate;
  vi.spyOn(guidance, "guidanceTemplate").mockImplementation((...args) => ({ ...oldTemplate(...args), warning: "Hướng dẫn đã thay đổi, giữ các kiểm soát bảo mật." }));
  expect((await analyze(original)).assistance?.source).toBe("openai");
  expect(http).toHaveBeenCalledTimes(8);
});

it("persists the response body in Mongo, survives an in-process reset and rejects tampering", async () => {
  const documents = new Map<string, Record<string, unknown>>();
  const createIndex = vi.fn(async () => "ttl");
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: (name: string) => {
    expect(name).toBe("v3_support_guidance_cache");
    return { createIndex, findOne: async ({ _id }: { _id: string }) => documents.get(_id),
      updateOne: async ({ _id }: { _id: string }, update: { $set: Record<string, unknown> }) => { documents.set(_id, structuredClone(update.$set)); } };
  } } as unknown as Db);
  const first = await analyze(original);
  const row = [...documents.values()][0];
  expect(row.deleteAt).toBeInstanceOf(Date);
  expect(row.value).toMatchObject({ summary: first.assistance!.summary, stepByStepInstructions: first.assistance!.stepByStepInstructions });
  expect(JSON.stringify(row)).not.toMatch(/synthetic-unused-key|contextEvidence|idempotencyKey/);
  resetAnswerCacheForTest();
  expect((await analyze(paraphrase)).assistance?.source).toBe("cache");
  expect(http).toHaveBeenCalledTimes(2);
  (row.value as Record<string, unknown>).summary = "Injected cached answer";
  expect((await analyze(original)).assistance?.source).toBe("openai");
  expect(http).toHaveBeenCalledTimes(4);
  expect(createIndex).toHaveBeenCalledWith({ deleteAt: 1 }, { expireAfterSeconds: 0 });
});

it("a Mongo outage keeps the generated reply without starting a fallback memory cache", async () => {
  vi.spyOn(repository, "supportDatabase").mockImplementation(() => { throw Error("offline"); });
  expect((await analyze(original)).assistance?.source).toBe("openai");
  vi.mocked(repository.supportDatabase).mockReturnValue(null);
  expect((await analyze(original)).assistance?.source).toBe("openai");
  expect(http).toHaveBeenCalledTimes(4);
});

it("never stores fallback answers, operational fields, Verify or follow-up rounds", async () => {
  const safe = input(original);
  const canonical = extractIntake(safe.input);
  const decision = evaluatePolicy(canonical);
  const fallback = vi.fn(async () => ({ ...guidance.guidanceTemplate(canonical), source: "deterministic" as const,
    timestamp: new Date().toISOString(), fallbackReason: "MODEL_UNAVAILABLE" }));
  for (let i = 0; i < 2; i++) await withGuidanceAnswerCache(safe.input, canonical, decision, fallback);
  expect(fallback).toHaveBeenCalledTimes(2);
  await analyze(original); http.mockClear();
  expect((await analyze(original, { assistanceRound: 1 })).assistance?.source).not.toBe("cache");
  const fields = { ...safe.input, fields: { environment: "production" } };
  expect((await completeAnalysis(fields, [])).assistance?.source).not.toBe("cache");
  const verify = { ...safe.input, verifyRunId: crypto.randomUUID() };
  expect((await completeAnalysis(verify, [])).assistance?.source).not.toBe("cache");
  expect(http).toHaveBeenCalled();
});

it("a warmed answer does not replace follow-up troubleshooting or an explicit human handoff", async () => {
  const safe = input(original);
  const row = await submitSupport({ ...safe.input, confirmed: true });
  const second = await submitSupport({ ...input(paraphrase).input, confirmed: true });
  expect(second.assistance[0].source).toBe("cache");
  expect(second.id).not.toBe(row.id);
  expect(second.events[0].requestId).toBe(second.id);
  const handoff = await continueConversation(second.id, { version: second.version, question: "Tôi đã thử nhưng vẫn lỗi, nhờ nhân viên hỗ trợ." });
  expect(handoff.status).toBe("ESCALATED");
  expect(handoff.assistance).toEqual(second.assistance);
  expect(handoff.events.at(-1)?.action).toBe("HANDOFF");
});

it("coalesces concurrent generation of the same public context and does not cache an invalid answer", async () => {
  const safe = input(original);
  const canonical = extractIntake(safe.input), decision = evaluatePolicy(canonical);
  const template = guidance.guidanceTemplate(canonical);
  const generate = vi.fn(async () => ({ ...template, source: "openai" as const, timestamp: new Date().toISOString() }));
  const results = await Promise.all([1, 2, 3].map(() => withGuidanceAnswerCache(safe.input, canonical, decision, generate)));
  expect(generate).toHaveBeenCalledOnce();
  expect(results.filter(result => result.source === "cache")).toHaveLength(2);
  resetAnswerCacheForTest();
  const invalid = vi.fn(async () => ({ ...template, stepByStepInstructions: ["Unreviewed step", "Another unknown step"], source: "openai" as const, timestamp: new Date().toISOString() }));
  // This boundary is downstream of generation validation. An uncacheable result
  // is returned to its existing caller but must never seed a shared answer.
  await withGuidanceAnswerCache(safe.input, canonical, decision, invalid);
  await withGuidanceAnswerCache(safe.input, canonical, decision, generate);
  expect(generate).toHaveBeenCalledTimes(2);
});
