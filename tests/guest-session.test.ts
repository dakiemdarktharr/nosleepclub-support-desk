import { afterEach, expect, it, vi } from "vitest";
import { chooseGuestDepartment, guestDepartments, isGuestDepartment } from "@/domain/guest-session";
import { prepareInput, completeAnalysis } from "@/services/support";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("random selection stays within demo departments and excludes the previous one", () => {
  for (const previous of guestDepartments) {
    for (const random of [0, 0.2, 0.5, 0.999999]) {
      const chosen = chooseGuestDepartment(previous, () => random);
      expect(isGuestDepartment(chosen)).toBe(true);
      expect(chosen).not.toBe(previous);
    }
  }
  expect(isGuestDepartment("admin")).toBe(false);
});
it("session survives remount/reload and changes only on explicit entry", async () => {
  vi.resetModules();
  const saved = new Map<string, string>();
  vi.stubGlobal("window", { sessionStorage: {
    getItem: (key: string) => saved.get(key), setItem: (key: string, value: string) => saved.set(key, value),
  } });
  const firstModule = await import("@/lib/guest-demo-session");
  const first = firstModule.startGuestSession();
  expect(firstModule.ensureGuestSession()).toBe(first);
  vi.resetModules();
  const reloaded = await import("@/lib/guest-demo-session");
  expect(reloaded.ensureGuestSession()).toBe(first);
  const second = reloaded.startGuestSession();
  expect(second).not.toBe(first);
  expect(reloaded.ensureGuestSession()).toBe(second);
});
it("blocked or malformed storage never prevents guest access", async () => {
  vi.resetModules();
  vi.stubGlobal("window", { sessionStorage: {
    getItem: () => "administrator", setItem: () => { throw new Error("blocked"); },
  } });
  const session = await import("@/lib/guest-demo-session");
  const first = session.ensureGuestSession();
  expect(isGuestDepartment(first)).toBe(true);
  expect(session.ensureGuestSession()).toBe(first);
  vi.stubGlobal("window", { get sessionStorage() { throw new Error("blocked"); } });
  expect(session.ensureGuestSession()).toBe(first);
  expect(session.startGuestSession()).not.toBe(first);
});
it.each(guestDepartments)("department %s grants no employee identity or policy authority", async guestDepartment => {
  vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", "");
  const { input, markers } = prepareInput({
    requesterMode: "guest", guestDepartment, rawText: "Mở port 3389 ra Internet",
    fields: { employeeId: "synthetic-admin", department: "it" }, idempotencyKey: crypto.randomUUID(),
  });
  expect(input.fields).toEqual({});
  const { canonical, decision } = await completeAnalysis(input, markers);
  expect(decision.action).toBe("ESCALATE");
  expect(canonical.entities.department).toBeUndefined();
  expect(canonical.entities.employeeId).toBeUndefined();
  expect(canonical.riskSignals).toContain("PUBLIC_EXPOSURE");
});
