import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupportRequest } from "@/domain/contracts";
import { incidentTopic, incidentMessages, INCIDENT_TTL_MS, type IncidentTopic } from "@/domain/shared-support";
import { POLICY_VERSION } from "@/domain/policy-source";
import { supportDatabase, SupportError, listSupportRequests } from "./support-repository";

export type IncidentUpdate = { id: string; at: string; actor: string; state: keyof typeof incidentMessages; message: string };
type Incident = { _id: string; activeKey?: string; topic: IncidentTopic; site: string; policyVersion: string; createdAt: Date; expiresAt: Date; version: number; closed: boolean; updates: IncidentUpdate[] };
export type IncidentView = { id: string; topic: IncidentTopic; site: string; version: number; expiresAt: string; expired: boolean; closed: boolean; updates: IncidentUpdate[] };
const memory = new Map<string, Incident>();
const siteSchema = z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]+$/).transform(s => s.toUpperCase());
let indexes: { key: string; ready: Promise<unknown> } | undefined;
async function collection() {
  const db = supportDatabase();
  if (!db) return null;
  const c = db.collection<Incident>("v3_support_incidents");
  const key = (process.env.MONGODB_URI || "") + db.databaseName;
  if (!indexes || indexes.key !== key) indexes = { key, ready: Promise.all([
    c.createIndex({ activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $type: "string" } } }),
    db.collection("v3_support_requests").createIndex({ "data.incidentId": 1, "data.createdAt": 1 }),
  ]).catch((error: unknown) => { indexes = undefined; throw error; }) };
  await indexes.ready;
  return c;
}
export function eligibleIncident(request: Pick<SupportRequest, "input" | "canonical" | "decision">) {
  const { input, canonical, decision } = request;
  const site = siteSchema.safeParse(input.fields.incidentSite);
  const topic = incidentTopic(input.rawText);
  if (!site.success || !topic || input.verifyRunId || input.mode !== "freeform" ||
      !decision || decision.bucket === "SECURITY_RISK" || !canonical ||
      canonical.subrequests.length > 1 || canonical.redactions.length ||
      canonical.riskSignals.some(r => r !== "USER_HANDOFF") ||
      Object.keys(input.fields).some(k => !["employeeId", "department", "incidentSite"].includes(k))) return null;
  return { site: site.data, topic };
}
/** Unique active key coalesces concurrent submissions; each request still owns its record. */
export async function joinIncident(request: Pick<SupportRequest, "input" | "canonical" | "decision">): Promise<string | undefined> {
  const eligible = eligibleIncident(request);
  if (!eligible) return;
  const key = createHash("sha256").update(JSON.stringify([POLICY_VERSION, eligible])).digest("hex");
  const c = await collection(), now = new Date();
  if (c) {
    const existing = await c.findOne({ activeKey: key, expiresAt: { $gt: now } });
    if (existing) return existing._id;
    await c.updateOne({ activeKey: key, expiresAt: { $lte: now } }, { $unset: { activeKey: "" } });
  } else {
    for (const r of memory.values()) if (r.activeKey === key) {
      if (r.expiresAt > now) return r._id;
      delete r.activeKey;
    }
  }
  const row: Incident = { _id: randomUUID(), activeKey: key, ...eligible, policyVersion: POLICY_VERSION,
    createdAt: now, expiresAt: new Date(+now + INCIDENT_TTL_MS), version: 0, closed: false, updates: [] };
  if (c) {
    try { await c.insertOne(row); }
    catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const winner = await c.findOne({ activeKey: key, expiresAt: { $gt: new Date() } });
      if (!winner) throw new SupportError("INCIDENT_RETRY", "Nhóm sự cố vừa thay đổi; thử lại cùng mã gửi.", 409);
      return winner._id;
    }
  } else memory.set(row._id, row);
  return row._id;
}
const view = (r: Incident): IncidentView => ({ id: r._id, topic: r.topic, site: r.site, version: r.version,
  expiresAt: r.expiresAt.toISOString(), expired: +r.expiresAt <= Date.now(), closed: r.closed, updates: r.updates });
