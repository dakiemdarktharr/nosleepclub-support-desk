import { afterEach, beforeEach, expect, it, vi } from "vitest";
import dataset from "../data/cache-system.json";
import { GET as requestGET } from "@/app/api/support/requests/[id]/route";
import { GET, POST } from "@/app/api/review/groups/[id]/route";
import { requestGroup } from "@/domain/request-groups";
import { reviewerMessages } from "@/domain/reviewer-messages";
import { mergeTrackedRequest } from "@/domain/tracking-state";
import { getRequestGroup, groupedSupportPage, resetGroupRepliesForTest, sendGroupReply, sharedRepliesForRequest } from "@/lib/support-groups";
import { parseSupportQuery } from "@/lib/support-query";
import { getSupportRequest, insertSupportRequest, resetSupportTestStore, updateSupportRequest } from "@/lib/support-repository";
import { submitSupport } from "@/services/support";
import { continueConversation } from "@/services/conversation";
import { feedbackSupport, reviewSupport } from "@/services/review";
import type { SupportRequest } from "@/domain/contracts";
import * as repository from "@/lib/support-repository";
import type { Db } from "mongodb";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore(); resetGroupRepliesForTest();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function create(text = "VPN không kết nối") {
  const row = await submitSupport({ requesterMode: "guest", rawText: text, confirmed: true, idempotencyKey: crypto.randomUUID() });
  return feedbackSupport(row.id, { version: row.version, choice: "ADMIN" });
}
const query = (extra = "") => parseSupportQuery(`http://local?status=pending&origin=support${extra}`);
async function onlyGroup() {
  const page = await groupedSupportPage(query());
  expect(page.items).toHaveLength(1);
  return getRequestGroup(page.items[0].group!.id);
}
function payload(group: Awaited<ReturnType<typeof onlyGroup>>, text = "Bạn kiểm tra kết nối mạng rồi mở lại VPN nhé.") {
  return { sendId: crypto.randomUUID(), membership: group.membership, text };
}

it("shows seven paraphrases as one request and delivers one reply to all seven original trackers", async () => {
  const rows = [];
  for (const text of dataset.groups[0].requests) rows.push(await create(text));
  const group = await onlyGroup();
  expect(group.title).toBe("7 yêu cầu về lỗi kết nối VPN");
  expect(group.members.map(row => row.id).sort()).toEqual(rows.map(row => row.id).sort());
  const body = payload(group);
  expect(await sendGroupReply(group.id, body, "reviewer")).toEqual({ id: body.sendId, recipientCount: 7 });
  for (const row of rows) {
    expect(await getSupportRequest(row.id)).toEqual(row);
    const response = await requestGET(new Request("http://local"), { params: Promise.resolve({ id: row.id }) });
    const received: SupportRequest = (await response.json()).data;
    expect(reviewerMessages(received.events, received.sharedReplies)).toEqual([
      expect.objectContaining({ id: body.sendId, text: body.text }),
    ]);
    for (const other of rows.filter(other => other.id !== row.id)) expect(JSON.stringify(received)).not.toContain(other.id);
  }
  expect((await getRequestGroup(group.id)).replies[0].recipientCount).toBe(7);
});

it("groups before pagination and searching a member still opens the complete group", async () => {
  const base = await create();
  for (let index = 0; index < 35; index++) await insertSupportRequest({ ...base, id: crypto.randomUUID() });
  const unrelated = await create("Need database access");
  const page = await groupedSupportPage(query("&limit=1"));
  expect(page.total).toBe(2);
  const next = await groupedSupportPage(query(`&limit=1&cursor=${page.nextCursor}`));
  const groupRow = [...page.items, ...next.items].find(row => row.group)!;
  expect(groupRow.group?.count).toBe(36);
  expect((await getRequestGroup(groupRow.group!.id)).members).toHaveLength(36);
  const searched = await groupedSupportPage(query(`&q=HT-${base.id.slice(0, 8).toUpperCase()}`));
  expect(searched.items[0].group?.count).toBe(36);
  expect(searched.items.some(row => row.id === unrelated.id)).toBe(false);
});

it("keeps each symptom, risky/private requests, closed requests and Verify runs separate", async () => {
  for (const group of dataset.groups) for (const text of group.requests.slice(0, 2)) await create(text);
  for (const control of dataset.controls) {
    const row = await create(control.text);
    expect(requestGroup(row)).toBeNull();
  }
  const closed = await create();
  await reviewSupport(closed.id, { version: closed.version, action: "STOP", reason: "Đã đóng yêu cầu này." }, "reviewer");
  const page = await groupedSupportPage(query());
  expect(page.items.filter(row => row.group).map(row => row.group?.count)).toEqual([2, 2, 2, 2]);
  const sample = await create();
  const verify = structuredClone(sample);
  verify.input.verifyRunId = crypto.randomUUID();
  expect(requestGroup(verify)?.key).not.toBe(requestGroup(sample)?.key);
});

