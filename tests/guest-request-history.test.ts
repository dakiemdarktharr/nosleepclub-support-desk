import { afterEach, beforeEach, expect, it, vi } from "vitest";

const saved = new Map<string, string>();
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.resetModules(); saved.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => saved.get(key), setItem: (key: string, value: string) => saved.set(key, value) } });
});
afterEach(() => vi.unstubAllGlobals());
it("persists only tracking IDs across reload and returns unique newest requests first", async () => {
  const history = await import("@/lib/guest-request-history");
  history.rememberGuestRequest(first); history.rememberGuestRequest(second); history.rememberGuestRequest(first);
  expect(history.guestRequestIds()).toEqual([first, second]);
  vi.resetModules();
  expect((await import("@/lib/guest-request-history")).guestRequestIds()).toEqual([first, second]);
  expect(saved.get("vng-guest-requests-v1")).toBe(JSON.stringify([first, second]));
});
it("preserves history through admin navigation and a new guest department session", async () => {
  const history = await import("@/lib/guest-request-history");
  history.rememberGuestRequest(first);
  const { startGuestSession } = await import("@/lib/guest-demo-session");
  startGuestSession(); startGuestSession();
  expect(history.guestRequestIds()).toEqual([first]);
});
it.each(["{broken", "null", '{}', '["javascript:alert(1)", 7, null]'])("ignores malformed or non-UUID stored values: %s", async value => {
  saved.set("vng-guest-requests-v1", value);
  const history = await import("@/lib/guest-request-history");
  expect(history.guestRequestIds()).toEqual([]);
  history.rememberGuestRequest("https://external.invalid/tracker");
  expect(history.guestRequestIds()).toEqual([]);
});
it("reads updates written by another tab and respects cleared storage", async () => {
  const history = await import("@/lib/guest-request-history");
  history.rememberGuestRequest(first);
  saved.set("vng-guest-requests-v1", JSON.stringify([second, first]));
  expect(history.guestRequestIds()).toEqual([second, first]);
  saved.clear(); expect(history.guestRequestIds()).toEqual([]);
});
it("keeps the current tab usable when browser storage is blocked", async () => {
  vi.stubGlobal("window", { get localStorage() { throw Error("blocked"); } });
  const history = await import("@/lib/guest-request-history");
  history.rememberGuestRequest(first);
  expect(history.guestRequestIds()).toEqual([first]);
});
it("retains the new link in this tab when reads succeed but quota blocks writes", async () => {
  saved.set("vng-guest-requests-v1", JSON.stringify([first]));
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => saved.get(key), setItem: () => { throw Error("quota"); } } });
  const history = await import("@/lib/guest-request-history");
  history.rememberGuestRequest(second);
  expect(history.guestRequestIds()).toEqual([second, first]);
});
