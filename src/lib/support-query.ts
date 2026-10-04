import { z } from "zod";
import type { Filter } from "mongodb";
import type {
  AuditEvent,
  ResultPage,
  SupportRequest,
  SupportSummary,
} from "@/domain/contracts";
import {
  ensureSupportRequestIndexes,
  supportDatabase,
  listSupportRequests,
} from "./support-repository";
import { employeeIdPattern, normalizeEmployeeId } from "@/domain/employee-identity";

const querySchema = z.object({
  cursor: z.coerce.number().int().min(0).max(1000000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  // The UI displays HT- plus the first eight UUID characters. Search the same
  // identifier in both Mongo and memory instead of treating HT- as raw text.
  q: z.string().trim().max(200).default("").transform((value) =>
    /^HT-[a-f0-9]{8}$/i.test(value) ? value.slice(3) : value,
  ),
  employeeId: z.preprocess(
    (value) =>
      typeof value === "string" && !value.trim() ? undefined : value,
    z
      .string()
      .trim()
      .max(32)
      .transform(normalizeEmployeeId)
      .pipe(z.string().regex(employeeIdPattern))
      .optional(),
  ),
  status: z.enum(["all", "pending", "knowledge"]).default("all"),
  origin: z.enum(["all", "support", "verify"]).default("all"),
  queue: z.enum(["all", "OUT_OF_POLICY", "AUTHORITY_REQUIRED"]).default("all"),
  requestId: z.string().uuid().optional(),
});
export function parseSupportQuery(url: string) {
  const params = new URL(url).searchParams;
  return querySchema.parse(
    Object.fromEntries(
      ["cursor", "limit", "q", "employeeId", "status", "origin", "requestId", "queue"]
        .filter((key) => params.has(key))
        .map((key) => [key, params.get(key)]),
    ),
  );
}
export function parseEmployeeSuggestionPrefix(url: string): string {
  const prefix = normalizeEmployeeId(
    new URL(url).searchParams.get("employeePrefix")?.trim() ?? "",
  );
  return prefix.length >= 2 && prefix.length <= 32 && employeeIdPattern.test(prefix)
    ? prefix
    : "";
}
export type SupportQuery = z.infer<typeof querySchema>;
type Row = { _id: string; data: SupportRequest };
const pending = ["ESCALATED", "APPROVED_BY_HUMAN"];
function filterFor(query: SupportQuery): Filter<Row> {
  const filter: Filter<Row> = {};
  if (query.requestId) filter._id = query.requestId;
  if (query.employeeId)
    filter["data.input.fields.employeeId"] = query.employeeId;
  if (query.queue !== "all") filter["data.decision.uncertaintyClass"] = query.queue;
  if (query.status === "pending") filter["data.status"] = { $in: pending };
  if (query.status === "knowledge")
    filter["data.knowledgeCandidate.status"] = "PENDING_REVIEW";
  if (query.origin !== "all")
    filter["data.input.verifyRunId"] = { $exists: query.origin === "verify" };
  if (query.q) {
    const literal = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fields = [
      "data.id",
      "data.originalQuestion",
      "data.input.rawText",
      "data.input.fields.employeeId",
    ];
    filter.$or = fields.map((field) => ({
      [field]: { $regex: literal, $options: "i" },
    }));
    const employeeId = normalizeEmployeeId(query.q);
    if (employeeIdPattern.test(employeeId))
      filter.$or.push({ "data.input.fields.employeeId": employeeId });
  }
  return filter;
}
async function memoryRows(query: SupportQuery) {
  // Only used for explicitly temporary local tests/development.
  const rows = await listSupportRequests(true);
  return rows.filter(
    (row) =>
      (!query.requestId || row.id === query.requestId) &&
      (!query.employeeId ||
        normalizeEmployeeId(row.input.fields.employeeId ?? "") ===
          query.employeeId) &&
      (query.queue === "all" || row.decision?.uncertaintyClass === query.queue) &&
      (query.status === "all" ||
        (query.status === "pending"
          ? pending.includes(row.status)
          : row.knowledgeCandidate?.status === "PENDING_REVIEW")) &&
      (query.origin === "all" ||
        Boolean(row.input.verifyRunId) === (query.origin === "verify")) &&
      [row.id, row.originalQuestion, row.input.rawText, row.input.fields.employeeId]
        .some((value) =>
          (value ?? "").toLocaleLowerCase().includes(query.q.toLocaleLowerCase()),
        ),
  );
}
export async function supportPage(
  query: SupportQuery,
): Promise<ResultPage<SupportSummary>> {
  const db = supportDatabase();
  if (db) await ensureSupportRequestIndexes(db);
  const collection = db?.collection<Row>("v3_support_requests");
  const filter = filterFor(query);
  const rows = collection
    ? await collection
        .find(filter, {
          projection: {
            "data.id": 1,
            "data.version": 1,
            "data.status": 1,
            "data.createdAt": 1,
            "data.updatedAt": 1,
            "data.originalQuestion": 1,
            "data.input.rawText": 1,
            "data.input.fields.employeeId": 1,
            "data.canonical.serviceGroup": 1,
            "data.decision.action": 1,
            "data.decision.uncertaintyClass": 1,
            "data.decision.assignedTeam": 1,
            "data.knowledgeCandidate.status": 1,
          },
        })
        .sort({ "data.createdAt": -1, _id: -1 })
        .skip(query.cursor)
        .limit(query.limit)
        .toArray()
    : (await memoryRows(query))
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        )
        .slice(query.cursor, query.cursor + query.limit)
        .map((data) => ({ data }));
  const total = collection
    ? await collection.countDocuments(filter)
    : (await memoryRows(query)).length;
  return {
    items: rows.map(({ data: row }) => ({
      id: row.id,
      version: row.version,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      title: (
        row.originalQuestion ||
        row.input.rawText ||
        "Yêu cầu theo danh mục"
      ).slice(0, 140),
      employeeId: row.input.fields.employeeId,
      serviceGroup: row.canonical?.serviceGroup ?? "OTHER",
      action: row.decision?.action ?? null,
      uncertaintyClass: row.decision?.uncertaintyClass,
      assignedTeam: row.decision?.assignedTeam,
      hasKnowledgeCandidate:
        row.knowledgeCandidate?.status === "PENDING_REVIEW",
    })),
    total,
    nextCursor:
      query.cursor + rows.length < total
        ? String(query.cursor + rows.length)
        : null,
  };
}
export async function employeeIdSuggestions(prefix: string): Promise<string[]> {
  const normalized = normalizeEmployeeId(prefix);
  if (
    normalized.length < 2 ||
    normalized.length > 32 ||
    !employeeIdPattern.test(normalized)
  )
    return [];

  const db = supportDatabase();
  if (db) {
    await ensureSupportRequestIndexes(db);
    const literal = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rows = await db
      .collection<Row>("v3_support_requests")
      .aggregate<{ _id: string }>([
        { $match: { "data.input.fields.employeeId": { $regex: literal } } },
        { $group: { _id: "$data.input.fields.employeeId" } },
        { $sort: { _id: 1 } },
        { $limit: 8 },
      ])
      .toArray();
    return rows
      .map((row) => row._id)
      .filter(
        (employeeId) =>
          typeof employeeId === "string" &&
          employeeIdPattern.test(employeeId) &&
          employeeId.includes(normalized),
      )
      .slice(0, 8);
  }

  const employeeIds = (await listSupportRequests(true))
    .map((row) => normalizeEmployeeId(row.input.fields.employeeId ?? ""))
    .filter(
      (employeeId) =>
        employeeIdPattern.test(employeeId) && employeeId.includes(normalized),
    );
  return [...new Set(employeeIds)].sort((a, b) => a.localeCompare(b)).slice(0, 8);
}
export async function auditPage(
  query: SupportQuery,
): Promise<ResultPage<AuditEvent>> {
  const db = supportDatabase();
  if (db) {
    await ensureSupportRequestIndexes(db);
    const rows = await db
      .collection<Row>("v3_support_requests")
      .aggregate<{ items: AuditEvent[]; count: { total: number }[] }>([
        { $match: filterFor(query) },
        { $project: { events: "$data.events" } },
        { $unwind: "$events" },
        { $replaceRoot: { newRoot: "$events" } },
        { $sort: { timestamp: -1, id: -1 } },
        {
          $facet: {
            items: [{ $skip: query.cursor }, { $limit: query.limit }],
            count: [{ $count: "total" }],
          },
        },
      ])
      .toArray();
    const items = rows[0]?.items ?? [],
      total = rows[0]?.count[0]?.total ?? 0;
    return {
      items,
      total,
      nextCursor:
        query.cursor + items.length < total
          ? String(query.cursor + items.length)
          : null,
    };
  }
  const rows = (await memoryRows(query))
    .flatMap((row) => row.events)
    .sort(
      (a, b) =>
        b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id),
    );
  return {
    items: rows.slice(query.cursor, query.cursor + query.limit),
    total: rows.length,
    nextCursor:
      query.cursor + query.limit < rows.length
        ? String(query.cursor + query.limit)
        : null,
  };
}
export async function supportMetrics() {
  const db = supportDatabase();
  if (db) {
    const result = await db
      .collection<Row>("v3_support_requests")
      .aggregate<ReturnType<typeof countMetrics>>([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            resolvedFeedback: {
              $sum: {
                $cond: [{ $in: ["RESOLVED", "$data.feedback.choice"] }, 1, 0],
              },
            },
            handoffs: {
              $sum: {
                $cond: [{ $in: ["HANDOFF", "$data.events.action"] }, 1, 0],
              },
            },
            modelFailures: {
              $sum: {
                $cond: [
                  { $ifNull: ["$data.canonical.model.failure", false] },
                  1,
                  0,
                ],
              },
            },
            pendingReview: {
              $sum: { $cond: [{ $in: ["$data.status", pending] }, 1, 0] },
            },
          },
        },
        { $project: { _id: 0 } },
      ])
      .toArray();
    return result[0] ?? countMetrics([]);
  }
  return countMetrics(await listSupportRequests(true));
}
function countMetrics(rows: SupportRequest[]) {
  return {
    total: rows.length,
    resolvedFeedback: rows.filter((r) =>
      r.feedback.some((f) => f.choice === "RESOLVED"),
    ).length,
    handoffs: rows.filter((r) => r.events.some((e) => e.action === "HANDOFF"))
      .length,
    modelFailures: rows.filter((r) => r.canonical?.model.failure).length,
    pendingReview: rows.filter((r) => pending.includes(r.status)).length,
  };
}