it("rejects stale membership after an arrival, close or edit without delivering anything", async () => {
  const a = await create(); const b = await create();
  let group = await onlyGroup();
  const c = await create();
  await expect(sendGroupReply(group.id, payload(group), "reviewer")).rejects.toMatchObject({ code: "GROUP_CHANGED" });
  group = await onlyGroup();
  await reviewSupport(c.id, { version: c.version, action: "STOP", reason: "Dừng hồ sơ này." }, "reviewer");
  await expect(sendGroupReply(group.id, payload(group), "reviewer")).rejects.toMatchObject({ code: "GROUP_CHANGED" });
  group = await onlyGroup();
  await reviewSupport(a.id, { version: a.version, action: "SEND_MESSAGE", reason: "Đang kiểm tra." }, "reviewer");
  await expect(sendGroupReply(group.id, payload(group), "reviewer")).rejects.toMatchObject({ code: "GROUP_CHANGED" });
  expect(await sharedRepliesForRequest(b.id)).toEqual([]);
});

it("a follow-up with a new risky topic leaves its original group before another reply", async () => {
  const rows = [];
  for (let index = 0; index < 2; index++) rows.push(await submitSupport({ requesterMode: "guest", rawText: "VPN không kết nối", confirmed: true, idempotencyKey: crypto.randomUUID() }));
  const page = await groupedSupportPage(parseSupportQuery("http://local?status=all"));
  const group = await getRequestGroup(page.items[0].group!.id);
  await continueConversation(rows[0].id, { version: rows[0].version, question: "Mở port 3389 ra Internet" });
  await expect(sendGroupReply(group.id, payload(group), "reviewer")).rejects.toMatchObject({ code: "GROUP_CHANGED" });
  const changed = (await getSupportRequest(rows[0].id))!;
  expect(requestGroup(changed)).toBeNull();
  expect(await sharedRepliesForRequest(rows[1].id)).toEqual([]);
});

