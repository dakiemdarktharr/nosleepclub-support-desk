import { createHash } from "node:crypto";
import { z } from "zod";
import type { ResultPage } from "@/domain/contracts";
import { requestGroup, type GroupCandidate, type RequestGroupDetail, type SharedReply, type SupportQueueItem } from "@/domain/request-groups";
import { redact } from "@/domain/redaction";
import { REVIEW_MESSAGE_MAX_LENGTH } from "@/domain/reviewer-messages";
import { listSupportRequests, supportDatabase, SupportError } from "./support-repository";
import { matchesSupportQuery, summarizeSupport, type SupportQuery } from "./support-query";

type Group = { id: string; topic: string; members: GroupCandidate[] };
type ReplyRecord = {
  _id: string;
  groupId: string;
  fingerprint: string;
  timestamp: string;
  actor: string;
  text: string;
  redactions: string[];
  recipients: Array<{ id: string; version: number }>;
};
const runtime = globalThis as typeof globalThis & { supportGroupReplies?: Map<string, ReplyRecord> };
const memory = (): Map<string, ReplyRecord> => runtime.supportGroupReplies ??= new Map<string, ReplyRecord>();
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const groupIdSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** Read compact candidates, not assistance/audit payloads. Group before paging,
 * including legacy requests without requiring a production data migration. */
