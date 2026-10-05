import { afterEach, expect, it, vi } from "vitest";
import { identityStore, identityTransaction } from "@/lib/identity-store";
afterEach(() => vi.unstubAllEnvs());
it("refuses identity reads and writes without explicit Mongo configuration even when Support uses memory-demo", async () => {
  vi.stubEnv("IDENTITY_MONGODB_URI", ""); vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("IDENTITY_MONGODB_DB", ""); vi.stubEnv("SUPPORT_STORAGE", "memory-demo");
  await expect(identityStore()).rejects.toMatchObject({ code: "IDENTITY_STORAGE_UNAVAILABLE", status: 503 });
  const work = vi.fn(); await expect(identityTransaction(work)).rejects.toMatchObject({ status: 503 }); expect(work).not.toHaveBeenCalled();
});
it("requires a separately named identity database, never silently inherits Support DB", async () => {
  vi.stubEnv("IDENTITY_MONGODB_URI", "mongodb://127.0.0.1:1"); vi.stubEnv("IDENTITY_MONGODB_DB", ""); vi.stubEnv("MONGODB_DB", "support-demo");
  await expect(identityStore()).rejects.toMatchObject({ status: 503 });
});
