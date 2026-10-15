import { afterEach, describe, expect, it, vi } from "vitest";
import { browserApi } from "@/lib/browser-api";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("browser request completion", () => {
  it("bounds a stalled connection without claiming the server did not save", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_path, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const result = browserApi("/api/support/requests", { idempotencyKey: "retained-key" });
    const assertion = expect(result).rejects.toThrow("Hết thời gian chờ xác nhận");
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1); // No hidden retry of a write.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also bounds a stalled response body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_path, init: RequestInit) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
    })));
    const assertion = expect(browserApi("/api/support/preview", {})).rejects.toThrow("Hết thời gian chờ xác nhận");
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the deadline after success and preserves explicit server errors", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ success: true, data: { id: "demo" } }))
      .mockResolvedValueOnce(Response.json({ success: false, error: { message: "Version đã thay đổi" } }, { status: 409 })));
    await expect(browserApi("/api/support/requests/demo")).resolves.toEqual({ id: "demo" });
    await expect(browserApi("/api/support/requests/demo", {})).rejects.toThrow("Version đã thay đổi");
    expect(vi.getTimerCount()).toBe(0);
  });
});
