import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { supportDatabase } from "@/lib/support-repository";
import { withAnswerCache, resetAnswerCacheForTest } from "@/lib/answer-cache";
vi.mock("@/lib/support-repository", () => ({ supportDatabase: vi.fn() }));
const documents = new Map<string, Record<string, unknown>>();
const findOne = vi.fn(
  async ({ _id }: { _id: string }) => documents.get(_id) ?? null,
);
const updateOne = vi.fn(
  async (
    { _id }: { _id: string },
    update: { $set: Record<string, unknown> },
  ) => {
    documents.set(_id, structuredClone(update.$set));
    return {};
  },
);
const createIndex = vi.fn(async () => "ttl");
const validator = (value: unknown) => {
  if (typeof value !== "string") throw Error("invalid");
  return value;
};
beforeEach(() => {
  documents.clear();
  vi.clearAllMocks();
  resetAnswerCacheForTest();
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-cache-signing-key");
  // Minimal Mongo boundary fake; no real URI or network access.
  vi.mocked(supportDatabase).mockReturnValue({
    collection: () => ({ findOne, updateOne, createIndex }),
  } as unknown as ReturnType<typeof supportDatabase>);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it("persists a signed Mongo entry, uses Date TTL, and rejects modified cached content", async () => {
  const generate = vi.fn(async () => "Verified public response");
  await withAnswerCache("hashed-question", generate, validator);
  expect(documents.get("hashed-question")?.deleteAt).toBeInstanceOf(Date);
  expect(
    (await withAnswerCache("hashed-question", generate, validator)).cacheHit,
  ).toBe(true);
  documents.get("hashed-question")!.value = "Injected unreviewed response";
  const recovered = await withAnswerCache(
    "hashed-question",
    generate,
    validator,
  );
  expect(recovered.cacheHit).toBe(false);
  expect(recovered.value).toBe("Verified public response");
  expect(generate).toHaveBeenCalledTimes(2);
  expect(JSON.stringify([...documents])).not.toContain(
    "synthetic-cache-signing-key",
  );
});
it("cache read/write outages do not discard an otherwise valid generated answer", async () => {
  findOne.mockRejectedValueOnce(Error("unavailable"));
  updateOne.mockRejectedValueOnce(Error("unavailable"));
  const result = await withAnswerCache(
    "key",
    async () => "safe answer",
    validator,
  );
  expect(result.value).toBe("safe answer");
  expect(result.cacheHit).toBe(false);
});
it("validates before persisting and never caches a rejected generation", async () => {
  const generate = vi.fn().mockResolvedValueOnce({ unsafe: true }).mockResolvedValue("safe answer");
  await expect(withAnswerCache("invalid", generate, validator)).rejects.toThrow("invalid");
  expect(documents.size).toBe(0);
  expect((await withAnswerCache("invalid", generate, validator)).value).toBe("safe answer");
  expect(generate).toHaveBeenCalledTimes(2);
});
it("expires at the exact TTL boundary and retains the original generation timestamp on hits", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const generate = vi.fn(async () => "safe answer");
  const first = await withAnswerCache("ttl", generate, validator);
  vi.setSystemTime(Date.now() + 3_599_999);
  const hit = await withAnswerCache("ttl", generate, validator);
  expect(hit).toMatchObject({ cacheHit: true, generatedAt: first.generatedAt });
  vi.setSystemTime(Date.now() + 1);
  expect((await withAnswerCache("ttl", generate, validator)).cacheHit).toBe(false);
  expect(generate).toHaveBeenCalledTimes(2);
});
it("coalesces concurrent misses and retries after a failed shared generation", async () => {
  let release!: (value: string) => void;
  const generate = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
  const first = withAnswerCache("same", generate, validator);
  const second = withAnswerCache("same", generate, validator);
  await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  release("safe answer");
  const results = await Promise.all([first, second]);
  expect(results.map(result => result.cacheHit).sort()).toEqual([false, true]);
  const failed = vi.fn(async () => { throw Error("provider down"); });
  await expect(withAnswerCache("retry", failed, validator)).rejects.toThrow("provider down");
  expect((await withAnswerCache("retry", async () => "recovered", validator)).value).toBe("recovered");
});
it("revalidates cached values against a changed validator", async () => {
  await withAnswerCache("schema", async () => "old answer", validator);
  const newer = (value: unknown) => { if (value !== "new answer") throw Error("old schema"); return value; };
  const generate = vi.fn(async () => "new answer");
  expect(await withAnswerCache("schema", generate, newer)).toMatchObject({ value: "new answer", cacheHit: false });
});
it("rejects signatures from another key or signing secret", async () => {
  const generate = vi.fn(async () => "safe answer");
  await withAnswerCache("a", generate, validator);
  documents.set("b", documents.get("a")!);
  expect((await withAnswerCache("b", generate, validator)).cacheHit).toBe(false);
  vi.stubEnv("OPENAI_API_KEY", "rotated-synthetic-signing-key");
  expect((await withAnswerCache("a", generate, validator)).cacheHit).toBe(false);
});
it.each(["bad-signature", "future-created", "malformed"])("treats %s as a miss", async kind => {
  const generate = vi.fn(async () => "safe answer");
  await withAnswerCache(kind, generate, validator);
  const row = documents.get(kind)!;
  if (kind === "bad-signature") row.signature = "0".repeat(64);
  if (kind === "future-created") row.createdAt = new Date(Date.now() + 60000).toISOString();
  if (kind === "malformed") row.expiresAt = "not a date";
  expect((await withAnswerCache(kind, generate, validator)).cacheHit).toBe(false);
});
it.each(["no-key", "mock", "no-secret"])("bypasses storage but still validates output for %s", async mode => {
  if (mode === "mock") vi.stubEnv("AI_PROVIDER", "mock");
  if (mode === "no-secret") vi.stubEnv("OPENAI_API_KEY", "");
  await expect(withAnswerCache<unknown>(mode === "no-key" ? null : "bypass", async () => 42, validator)).rejects.toThrow("invalid");
  expect(findOne).not.toHaveBeenCalled(); expect(updateOne).not.toHaveBeenCalled();
});