it("a retry is idempotent even after membership changes and late arrivals cannot read old replies", async () => {
  const a = await create(); await create();
  const group = await onlyGroup(); const body = payload(group);
  const responses = await Promise.all([sendGroupReply(group.id, body, "reviewer"), sendGroupReply(group.id, body, "reviewer")]);
  expect(responses[0]).toEqual(responses[1]);
  const late = await create();
  expect(await sendGroupReply(group.id, body, "reviewer")).toEqual(responses[0]);
  expect(await sharedRepliesForRequest(a.id)).toHaveLength(1);
  expect(await sharedRepliesForRequest(late.id)).toEqual([]);
  await expect(sendGroupReply(group.id, { ...body, text: "Nội dung khác" }, "reviewer")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  const next = await onlyGroup();
  await sendGroupReply(next.id, payload(next, "Cập nhật mới cho cả nhóm."), "reviewer");
  expect(await sharedRepliesForRequest(a.id)).toHaveLength(2);
  expect(await sharedRepliesForRequest(late.id)).toHaveLength(1);
});

it("validates reply content, redacts credentials and preserves reply history after a request closes", async () => {
  const a = await create(); await create();
  const group = await onlyGroup();
  for (const text of ["", "   ", "x".repeat(2001)]) await expect(sendGroupReply(group.id, payload(group, text), "reviewer")).rejects.toThrow();
  await sendGroupReply(group.id, payload(group, "Kiểm tra token=SYNTHETIC_GROUP_SECRET"), "reviewer");
  await reviewSupport(a.id, { version: a.version, action: "STOP", reason: "Dừng yêu cầu này." }, "reviewer");
  const messages = await sharedRepliesForRequest(a.id);
  expect(messages).toHaveLength(1);
  expect(JSON.stringify(messages)).not.toContain("SYNTHETIC_GROUP_SECRET");
});

it("polling adds a common reply without a request version bump and never loses it to a delayed poll", async () => {
  const a = await create(); await create();
  const group = await onlyGroup(); await sendGroupReply(group.id, payload(group), "reviewer");
  const latest = { ...a, sharedReplies: await sharedRepliesForRequest(a.id) };
  expect(mergeTrackedRequest(a, latest)).toBe(latest);
  expect(mergeTrackedRequest(latest, a)).toBe(latest);
  expect(mergeTrackedRequest(latest, { ...a, version: a.version + 1 })?.sharedReplies).toEqual(latest.sharedReplies);
});

it("the group API enforces reviewer access and rejects client-supplied recipient IDs", async () => {
  await create(); await create(); const group = await onlyGroup();
  const context = { params: Promise.resolve({ id: group.id }) };
  const response = await POST(new Request("http://local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload(group), recipients: [crypto.randomUUID()] }) }), context);
  expect(response.status).toBe(422);
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SUPPORT_ACCESS_MODE", "disabled");
  expect((await GET(new Request("http://local"), context)).status).toBe(403);
  expect((await POST(new Request("http://local", { method: "POST" }), context)).status).toBe(403);
});

it("operational fields and policy changes break grouping even when wording matches", async () => {
  const a = await create(); const b = await create();
  await updateSupportRequest(b.id, b.version, draft => { draft.input.fields.resource = "private-db"; });
  expect((await groupedSupportPage(query())).items.every(row => !row.group)).toBe(true);
  const changed = structuredClone(a); changed.decision!.policyVersion += "-different";
  expect(requestGroup(changed)?.key).not.toBe(requestGroup(a)?.key);
});

it("site-scoped incidents group together and another location remains separate", async () => {
  const rows = [];
  for (const site of ["SYNTHETIC-HQ", "SYNTHETIC-HQ", "SYNTHETIC-BRANCH"]) {
    rows.push(await submitSupport({ requesterMode: "guest", rawText: "Cúp điện công ty", fields: { incidentSite: site }, confirmed: true, idempotencyKey: crypto.randomUUID() }));
  }
  const page = await groupedSupportPage(parseSupportQuery("http://local?status=all"));
  expect(page.items).toHaveLength(2);
  const grouped = page.items.find(item => item.group)!;
  expect(grouped.title).toBe("2 yêu cầu về sự cố điện tại SYNTHETIC-HQ");
  const group = await getRequestGroup(grouped.group!.id);
  await sendGroupReply(group.id, payload(group, "Bộ phận vận hành đang kiểm tra nguồn điện."), "reviewer");
  expect(await sharedRepliesForRequest(rows[2].id)).toEqual([]);
  expect(await sharedRepliesForRequest(rows[0].id)).toHaveLength(1);
});

it("Mongo stores all recipients atomically, handles a duplicate insert and never falls back on failure", async () => {
  const rows = [await create(), await create()];
  type StoredReply = {
    _id: string; groupId: string; timestamp: string; actor: string; text: string;
    fingerprint: string; recipients: Array<{ id: string; version: number }>; redactions: string[];
  };
  const documents = new Map<string, StoredReply>();
  const insert = vi.fn(async (document: StoredReply) => {
    if (documents.has(document._id)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    documents.set(document._id, structuredClone(document));
  });
  const findCandidates = vi.fn(() => ({ limit: () => ({ toArray: async () => rows.map(data => ({ _id: data.id, data: structuredClone(data) })) }) }));
  const db = {
    databaseName: "synthetic-group-test",
    collection: (name: string) => name === "v3_support_requests" ? { find: findCandidates } : {
      createIndex: vi.fn(async () => "index"), insertOne: insert,
      findOne: async (filter: { _id: string }) => documents.get(filter._id) ?? null,
      find: (filter: { groupId?: string; "recipients.id"?: string }) => ({
        sort: () => ({ toArray: async () => [...documents.values()].filter(row =>
          (!filter.groupId || row.groupId === filter.groupId) &&
          (!filter["recipients.id"] || row.recipients.some(recipient => recipient.id === filter["recipients.id"]))),
        }),
      }),
    },
  } as unknown as Db;
  vi.spyOn(repository, "supportDatabase").mockReturnValue(db);
  const group = await onlyGroup(); const body = payload(group);
  insert.mockRejectedValueOnce(new Error("storage unavailable"));
  await expect(sendGroupReply(group.id, body, "reviewer")).rejects.toThrow("storage unavailable");
  expect(documents.size).toBe(0);
  expect(await sharedRepliesForRequest(rows[0].id)).toEqual([]);
  const results = await Promise.all([sendGroupReply(group.id, body, "reviewer"), sendGroupReply(group.id, body, "reviewer")]);
  expect(results[0]).toEqual(results[1]);
  expect(documents.size).toBe(1);
  expect([...documents.values()][0]).toMatchObject({ actor: "reviewer", text: body.text });
  expect([...documents.values()][0].recipients.map(row => row.id).sort()).toEqual(rows.map(row => row.id).sort());
  for (const row of rows) expect(await sharedRepliesForRequest(row.id)).toHaveLength(1);
  expect(await sharedRepliesForRequest(crypto.randomUUID())).toEqual([]);
  expect(findCandidates).toHaveBeenCalledWith({}, expect.objectContaining({ projection: expect.any(Object) }));
  vi.mocked(repository.supportDatabase).mockReturnValue(null);
  expect(await sharedRepliesForRequest(rows[0].id)).toEqual([]);
});
