import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  auditPage,
  employeeIdSuggestions,
  parseEmployeeSuggestionPrefix,
  parseSupportQuery,
  supportPage,
} from "@/lib/support-query";
import { submitSupport } from "@/services/support";
import * as repository from "@/lib/support-repository";
import { displayId } from "@/domain/presentation";
import type { Db } from "mongodb";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  repository.resetSupportTestStore();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("finds the displayed HT code in both the request queue and audit", async () => {
  const request = await submitSupport({ rawText: "Open port 3389 public", fields: { department: "engineering", employeeId: "anhtn" }, confirmed: true, idempotencyKey: crypto.randomUUID() });
  for (const code of [displayId(request.id), displayId(request.id).toLowerCase()]) {
    const query = parseSupportQuery(`http://local?q=${code}`);
    expect((await supportPage(query)).items.map((row) => row.id)).toEqual([request.id]);
    expect((await auditPage(query)).items.length).toBeGreaterThan(0);
    expect((await auditPage(query)).items.every((event) => event.requestId === request.id)).toBe(true);
  }
  const employeeCode = parseSupportQuery("http://local?employeeId=ANHTN");
  expect((await supportPage(employeeCode)).items.map((row) => row.id)).toEqual([request.id]);
  expect((await supportPage(employeeCode)).items[0].employeeId).toBe("anhtn");
  expect((await auditPage(employeeCode)).items.every((event) => event.requestId === request.id)).toBe(true);
});
it("passes the normalized code to Mongo filtering and counts using the same filter", async () => {
  const cursor = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]) };
  const collection = { createIndex: vi.fn().mockResolvedValue("synthetic-index"), find: vi.fn().mockReturnValue(cursor), countDocuments: vi.fn().mockResolvedValue(0) };
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: () => collection } as unknown as Db);
  await supportPage(parseSupportQuery("http://local?q=HT-ABCDEF12"));
  const filter = collection.find.mock.calls[0][0];
  expect(filter.$or).toContainEqual({ "data.id": { $regex: "ABCDEF12", $options: "i" } });
  expect(filter.$or).toContainEqual({ "data.input.fields.employeeId": "abcdef12" });
  expect(collection.countDocuments).toHaveBeenCalledWith(filter);
});
it("uses the employee index for exact employee-code lookup in queue and audit", async () => {
  const cursor = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]) };
  const createIndex = vi.fn().mockResolvedValue("synthetic-index");
  const collection = { createIndex, find: vi.fn().mockReturnValue(cursor), countDocuments: vi.fn().mockResolvedValue(0), aggregate: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) };
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: () => collection } as unknown as Db);
  await supportPage(parseSupportQuery("http://local?employeeId=ANHTN"));
  const filter = { "data.input.fields.employeeId": "anhtn" };
  expect(collection.find).toHaveBeenCalledWith(filter, expect.any(Object));
  expect(collection.countDocuments).toHaveBeenCalledWith(filter);
  expect(createIndex).toHaveBeenCalledWith(
    { "data.input.fields.employeeId": 1, "data.createdAt": -1 },
    expect.objectContaining({ name: "employee_id_created_at" }),
  );
  await auditPage(parseSupportQuery("http://local?employeeId=ANHTN"));
  expect(collection.aggregate).toHaveBeenCalledWith(
    expect.arrayContaining([{ $match: filter }]),
  );
});
it("keeps free text and malformed codes literal instead of changing their meaning", () => {
  for (const q of ["HT-help", "VPN HT-ABCDEF12 lỗi", "HT-ABCDEF123"]) {
    expect(parseSupportQuery(`http://local?q=${encodeURIComponent(q)}`).q).toBe(q);
  }
});
it("treats an empty employee filter as no filter", () => {
  expect(parseSupportQuery("http://local?employeeId=%20%20").employeeId).toBeUndefined();
});
it("finds follow-up text as well as the original question in memory queue and audit", async () => {
  const request = await submitSupport({
    rawText: "Open port 3389 public",
    fields: { department: "engineering", employeeId: "synthetic-search-01" },
    confirmed: true,
    idempotencyKey: crypto.randomUUID(),
  });
  await repository.updateSupportRequest(request.id, request.version, (draft) => {
    draft.input.rawText = "Synthetic follow-up search marker";
  });
  for (const q of ["3389", "follow-up search marker"]) {
    const query = parseSupportQuery(`http://local?q=${encodeURIComponent(q)}`);
    expect((await supportPage(query)).items.map((row) => row.id)).toEqual([request.id]);
    const events = (await auditPage(query)).items;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.requestId === request.id)).toBe(true);
  }
});
it("suggests distinct employee codes containing the normalized search text", async () => {
  for (const employeeId of ["anhtn", "anhpt", "anhtn", "khoadt"]) {
    await submitSupport({
      rawText: "Open port 3389 public",
      fields: { department: "engineering", employeeId },
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  expect(parseEmployeeSuggestionPrefix("http://local?employeePrefix=ANH")).toBe("anh");
  expect(parseEmployeeSuggestionPrefix("http://local?employeePrefix=a")).toBe("");
  expect(await employeeIdSuggestions("DT")).toEqual(["khoadt"]);
  expect(await employeeIdSuggestions(".")).toEqual([]);
});
it("uses a bounded substring query for Mongo employee suggestions", async () => {
  const cursor = { toArray: vi.fn().mockResolvedValue([{ _id: "khoadt" }]) };
  const collection = {
    createIndex: vi.fn().mockResolvedValue("synthetic-index"),
    aggregate: vi.fn().mockReturnValue(cursor),
  };
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: () => collection } as unknown as Db);

  expect(await employeeIdSuggestions("DT")).toEqual(["khoadt"]);
  const pipeline = collection.aggregate.mock.calls[0][0];
  expect(pipeline).toEqual([
    { $match: { "data.input.fields.employeeId": { $regex: "dt" } } },
    { $group: { _id: "$data.input.fields.employeeId" } },
    { $sort: { _id: 1 } },
    { $limit: 8 },
  ]);
});