export async function incidentView(id: string): Promise<IncidentView | undefined> {
  const c = await collection(), row = c ? await c.findOne({ _id: id }) : memory.get(id);
  return row ? view(row) : undefined;
}
export async function incidentQueue() {
  const c = await collection();
  const rows = c ? await c.find({ closed: false, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).limit(50).toArray() :
    [...memory.values()].filter(r => !r.closed && +r.expiresAt > Date.now()).sort((a,b) => +b.createdAt - +a.createdAt).slice(0,50);
  const db = supportDatabase();
  type Count = { _id: string; count: number; representativeId: string };
  const counts = db ? await db.collection("v3_support_requests").aggregate<Count>([
    { $match: { "data.incidentId": { $in: rows.map(r => r._id) } } },
    { $group: { _id: "$data.incidentId", count: { $sum: 1 }, representativeId: { $first: "$_id" } } },
  ]).toArray() : [...(await listSupportRequests(true)).reduce((map, r) => {
    if (r.incidentId) {
      const old = map.get(r.incidentId);
      map.set(r.incidentId, { _id: r.incidentId, count: (old?.count || 0) + 1, representativeId: old?.representativeId || r.id });
    }
    return map;
  }, new Map<string, Count>()).values()];
  const byId = new Map(counts.map(r => [r._id, r]));
  return rows.map(r => ({ ...view(r), count: byId.get(r._id)?.count || 0, representativeId: byId.get(r._id)?.representativeId || null }));
}
const publishSchema = z.object({ version: z.number().int().nonnegative(), state: z.enum(["INVESTIGATING", "MONITORING", "RESOLVED"]), updateId: z.string().uuid() }).strict();
export async function publishIncident(id: string, input: unknown, actor: string): Promise<IncidentView> {
  const body = publishSchema.parse(input), c = await collection();
  const row = c ? await c.findOne({ _id: id }) : memory.get(id);
  if (!row) throw new SupportError("NOT_FOUND", "Không tìm thấy nhóm sự cố.", 404);
  const prior = row.updates.find(u => u.id === body.updateId);
  if (prior) {
    if (prior.state !== body.state) throw new SupportError("IDEMPOTENCY_CONFLICT", "Mã gửi đã dùng cho cập nhật khác.", 409);
    return view(row);
  }
  if (row.closed || +row.expiresAt <= Date.now() || row.version !== body.version)
    throw new SupportError("VERSION_CONFLICT", "Nhóm đã đóng, hết 24 giờ hoặc vừa thay đổi. Tải lại.", 409);
  if (row.updates.length >= 100) throw new SupportError("UPDATE_LIMIT", "Đã đủ 100 cập nhật trong nhóm. Liên hệ người quản lý.", 409);
  const update = { id: body.updateId, at: new Date().toISOString(), actor, state: body.state, message: incidentMessages[body.state] };
  const next = { ...row, version: row.version + 1, closed: body.state === "RESOLVED", updates: [...row.updates, update] };
  if (next.closed) delete next.activeKey;
  if (c) {
    const result = await c.replaceOne({ _id: id, version: body.version }, next);
    if (!result.matchedCount) throw new SupportError("VERSION_CONFLICT", "Cập nhật khác vừa được lưu. Tải lại.", 409);
  } else {
    if (memory.get(id)?.version !== body.version) throw new SupportError("VERSION_CONFLICT", "Nhóm vừa thay đổi.", 409);
    memory.set(id, next);
  }
  // Update+audit are one atomic group record; no partially completed fan-out writes.
  return view(next);
}
export function resetIncidentsForTest() { if (process.env.NODE_ENV !== "test") throw Error("TEST_ONLY"); memory.clear(); }
