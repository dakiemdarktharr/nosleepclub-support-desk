import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { submitSupport } from "@/services/support";
import { resetSupportTestStore, listSupportSummaries } from "@/lib/support-repository";
import { verifyPersistence } from "@/lib/support-verify";
import { GET as list } from "@/app/api/support/requests/route";
import { GET as detail } from "@/app/api/support/requests/[id]/route";
import { GET as events } from "@/app/api/support/events/route";
import { GET as metrics } from "@/app/api/support/metrics/route";
import { parseSupportQuery, supportPage } from "@/lib/support-query";
import { supportDatabase } from "@/lib/support-repository";
import * as repository from "@/lib/support-repository";

beforeEach(() => { vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("AI_PROVIDER", "mock"); resetSupportTestStore(); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const api: typeof fetch = async (url) => {
  const request = new Request(`http://localhost${url}`);
  if (String(url).startsWith("/api/support/events?")) return events(request);
  if (String(url) === "/api/support/metrics") return metrics();
  if (String(url).startsWith("/api/support/requests?")) return list(request);
  return detail(request, { params: Promise.resolve({ id: String(url).split("/").at(-1)! }) });
};
it("does not report lost persistence when an older request leaves the newest-200 list", async () => {
  const old = await submitSupport({ rawText: "Restart my laptop", fields: { department: "engineering", employeeId: "EMP-TEST-01" }, confirmed: true, idempotencyKey: crypto.randomUUID() });
  for (let i = 0; i < 201; i++) {
    await submitSupport({ rawText: `Restart my laptop, synthetic reference ${i}`, fields: { department: "engineering", employeeId: "EMP-TEST-01" }, confirmed: true, idempotencyKey: crypto.randomUUID() });
  }
  expect((await listSupportSummaries()).some((row) => row.id === old.id)).toBe(false);
  expect(await verifyPersistence(old, api)).toMatchObject({ pass: true, checks: ["detail:pass", "audit:pass", "queue:pass", "metrics:pass"] });
});
it("exact request filtering validates UUIDs, excludes text mentions, and preserves summary response shape", async () => {
  const target = await submitSupport({ rawText: "Restart my laptop", fields: { department: "engineering", employeeId: "EMP-TEST-01" }, confirmed: true, idempotencyKey: crypto.randomUUID() });
  await submitSupport({ rawText: `Restart my laptop, reference ${target.id}`, fields: { department: "engineering", employeeId: "EMP-TEST-01" }, confirmed: true, idempotencyKey: crypto.randomUUID() });
  const response = await list(new Request(`http://local/api/support/requests?view=page&requestId=${target.id}&limit=1`));
  const body = await response.json();
  expect(body.data.total).toBe(1);
  expect(body.data.items.map((row: { id: string }) => row.id)).toEqual([target.id]);
  expect(body.data.nextCursor).toBeNull();
  expect((await list(new Request("http://local/api/support/requests?view=page&requestId=not-a-uuid"))).status).toBe(422);
  const summary = await (await list(new Request("http://local/api/support/requests?view=summary"))).json();
  expect(Array.isArray(summary.data)).toBe(true);
});
it("a genuinely missing queue record remains a failed persistence assertion", async () => {
  const target = await submitSupport({ rawText: "Restart my laptop", fields: { department: "engineering", employeeId: "EMP-TEST-01" }, confirmed: true, idempotencyKey: crypto.randomUUID() });
  const absent: typeof fetch = (url, init) => String(url).startsWith("/api/support/requests?")
    ? Promise.resolve(Response.json({ success: true, data: { items: [], total: 0, nextCursor: null } }))
    : api(url, init);
  expect(await verifyPersistence(target, absent)).toMatchObject({ pass: false, checks: expect.arrayContaining(["queue:fail"]) });
});
it("the Mongo page query uses exact indexed identity rather than the bounded summary list", async () => {
  const id = crypto.randomUUID();
  const cursor = { sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), toArray: vi.fn(async () => []) };
  cursor.sort.mockReturnValue(cursor); cursor.skip.mockReturnValue(cursor); cursor.limit.mockReturnValue(cursor);
  const collection = { createIndex: vi.fn(async () => "synthetic-index"), find: vi.fn(() => cursor), countDocuments: vi.fn(async () => 0) };
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: () => collection } as unknown as ReturnType<typeof supportDatabase>);
  await supportPage(parseSupportQuery(`http://local?requestId=${id}&limit=1`));
  expect(collection.find).toHaveBeenCalledWith({ _id: id }, expect.any(Object));
  expect(collection.countDocuments).toHaveBeenCalledWith({ _id: id });
  expect(cursor.limit).toHaveBeenCalledWith(1);
});
