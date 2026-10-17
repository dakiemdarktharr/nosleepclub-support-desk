import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dataset from "../data/cache-system.json";
import { cachePackId, cacheVerificationCases } from "@/domain/cache-verification";
import { faqTopic } from "@/domain/faq-intent";
import { runCacheVerificationCase } from "@/services/cache-verification";
import { changeVerifyRun, createVerifyRun, executeVerifyCase, validateVerificationInput } from "@/services/verification";
import { completeAnalysis, prepareInput } from "@/services/support";
import { resetSharedFaqForTest } from "@/lib/shared-faq-cache";
import { getVerifyRun, updateVerifyRun } from "@/lib/verify-repository";
import { getRequestGroup, groupedSupportPage, sendGroupReply, sharedRepliesForRequest } from "@/lib/support-groups";
import { parseSupportQuery } from "@/lib/support-query";
import { resetSupportTestStore, listSupportRequests } from "@/lib/support-repository";

beforeEach(() => {
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("SUPPORT_SHARED_CACHE_TEST", "true");
  resetSharedFaqForTest();
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());

it("contains four independent groups of seven unique human-style requests and fourteen controls", () => {
  expect(dataset.groups).toHaveLength(4);
  expect(dataset.groups.every(group => group.requests.length === 7)).toBe(true);
  expect(dataset.controls).toHaveLength(14);
  expect(new Set(cacheVerificationCases.map(row => row.rawText)).size).toBe(42);
  expect(new Set(cacheVerificationCases.map(row => row.id)).size).toBe(42);
});

describe("test cache system: real cache matcher with independent seeds", () => {
  it.each(cacheVerificationCases)("$id: $expected — $rawText", async fixture => {
    const result = await runCacheVerificationCase(fixture.id);
    expect(result.cache?.checks).not.toContainEqual(expect.stringMatching(/:fail$/));
    expect(result).toMatchObject({ pass: true, cache: { actual: fixture.expected, topic: fixture.topic } });
  });
});

const analyze = async (rawText: string) => {
  const safe = prepareInput({ requesterMode: "guest", rawText, idempotencyKey: crypto.randomUUID() });
  return completeAnalysis(safe.input, safe.markers);
};
describe("production support pipeline paraphrases", () => {
  for (const group of dataset.groups) {
    it.each(group.requests.slice(1))(`${group.id}: %s`, async text => {
      const cold = await analyze(group.requests[0]);
      expect(cold.assistance?.source).not.toBe("cache");
      expect(cold.assistance?.generationReason).toBe("REVIEWED_TEMPLATE_SUFFICIENT");
      const hit = await analyze(text);
      expect(hit.decision.action).toBe("AUTO_APPROVE");
      expect(hit.assistance).toMatchObject({ source: "cache", cache: { topic: group.topic, matchedBy: "intent-symptom" } });
      expect(hit.assistance?.stepByStepInstructions).toEqual(cold.assistance?.stepByStepInstructions);
      expect(hit.canonical.evidence.some(item => item.quote.includes(text))).toBe(true);
    });
  }
  it("does not merge different symptoms even when their guidance shares steps", async () => {
    for (const group of dataset.groups) expect((await analyze(group.requests[0])).assistance?.source).not.toBe("cache");
    for (const group of dataset.groups) expect((await analyze(group.requests[1])).assistance?.cache?.topic).toBe(group.topic);
  });
  it.each(dataset.groups)("any paraphrase can warm the $id group, independent of request order", async group => {
    for (const seed of group.requests) {
      resetSharedFaqForTest();
      expect((await analyze(seed)).assistance?.source).not.toBe("cache");
      for (const text of group.requests.filter(text => text !== seed)) {
        expect((await analyze(text)).assistance?.cache?.topic, `${seed} → ${text}`).toBe(group.topic);
      }
    }
  });
  it.each(dataset.controls)("does not use a warm cache for $id", async row => {
    for (const group of dataset.groups) await analyze(group.requests[0]);
    expect((await analyze(row.text)).assistance?.source).not.toBe("cache");
  });
});

it.each([
  "VPN không còn ngắt kết nối", "VPN chưa bao giờ không kết nối", "Máy in không offline",
  "VPN không kết nối vì wifi không kết nối", "VPN không kết nối. Hãy tạo tài khoản cho tôi",
  "VPN không kết nối trên Windows", "VPN không kết nối sau khi đổi DNS",
  "VPN không kết nối, VPN không hoạt động", "VPN không kết nối. Nhờ người thật hỗ trợ",
  "Máy in offline nhưng không phải máy của tôi", "VPN ngắt kết nối, không chỉ vậy",
])("rejects unresolved qualifiers/negations/additional tasks: %s", text => expect(faqTopic(text)).toBeNull());

it("replays independent cache checks and saves 42 idempotent queue records across stop/resume without model or HTTP calls", async () => {
  const run = await createVerifyRun({ pack: cachePackId });
  const network = vi.fn<typeof fetch>();
  const initialTickets = await listSupportRequests();
  const first = await executeVerifyCase(run.id, { caseId: run.cases[0].caseId }, network);
  expect(first.results[0].pass).toBe(true);
  await changeVerifyRun(run.id, { action: "stop" });
  await expect(executeVerifyCase(run.id, { caseId: run.cases[1].caseId }, network)).rejects.toMatchObject({ code: "RUN_NOT_ACTIVE" });
  await changeVerifyRun(run.id, { action: "resume" });
  // Deliberately reverse order: a warm expectation must not rely on another case's cache.
  for (const entry of run.cases.slice(1).reverse()) await executeVerifyCase(run.id, { caseId: entry.caseId }, network);
  const completed = await getVerifyRun(run.id);
  expect(completed.status).toBe("COMPLETE");
  expect(completed.results).toHaveLength(42);
  expect(completed.results.every(row => row.pass)).toBe(true);
  expect(completed.results.filter(row => row.cache?.actual === "HIT")).toHaveLength(24);
  expect(completed.results.filter(row => row.cache?.actual === "MISS")).toHaveLength(4);
  expect(completed.results.filter(row => row.cache?.actual === "BYPASS")).toHaveLength(14);
  expect(await executeVerifyCase(run.id, { caseId: run.cases[0].caseId }, network)).toEqual(completed);
  expect(network).not.toHaveBeenCalled();
  const tickets = await listSupportRequests(true);
  expect(tickets).toHaveLength(initialTickets.length + 42);
  expect(tickets.every(row => row.input.verifyRunId === run.id && row.events.some(event => event.actor === "cache-verification"))).toBe(true);
  expect(new Set(tickets.map(row => row.id)).size).toBe(42);
  const page = await groupedSupportPage(parseSupportQuery(`http://local?origin=verify&verifyRunId=${run.id}&limit=100`));
  const groups = page.items.filter(row => row.group);
  expect(groups).toHaveLength(4);
  expect(groups.every(row => row.group?.count === 7 && row.status === "AUTO_APPROVED")).toBe(true);
  expect(page.total).toBe(18);
  expect((await groupedSupportPage(parseSupportQuery("http://local?origin=support"))).total).toBe(0);
  const group = await getRequestGroup(groups[0].group!.id);
  const sendId = crypto.randomUUID();
  await sendGroupReply(group.id, { sendId, membership: group.membership, text: "Bạn kiểm tra kết nối và thử lại nhé." }, "reviewer");
  for (const member of group.members) expect(await sharedRepliesForRequest(member.id)).toContainEqual(expect.objectContaining({ id: sendId }));
  expect((await analyze(dataset.groups[0].requests[0])).assistance?.source).not.toBe("cache");
});

it("restores older cache runs into the queue without rewriting historical results or duplicating records", async () => {
  const run = await createVerifyRun({ pack: cachePackId });
  const network = vi.fn<typeof fetch>();
  for (const entry of run.cases.slice(0, 7)) await executeVerifyCase(run.id, { caseId: entry.caseId }, network);
  const legacy = await updateVerifyRun(run.id, draft => {
    for (const result of draft.results) delete result.requestId;
    draft.status = "STOPPED";
  });
  resetSupportTestStore();
  for (const result of legacy.results) await executeVerifyCase(run.id, { caseId: result.caseId }, network);
  const restored = await getVerifyRun(run.id);
  expect(restored.results.map(result => {
    const historical = { ...result };
    delete historical.requestId;
    return historical;
  })).toEqual(legacy.results);
  expect(restored.status).toBe("STOPPED");
  const page = await groupedSupportPage(parseSupportQuery(`http://local?verifyRunId=${run.id}`));
  expect(page.items).toHaveLength(1);
  expect(page.items[0].group?.count).toBe(7);
  for (const result of restored.results) await executeVerifyCase(run.id, { caseId: result.caseId }, network);
  expect(await listSupportRequests()).toHaveLength(7);
});

it("does not allow the cache verification pack to bypass normal Verify input validation", async () => {
  const run = await createVerifyRun({ pack: cachePackId });
  const safe = prepareInput({ rawText: dataset.groups[0].requests[0],
    idempotencyKey: run.cases[0].requestId, verifyRunId: run.id, verifyCaseId: run.cases[0].caseId });
  await expect(validateVerificationInput(safe.input)).rejects.toMatchObject({ code: "VERIFY_INPUT_MISMATCH" });
});