async function candidates(): Promise<GroupCandidate[]> {
  const db = supportDatabase();
  if (!db) return listSupportRequests(true);
  const rows = await db.collection<{ _id: string; data: GroupCandidate }>("v3_support_requests")
    .find({}, { projection: {
      "data.id": 1, "data.version": 1, "data.status": 1, "data.input": 1,
      "data.originalQuestion": 1, "data.createdAt": 1, "data.updatedAt": 1,
      "data.incidentId": 1, "data.canonical": 1, "data.decision": 1,
      "data.events.afterStatus": 1, "data.knowledgeCandidate.status": 1,
    } }).toArray();
  return rows.map(row => row.data);
}
function groupsFor(rows: GroupCandidate[]) {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const descriptor = requestGroup(row);
    if (!descriptor) continue;
    const id = digest(descriptor.key);
    const group = groups.get(id) ?? { id, topic: descriptor.topic, members: [] };
    group.members.push(row);
    groups.set(id, group);
  }
  for (const group of groups.values()) group.members.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return groups;
}
function membership(group: Group) {
  return digest(group.members.map(({ id, version }) => ({ id, version })).sort((a, b) => a.id.localeCompare(b.id)));
}
export async function groupedSupportPage(query: SupportQuery): Promise<ResultPage<SupportQueueItem>> {
  const rows = await candidates();
  const groups = groupsFor(rows);
  const groupedIds = new Set<string>();
  const items: SupportQueueItem[] = [];
  for (const group of groups.values()) {
    if (group.members.length < 2) continue;
    for (const member of group.members) groupedIds.add(member.id);
    // A search selects the whole group if any member matches. Count and detail
    // therefore describe the same complete recipient list, across every page.
    if (!group.members.some(member => matchesSupportQuery(member, query))) continue;
    const representative = summarizeSupport(group.members[0]);
    items.push({ ...representative, employeeId: undefined,
      title: `${group.members.length} yêu cầu về ${group.topic}`,
      group: { id: group.id, count: group.members.length } });
  }
  for (const row of rows) {
    if (!groupedIds.has(row.id) && matchesSupportQuery(row, query)) items.push(summarizeSupport(row));
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return { items: items.slice(query.cursor, query.cursor + query.limit), total: items.length,
    nextCursor: query.cursor + query.limit < items.length ? String(query.cursor + query.limit) : null };
}
let indexes: { key: string; ready: Promise<unknown> } | undefined;
async function replyCollection() {
  const db = supportDatabase();
  if (!db) return null;
  const collection = db.collection<ReplyRecord>("v3_support_group_replies");
  const key = (process.env.MONGODB_URI ?? "") + db.databaseName;
  if (!indexes || indexes.key !== key) indexes = { key, ready: Promise.all([
    collection.createIndex({ groupId: 1, timestamp: 1 }),
    collection.createIndex({ "recipients.id": 1, timestamp: 1 }),
  ]).catch((error: unknown) => { indexes = undefined; throw error; }) };
  await indexes.ready;
  return collection;
}
async function groupReplies(groupId: string) {
  const collection = await replyCollection();
  const rows = collection ? await collection.find({ groupId }).sort({ timestamp: 1, _id: 1 }).toArray()
    : [...memory().values()].filter(row => row.groupId === groupId).sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a._id.localeCompare(b._id));
  return rows.map(row => ({ id: row._id, timestamp: row.timestamp, text: row.text, recipientCount: row.recipients.length }));
}
export async function sharedRepliesForRequest(id: string): Promise<SharedReply[]> {
  const collection = await replyCollection();
  const rows = collection ? await collection.find({ "recipients.id": id }).sort({ timestamp: 1, _id: 1 }).toArray()
    : [...memory().values()].filter(row => row.recipients.some(recipient => recipient.id === id));
  // Never expose another sender's ID, membership or request content here.
  return rows.map(row => ({ id: row._id, timestamp: row.timestamp, text: row.text }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}
export async function getRequestGroup(id: string): Promise<RequestGroupDetail> {
  groupIdSchema.parse(id);
  const group = groupsFor(await candidates()).get(id);
  if (!group) throw new SupportError("GROUP_NOT_FOUND", "Nhóm không còn yêu cầu đang mở.", 404);
  return {
    id, title: `${group.members.length} yêu cầu về ${group.topic}`, membership: membership(group),
    members: group.members.map(row => ({ ...summarizeSupport(row), text: row.input.rawText })),
    replies: await groupReplies(id),
  };
}
const sendSchema = z.object({
  sendId: z.string().uuid(), membership: z.string().regex(/^[a-f0-9]{64}$/),
  text: z.string().trim().min(1).max(REVIEW_MESSAGE_MAX_LENGTH),
}).strict();
export async function sendGroupReply(id: string, value: unknown, actor: string) {
  groupIdSchema.parse(id);
  const input = sendSchema.parse(value);
  const safe = redact(input.text);
  if (!safe.text.trim()) throw new SupportError("EMPTY_MESSAGE", "Nhập nội dung trả lời.", 422);
  const fingerprint = digest([id, actor, input.membership, safe.text]);
  const collection = await replyCollection();
  const receipt = (row: ReplyRecord) => {
    if (row.fingerprint !== fingerprint) throw new SupportError("IDEMPOTENCY_CONFLICT", "Mã gửi đã được dùng cho nội dung khác.", 409);
    return { id: row._id, recipientCount: row.recipients.length };
  };
  const prior = collection ? await collection.findOne({ _id: input.sendId }) : memory().get(input.sendId);
  if (prior) return receipt(prior);
  const group = groupsFor(await candidates()).get(id);
  if (!group || membership(group) !== input.membership)
    throw new SupportError("GROUP_CHANGED", "Nhóm đã thay đổi. Tải lại danh sách trước khi gửi.", 409);
  const row: ReplyRecord = {
    _id: input.sendId, groupId: id, fingerprint, actor, text: safe.text,
    timestamp: new Date().toISOString(), redactions: safe.markers,
    recipients: group.members.map(member => ({ id: member.id, version: member.version })),
  };
  // One atomic record is both delivery and audit. There is no partial fan-out,
  // and late arrivals cannot receive a message addressed to earlier members.
  if (collection) {
    try { await collection.insertOne(row); }
    catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const winner = await collection.findOne({ _id: input.sendId });
      if (!winner) throw error;
      return receipt(winner);
    }
  } else {
    const winner = memory().get(input.sendId);
    if (winner) return receipt(winner);
    memory().set(input.sendId, structuredClone(row));
  }
  return receipt(row);
}
export function resetGroupRepliesForTest() {
  if (process.env.NODE_ENV !== "test") throw new Error("TEST_ONLY");
  memory().clear();
  indexes = undefined;
}
