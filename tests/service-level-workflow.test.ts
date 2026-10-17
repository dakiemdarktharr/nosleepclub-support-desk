import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { submitSupport } from "@/services/support";
import { clarifySupport, feedbackSupport, reviewSupport } from "@/services/review";
import { getSupportRequest, insertSupportRequest, resetSupportTestStore, updateSupportRequest } from "@/lib/support-repository";
import { getRequestGroup, groupedSupportPage, resetGroupRepliesForTest, sendGroupReply } from "@/lib/support-groups";
import { parseSupportQuery } from "@/lib/support-query";
import { requestServiceLevels, serviceLevelReport } from "@/services/service-level";
import { GET as detail } from "@/app/api/review/[id]/service-level/route";
import { GET as report } from "@/app/api/review/service-level/route";
import type { SupportRequest } from "@/domain/contracts";

beforeEach(() => {
  vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("AI_PROVIDER", "mock");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime("2026-10-17T01:00:00.000Z");
  resetSupportTestStore(); resetGroupRepliesForTest();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const create = (rawText = "Restart laptop") => submitSupport({ requesterMode: "guest", rawText, confirmed: true, idempotencyKey: crypto.randomUUID() });
const handoff = async () => {
  const row = await create("Máy in offline");
  return feedbackSupport(row.id, { version: row.version, choice: "ADMIN" });
};
const window = { from: "2026-10-17T00:00:00.000Z", to: "2026-10-18T00:00:00.000Z" };

it("records only new business events; preview/idempotent submit cannot start duplicate clocks", async () => {
  const row = await create();
  expect(row.serviceLevel!.clocks.map(clock => clock.metric)).toEqual(["support_completion"]);
  const again = await submitSupport({ ...row.input });
  expect(again).toEqual(row);
  expect((await requestServiceLevels(row.id)).clocks[0]).toMatchObject({ mode: "SHADOW", outcome: "UNCONFIGURED", businessMs: null, remainingMs: null });
});
it("stops first-human response only after the explicit message is committed", async () => {
  const row = await handoff();
  vi.setSystemTime("2026-10-17T02:00:00.000Z");
  const approved = await reviewSupport(row.id, { version: row.version, action: "APPROVE" }, "public-demo-reviewer");
  expect((await requestServiceLevels(row.id)).clocks.find(clock => clock.metric === "human_response")?.state).toBe("RUNNING");
  const sent = await reviewSupport(row.id, { version: approved.version, action: "SEND_MESSAGE", reason: "Kiểm tra nguồn và kết nối máy in" }, "public-demo-reviewer");
  expect(sent.status).toBe(approved.status);
  expect((await requestServiceLevels(row.id)).clocks.find(clock => clock.metric === "human_response")).toMatchObject({ state: "COMPLETED", elapsedMs: 3_600_000 });
});
it("tracks requester wait separately and records clarification without resetting overall elapsed", async () => {
  const row = await create("Need database access");
  expect(row.status).toBe("NEEDS_INFORMATION");
  vi.setSystemTime("2026-10-17T02:00:00.000Z");
  await clarifySupport(row.id, { version: row.version, rawText: "Chỉ hỏi cách khởi động lại laptop" });
  const view = await requestServiceLevels(row.id);
  expect(view.clocks.find(clock => clock.metric === "requester_wait")).toMatchObject({ state: "COMPLETED", elapsedMs: 3_600_000 });
  expect(view.clocks.find(clock => clock.metric === "support_completion")).toMatchObject({ startedAt: "2026-10-17T01:00:00.000Z", elapsedMs: 3_600_000, pauses: [] });
});
it("commits one stop, clock cancellation and audit under competing versions", async () => {
  const row = await handoff(); vi.setSystemTime("2026-10-17T02:00:00.000Z");
  const action = { version: row.version, action: "STOP", reason: "Dừng yêu cầu thử nghiệm" };
  const outcomes = await Promise.allSettled([reviewSupport(row.id, action, "public-demo-reviewer"), reviewSupport(row.id, action, "public-demo-reviewer")]);
  expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
  const saved = (await getSupportRequest(row.id))!;
  expect(saved.version).toBe(row.version + 1);
  expect(saved.serviceLevel!.clocks.every(clock => clock.state === "CANCELLED")).toBe(true);
  expect(saved.serviceLevel!.events.filter(event => event.action === "CANCEL")).toHaveLength(saved.serviceLevel!.clocks.length);
  expect(saved.events.filter(event => event.action === "STOP")).toHaveLength(1);
});
it("does not leave a partial clock or audit when a mutation fails", async () => {
  const row = await handoff();
  await expect(updateSupportRequest(row.id, row.version, draft => { draft.status = "STOPPED"; throw new Error("synthetic-failure"); })).rejects.toThrow("synthetic-failure");
  expect(await getSupportRequest(row.id)).toEqual(row);
});
it("opens a new measured cycle on the real reviewer reopen action, retaining the rejected cycle", async () => {
  const row = await handoff();
  const rejected = await reviewSupport(row.id, { version: row.version, action: "REJECT", reason: "Từ chối hồ sơ thử nghiệm" }, "public-demo-reviewer");
  vi.setSystemTime("2026-10-17T02:00:00.000Z");
  const reopened = await reviewSupport(row.id, { version: rejected.version, action: "OVERRIDE", target: "NEEDS_INFORMATION", reason: "Mở lại để bổ sung thông tin" }, "public-demo-reviewer");
  expect(reopened.serviceLevel!.clocks.filter(clock => clock.metric === "human_response").map(clock => clock.state)).toEqual(["CANCELLED", "RUNNING"]);
  expect(reopened.serviceLevel!.clocks.filter(clock => clock.metric === "support_completion").map(clock => clock.state)).toEqual(["CANCELLED", "RUNNING"]);
});
it("keeps legacy tickets unmeasured after review without fabricating timestamps", async () => {
  const current = await create(), legacy: SupportRequest = { ...current, id: crypto.randomUUID() };
  delete legacy.serviceLevel; await insertSupportRequest(legacy);
  const reviewed = await reviewSupport(legacy.id, { version: legacy.version, action: "STOP", reason: "Dừng hồ sơ lịch sử" }, "public-demo-reviewer");
  expect(reviewed.serviceLevel).toBeUndefined();
  expect(await requestServiceLevels(legacy.id)).toMatchObject({ coverage: "LEGACY_UNMEASURED", clocks: [] });
});
it("counts requester confirmation as support completion, with no false human response", async () => {
  const row = await create(); vi.setSystemTime("2026-10-17T02:00:00.000Z");
  await feedbackSupport(row.id, { version: row.version, choice: "RESOLVED" });
  const view = await requestServiceLevels(row.id);
  expect(view.clocks).toHaveLength(1);
  expect(view.clocks[0]).toMatchObject({ metric: "support_completion", state: "COMPLETED", elapsedMs: 3_600_000 });
});
it("uses exactly-once group-delivery evidence without changing request version or resetting incident clocks", async () => {
  const first = await handoff(), second = await handoff();
  const queue = await groupedSupportPage(parseSupportQuery("http://localhost?origin=support&limit=100"));
  const id = queue.items.find(item => item.group)?.group?.id;
  expect(id).toBeTruthy();
  const group = await getRequestGroup(id!);
  vi.setSystemTime("2026-10-17T02:00:00.000Z");
  const input = { sendId: crypto.randomUUID(), membership: group.membership, text: "Kiểm tra nguồn điện và kết nối máy in" };
  await sendGroupReply(group.id, input, "public-demo-reviewer"); await sendGroupReply(group.id, input, "public-demo-reviewer");
  for (const original of [first, second]) {
    expect((await getSupportRequest(original.id))?.version).toBe(original.version);
    const view = await requestServiceLevels(original.id);
    expect(view.clocks.find(clock => clock.metric === "human_response")).toMatchObject({ state: "COMPLETED", elapsedMs: 3_600_000 });
    expect(view.clocks.find(clock => clock.metric === "support_completion")?.state).toBe("RUNNING");
    expect(view.events.filter(event => event.reason === "GROUP_REPLY_DELIVERED")).toHaveLength(1);
  }
  const late = await handoff();
  expect((await requestServiceLevels(late.id)).clocks.find(clock => clock.metric === "human_response")?.state).toBe("RUNNING");
  const measured = await serviceLevelReport(window);
  expect(measured.metrics.find(metric => metric.metric === "human_response")).toMatchObject({ samples: 3, completed: 2, open: 1, eligible: 0, complianceRate: null });
});
it("does not include message text, requester department or credential values in service measurements", async () => {
  const row = await handoff();
  await reviewSupport(row.id, { version: row.version, action: "SEND_MESSAGE", reason: "Nội dung riêng tư synthetic; token: test-secret-do-not-store" }, "public-demo-reviewer");
  const json = JSON.stringify(await requestServiceLevels(row.id));
  for (const value of ["Nội dung riêng tư", "test-secret-do-not-store", "rawText", "senderMessage", "requesterDepartment"])
    expect(json).not.toContain(value);
});
it("applies reviewer guards and input validation to both measurement endpoints", async () => {
  const row = await create();
  const response = await detail(new Request("http://localhost"), { params: Promise.resolve({ id: row.id }) });
  expect(response.status).toBe(200);
  expect((await report(new Request("http://localhost?from=invalid&to=invalid"))).status).toBe(422);
  expect((await report(new Request("http://localhost?from=2026-10-17T00:00:00Z&to=2026-10-16T00:00:00Z"))).status).toBe(422);
  expect((await detail(new Request("http://localhost"), { params: Promise.resolve({ id: crypto.randomUUID() }) })).status).toBe(404);
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SUPPORT_ACCESS_MODE", "");
  expect((await detail(new Request("http://localhost"), { params: Promise.resolve({ id: row.id }) })).status).toBe(403);
  expect((await report(new Request("http://localhost"))).status).toBe(403);
});
