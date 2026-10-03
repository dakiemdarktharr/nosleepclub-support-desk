import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportRequest } from "@/domain/contracts";
import { MongoClient, MongoServerError } from "mongodb";
import { getSupportRequest, insertSupportRequest, listSupportRequests, resetSupportTestStore, updateSupportRequest } from "@/lib/support-repository";
import { submitSupport } from "@/services/support";
import { supportApi } from "@/lib/support-http";
import { GET as health } from "@/app/api/support/health/route";

type Row = { _id: string; data: SupportRequest };
const mongo = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  findOne: vi.fn(), insertOne: vi.fn(), replaceOne: vi.fn(),
}));
vi.mock("mongodb", async (original) => {
  const actual = await original<typeof import("mongodb")>();
  return {
    ...actual,
    MongoClient: class {
      db() { return { collection: () => mongo, command: async () => ({ ok: 1 }) }; }
    },
  };
});
const runtime = globalThis as typeof globalThis & { supportV3Mongo?: MongoClient };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("NODE_ENV", "test");
  delete runtime.supportV3Mongo;
  resetSupportTestStore();
  mongo.rows.clear();
  mongo.findOne.mockImplementation(async ({ _id }: { _id: string }) => structuredClone(mongo.rows.get(_id) ?? null));
  mongo.insertOne.mockImplementation(async (row: Row) => {
    if (mongo.rows.has(row._id)) throw new MongoServerError({ code: 11000, message: "Synthetic duplicate" });
    mongo.rows.set(row._id, structuredClone(row));
  });
  // Simulates Mongo's atomic filter+replace, not evidence of a live database.
  mongo.replaceOne.mockImplementation(async (filter: { _id: string; "data.version": number }, replacement: { data: SupportRequest }) => {
    if (mongo.rows.get(filter._id)?.data.version !== filter["data.version"]) return { matchedCount: 0 };
    mongo.rows.set(filter._id, structuredClone({ _id: filter._id, ...replacement }));
    return { matchedCount: 1 };
  });
});
afterEach(() => { delete runtime.supportV3Mongo; vi.unstubAllEnvs(); });
const create = () => submitSupport({ rawText: "Restart laptop", fields: { department: "engineering", employeeId: "EMP-TEST-01" }, confirmed: true, idempotencyKey: crypto.randomUUID() });

describe.each(["memory", "mongo-mock"])("repository contract: %s", (mode) => {
  beforeEach(() => vi.stubEnv("MONGODB_URI", mode === "mongo-mock" ? "mongodb://synthetic.invalid" : ""));
  it("creates, reads, rejects duplicates, and does not expose mutable references", async () => {
    expect(await getSupportRequest("absent")).toBeNull();
    const row = await create();
    expect(await insertSupportRequest(row)).toBe(false);
    const read = (await getSupportRequest(row.id))!;
    expect(read).toEqual(row);
    read.events.length = 0;
    expect((await getSupportRequest(row.id))?.events).toEqual(row.events);
  });
  it("does not report a ping or memory adapter as verified persistence", async () => {
    const response = await health();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ durable: mode === "mongo-mock", persistenceVerification: "NOT_PERFORMED" });
  });
  it("commits exactly one concurrent status+audit change with the same version", async () => {
    const row = await create();
    const update = (request: SupportRequest) => {
      request.status = "STOPPED";
      request.events.push({ ...request.events[0], id: crypto.randomUUID(), action: "STOP", afterStatus: "STOPPED" });
    };
    const results = await Promise.allSettled([
      updateSupportRequest(row.id, row.version, update), updateSupportRequest(row.id, row.version, update),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT", status: 409 } });
    const stored = (await getSupportRequest(row.id))!;
    expect(stored.version).toBe(row.version + 1);
    expect(stored.status).toBe("STOPPED");
    expect(stored.events.filter((event) => event.action === "STOP")).toHaveLength(1);
    if (mode === "mongo-mock") expect(mongo.replaceOne).toHaveBeenLastCalledWith(
      { _id: row.id, "data.version": row.version }, { data: expect.objectContaining({ version: row.version + 1 }) },
    );
  });
  it("rejects stale/missing updates before invoking the mutation", async () => {
    const row = await create();
    const mutate = vi.fn();
    await expect(updateSupportRequest(row.id, row.version - 1, mutate)).rejects.toMatchObject({ status: 409 });
    await expect(updateSupportRequest("absent", 0, mutate)).rejects.toMatchObject({ status: 404 });
    expect(mutate).not.toHaveBeenCalled();
  });
  it("does not commit partial edits when a mutation fails", async () => {
    const row = await create();
    await expect(updateSupportRequest(row.id, row.version, (draft) => {
      draft.status = "STOPPED";
      throw new Error("Synthetic failure");
    })).rejects.toThrow("Synthetic failure");
    expect(await getSupportRequest(row.id)).toEqual(row);
  });
});
it("fails closed on unavailable Mongo without exposing its error or falling back to memory", async () => {
  vi.stubEnv("MONGODB_URI", "mongodb://synthetic.invalid");
  mongo.findOne.mockRejectedValueOnce(new Error("SYNTHETIC_PRIVATE_CONNECTION_DETAILS"));
  const response = await supportApi(create);
  expect(response.status).toBe(503);
  expect(mongo.findOne).toHaveBeenCalledTimes(1);
  expect(await response.text()).not.toContain("SYNTHETIC_PRIVATE_CONNECTION_DETAILS");
  expect(mongo.insertOne).not.toHaveBeenCalled();
  vi.stubEnv("MONGODB_URI", "");
  expect(await listSupportRequests()).toEqual([]);
});
it("propagates non-duplicate insert and failed replacement instead of claiming success", async () => {
  vi.stubEnv("MONGODB_URI", "mongodb://synthetic.invalid");
  const row = await create();
  mongo.insertOne.mockRejectedValueOnce(new Error("Synthetic write failure"));
  await expect(insertSupportRequest({ ...row, id: crypto.randomUUID() })).rejects.toThrow("Synthetic write failure");
  mongo.replaceOne.mockRejectedValueOnce(new Error("Synthetic write failure"));
  await expect(updateSupportRequest(row.id, row.version, (draft) => { draft.status = "STOPPED"; })).rejects.toThrow("Synthetic write failure");
  expect(await getSupportRequest(row.id)).toEqual(row);
});
it("requires explicit memory-demo opt-in without a production Mongo URI", async () => {
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SUPPORT_STORAGE", "");
  await expect(getSupportRequest("absent")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", status: 503 });
  vi.stubEnv("SUPPORT_STORAGE", "memory-demo");
  expect(await getSupportRequest("absent")).toBeNull();
  vi.stubEnv("VERCEL", "1");
  await expect(getSupportRequest("absent")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", status: 503 });
});
it.each(["insert", "replace"])("returns sanitized 503 on Mongo %s failure and never writes a memory fallback", async (operation) => {
  vi.stubEnv("MONGODB_URI", "mongodb://synthetic.invalid");
  const row = await create();
  const error = new Error("SYNTHETIC_PRIVATE_WRITE_DETAILS");
  if (operation === "insert") mongo.insertOne.mockRejectedValueOnce(error);
  else mongo.replaceOne.mockRejectedValueOnce(error);
  const response = await supportApi(() => operation === "insert"
    ? insertSupportRequest({ ...row, id: crypto.randomUUID() })
    : updateSupportRequest(row.id, row.version, (draft) => { draft.status = "STOPPED"; }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain(error.message);
  expect(await getSupportRequest(row.id)).toEqual(row);
  vi.stubEnv("MONGODB_URI", "");
  expect(await listSupportRequests()).toEqual([]);
});
