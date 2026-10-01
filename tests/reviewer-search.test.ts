import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseSupportQuery, supportPage, auditPage } from "@/lib/support-query";
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
  const request = await submitSupport({ rawText: "Open port 3389 public", confirmed: true, idempotencyKey: crypto.randomUUID() });
  for (const code of [displayId(request.id), displayId(request.id).toLowerCase()]) {
    const query = parseSupportQuery(`http://local?q=${code}`);
    expect((await supportPage(query)).items.map((row) => row.id)).toEqual([request.id]);
    expect((await auditPage(query)).items.length).toBeGreaterThan(0);
    expect((await auditPage(query)).items.every((event) => event.requestId === request.id)).toBe(true);
  }
});
it("passes the normalized code to Mongo filtering and counts using the same filter", async () => {
  const cursor = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]) };
  const collection = { find: vi.fn().mockReturnValue(cursor), countDocuments: vi.fn().mockResolvedValue(0) };
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: () => collection } as unknown as Db);
  await supportPage(parseSupportQuery("http://local?q=HT-ABCDEF12"));
  const filter = collection.find.mock.calls[0][0];
  expect(filter.$or).toContainEqual({ "data.id": { $regex: "ABCDEF12", $options: "i" } });
  expect(collection.countDocuments).toHaveBeenCalledWith(filter);
});
it("keeps free text and malformed codes literal instead of changing their meaning", () => {
  for (const q of ["HT-help", "VPN HT-ABCDEF12 lỗi", "HT-ABCDEF123"]) {
    expect(parseSupportQuery(`http://local?q=${encodeURIComponent(q)}`).q).toBe(q);
  }
});
