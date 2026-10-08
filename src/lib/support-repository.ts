import { MongoClient, MongoServerError, type Db } from "mongodb";
import type {
  SupportRequest,
  SupportPreview,
  SupportSummary,
} from "@/domain/contracts";

export class SupportError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type Document = { _id: string; data: SupportRequest };
type Runtime = {
  supportV3Previews?: Map<string, SupportPreview>;
  supportV3Requests?: Map<string, SupportRequest>;
  supportV3Mongo?: MongoClient;
  supportV3Budgets?: Map<string, number>;
  supportV3IndexReady?: Promise<string>;
};
const runtime = globalThis as typeof globalThis & Runtime;
function memory() {
  return (runtime.supportV3Requests ??= new Map());
}
export function supportDatabase() {
  if (process.env.MONGODB_URI) {
    runtime.supportV3Mongo ??= new MongoClient(process.env.MONGODB_URI, {
      maxPoolSize: 3,
      // Keep optional API fields absent instead of changing them into BSON null.
      ignoreUndefined: true,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    return runtime.supportV3Mongo.db(
      process.env.MONGODB_DB || "mlai26_support_v3_demo",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.VERCEL === "1" ||
      process.env.SUPPORT_STORAGE !== "memory-demo")
  )
    throw new SupportError(
      "STORAGE_UNAVAILABLE",
      "Cần cấu hình MongoDB để lưu workflow.",
      503,
    );
  return null;
}
function supportRequests(db: Db) {
  return db.collection<Document>("v3_support_requests");
}
export async function ensureSupportRequestIndexes(db: Db) {
  if (!runtime.supportV3IndexReady) {
    const collection = supportRequests(db);
    const creating = Promise.all([
      collection.createIndex({ "data.updatedAt": -1 }),
      collection.createIndex(
        { "data.input.fields.employeeId": 1, "data.createdAt": -1 },
        {
          name: "employee_id_created_at",
          partialFilterExpression: {
            "data.input.fields.employeeId": { $type: "string" },
          },
        },
      ),
    ]).then(([index]) => index);
    runtime.supportV3IndexReady = creating.catch((error) => {
      runtime.supportV3IndexReady = undefined;
      throw error;
    });
  }
  await runtime.supportV3IndexReady;
}
export function supportStorageMode() {
  return process.env.MONGODB_URI ? "MONGODB" : "MEMORY_DEMO";
}
export async function getSupportRequest(
  id: string,
): Promise<SupportRequest | null> {
  const db = supportDatabase();
  const row = db
    ? (await supportRequests(db).findOne({ _id: id }))?.data
    : memory().get(id);
  return row ? structuredClone(row) : null;
}
export async function listSupportRequests(
  allForLocal = false,
): Promise<SupportRequest[]> {
  const db = supportDatabase();
  if (db) {
    await ensureSupportRequestIndexes(db);
    return (
      await supportRequests(db)
        .find()
        .sort({ "data.updatedAt": -1 })
        .limit(200)
        .toArray()
    ).map((row) => row.data);
  }
  return structuredClone(
    [...memory().values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, allForLocal ? undefined : 200),
  );
}
export async function insertSupportRequest(
  request: SupportRequest,
): Promise<boolean> {
  const db = supportDatabase();
  if (db) {
    try {
      await supportRequests(db).insertOne({ _id: request.id, data: request });
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        return false;
      throw error;
    }
  }
  if (memory().has(request.id)) return false;
  memory().set(request.id, structuredClone(request));
  return true;
}
// Request, assistance history and audit events are embedded in one atomic Mongo document.
export async function updateSupportRequest(
  id: string,
  version: number,
  update: (request: SupportRequest) => void,
): Promise<SupportRequest> {
  const existing = await getSupportRequest(id);
  if (!existing)
    throw new SupportError("NOT_FOUND", "Không tìm thấy yêu cầu.", 404);
  if (existing.version !== version)
    throw new SupportError(
      "VERSION_CONFLICT",
      "Yêu cầu đã thay đổi. Tải lại trước khi thao tác.",
      409,
    );
  const draft = structuredClone(existing);
  update(draft);
  draft.version = version + 1;
  draft.updatedAt = new Date().toISOString();
  const db = supportDatabase();
  if (db) {
    const result = await db
      .collection<Document>("v3_support_requests")
      .replaceOne({ _id: id, "data.version": version }, { data: draft });
    if (!result.matchedCount)
      throw new SupportError(
        "VERSION_CONFLICT",
        "Yêu cầu đã thay đổi. Tải lại.",
        409,
      );
  } else {
    if (memory().get(id)?.version !== version)
      throw new SupportError(
        "VERSION_CONFLICT",
        "Yêu cầu đã thay đổi. Tải lại.",
        409,
      );
    memory().set(id, structuredClone(draft));
  }
  return structuredClone(draft);
}
export async function reserveModelAttempt(now = new Date()): Promise<boolean> {
  const db = supportDatabase();
  const configured = Number(process.env.AI_MAX_ATTEMPTS ?? 20);
  const limit =
    Number.isInteger(configured) && configured >= 0
      ? Math.min(configured, 50)
      : 0;
  const day = now.toISOString().slice(0, 10);
  const bucket = `utc-day:${day}`;
  if (db) {
    const budgets = db.collection<{ _id: string; attempts: number; day: string }>(
      "v3_model_budgets",
    );
    try {
      await budgets.updateOne(
        { _id: bucket },
        { $setOnInsert: { attempts: 0, day } },
        { upsert: true },
      );
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000)
        throw error;
    }
    return Boolean(
      await budgets.findOneAndUpdate(
        { _id: bucket, attempts: { $lt: limit } },
        { $inc: { attempts: 1 } },
        { returnDocument: "after" },
      ),
    );
  }
  const budgets = runtime.supportV3Budgets ??= new Map();
  for (const oldBucket of budgets.keys())
    if (oldBucket !== bucket) budgets.delete(oldBucket);
  const attempts = budgets.get(bucket) ?? 0;
  if (attempts >= limit) return false;
  budgets.set(bucket, attempts + 1);
  return true;
}
export function resetSupportTestStore() {
  if (process.env.NODE_ENV !== "test") throw new Error("TEST_ONLY");
  runtime.supportV3Requests = new Map();
  runtime.supportV3Budgets = new Map();
  runtime.supportV3Previews = new Map();
  runtime.supportV3IndexReady = undefined;
}

export async function saveSupportPreview(preview: SupportPreview) {
  const db = supportDatabase();
  if (db) {
    const collection = db.collection<SupportPreview>("v3_support_previews");
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await collection.createIndex({ id: 1 }, { unique: true });
    await collection.insertOne(preview);
  } else {
    const rows = (runtime.supportV3Previews ??= new Map());
    for (const [id, item] of rows)
      if (+item.expiresAt <= Date.now()) rows.delete(id);
    rows.set(preview.id, structuredClone(preview));
  }
}
export async function getSupportPreview(
  id: string,
): Promise<SupportPreview | null> {
  const db = supportDatabase();
  return db
    ? db.collection<SupportPreview>("v3_support_previews").findOne({ id })
    : structuredClone(runtime.supportV3Previews?.get(id) ?? null);
}
export async function listSupportSummaries(): Promise<SupportSummary[]> {
  const db = supportDatabase();
  // Summary responses keep the compact list contract used by the reviewer UI.
  const rows = db
    ? (
        await supportRequests(db)
          .find(
            {},
            {
              projection: {
                "data.id": 1,
                "data.version": 1,
                "data.status": 1,
                "data.createdAt": 1,
                "data.updatedAt": 1,
                "data.originalQuestion": 1,
                "data.input.rawText": 1,
                "data.canonical.serviceGroup": 1,
                "data.decision.action": 1,
              },
            },
          )
          .sort({ "data.updatedAt": -1 })
          .limit(200)
          .toArray()
      ).map((row) => row.data)
    : await listSupportRequests();
  return rows.map((row) => ({
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
    serviceGroup: row.canonical?.serviceGroup ?? "OTHER",
    action: row.decision?.action ?? null,
  }));
}
