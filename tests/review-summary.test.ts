import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { summarizeReviewRequest } from "@/services/review-summary";
import { submitSupport } from "@/services/support";
import { reviewSupport } from "@/services/review";
import { getSupportRequest, resetSupportTestStore, updateSupportRequest } from "@/lib/support-repository";
import type { ModelCall } from "@/lib/support-model";

const question = "Máy in văn phòng báo kẹt giấy. Tôi cần kiểm tra gì an toàn?";
const valid = { summary: "Người gửi báo máy in kẹt giấy và cần hướng dẫn kiểm tra an toàn.", evidence: ["Máy in văn phòng báo kẹt giấy"] };
const create = (rawText = question) => submitSupport({ requesterMode: "guest", rawText, confirmed: true, idempotencyKey: crypto.randomUUID() });
beforeEach(() => { vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); resetSupportTestStore(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it("summarizes without changing policy, audit, original text or sending a message", async () => {
  const row = await create(); const run = vi.fn(async () => valid);
  expect(await summarizeReviewRequest(row.id, { version: row.version }, { run })).toMatchObject({ source: "openai", summary: valid.summary, cache: "miss" });
  expect(await getSupportRequest(row.id)).toEqual(row);
});
it("caches only within the same request and content; deduplicates concurrent reads", async () => {
  const row = await create(), run = vi.fn(async () => valid);
  const read = () => summarizeReviewRequest(row.id, { version: row.version }, { run });
  await Promise.all([read(), read()]);
  expect(run).toHaveBeenCalledTimes(1);
  expect((await read()).cache).toBe("hit");
  const other = await create(); await summarizeReviewRequest(other.id, { version: other.version }, { run });
  expect(run).toHaveBeenCalledTimes(2);
});
it("reuses unchanged content after reviewer action, but invalidates on a clarification", async () => {
  const row = await create(), run = vi.fn(async () => valid);
  await summarizeReviewRequest(row.id, { version: row.version }, { run });
  const reviewed = await reviewSupport(row.id, { version: row.version, action: "REQUEST_INFORMATION", reason: "Bạn gửi model máy in giúp mình nhé." }, "public-demo-reviewer");
  expect((await summarizeReviewRequest(row.id, { version: reviewed.version }, { run })).cache).toBe("hit");
  const changed = await updateSupportRequest(row.id, reviewed.version, draft => { draft.input.rawText += " Máy in model giả lập ABC."; });
  expect((await summarizeReviewRequest(row.id, { version: changed.version }, { run })).cache).toBe("miss");
  expect(run).toHaveBeenCalledTimes(2);
});
it("does not send private identity fields or raw email into the model context", async () => {
  const row = await create(question + " Email demo@example.invalid.");
  const run = vi.fn(async (call: ModelCall) => { void call; return valid; });
  await summarizeReviewRequest(row.id, { version: row.version }, { run });
  const call = run.mock.calls[0][0];
  expect(call.purpose).toBe("review-summary");
  expect(call.data).not.toContain("demo@example.invalid");
  expect(call.data).not.toContain("employeeId");
  expect(call.maxCompletionTokens).toBe(500);
});
it.each([
  { ...valid, evidence: ["invented quotation"] },
  { ...valid, summary: "Người gửi cần kết nối tới cổng 9999." },
  { ...valid, summary: "Yêu cầu đã được duyệt và hoàn thành." },
  { ...valid, summary: "Bạn hãy chạy sudo để sửa máy in." },
  { summary: valid.summary },
])("does not display or cache invalid model summaries %#", async output => {
  const row = await create(), run = vi.fn(async () => output);
  expect(await summarizeReviewRequest(row.id, { version: row.version }, { run })).toMatchObject({ source: "unavailable", fallbackReason: "SUMMARY_UNAVAILABLE_OR_INVALID" });
  expect((await summarizeReviewRequest(row.id, { version: row.version }, { run: async () => valid })).source).toBe("openai");
  expect(await getSupportRequest(row.id)).toEqual(row);
});
it("rejects stale versions before inference and after an in-flight request changes", async () => {
  const row = await create(), run = vi.fn(async () => valid);
  await expect(summarizeReviewRequest(row.id, { version: row.version + 1 }, { run })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(run).not.toHaveBeenCalled();
  await expect(summarizeReviewRequest(row.id, { version: row.version }, { run: async () => {
    await updateSupportRequest(row.id, row.version, draft => { draft.input.rawText += " Tôi cần nhân viên hỗ trợ."; });
    return valid;
  } })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
});
it("expires the reading-aid cache after 24 hours", async () => {
  const row = await create(), run = vi.fn(async () => valid);
  await summarizeReviewRequest(row.id, { version: row.version }, { run });
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 86400001);
  expect((await summarizeReviewRequest(row.id, { version: row.version }, { run })).cache).toBe("miss");
  expect(run).toHaveBeenCalledTimes(2);
});
it("keeps the original available during provider failure and never labels fallback as Luna", async () => {
  const row = await create();
  const result = await summarizeReviewRequest(row.id, { version: row.version }, { fault: "unavailable" });
  expect(result.source).toBe("unavailable"); expect(result.summary).toBeUndefined();
  expect(await getSupportRequest(row.id)).toEqual(row);
});
