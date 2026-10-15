import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { previewSupport, submitSupport } from "@/services/support";
import { feedbackSupport } from "@/services/review";
import {
  getSupportRequest,
  resetSupportTestStore,
} from "@/lib/support-repository";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("SUPPORT_STORAGE", "memory-demo");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());

it("persists the preview assessment without another model call and preserves it through handoff", async () => {
  const preview = await previewSupport({
    requesterMode: "guest",
    rawText: "VPN không kết nối",
    idempotencyKey: crypto.randomUUID(),
  });
  const row = await submitSupport({ ...preview.input, confirmed: true });
  expect(row.intakeSentiment).toEqual(preview.sentiment);
  expect(row.intakeSentiment?.source).toBe("rule-based");
  const updated = await feedbackSupport(row.id, {
    version: row.version,
    choice: "ADMIN",
  });
  expect(updated.status).toBe("ESCALATED");
  expect(updated.intakeSentiment).toEqual(row.intakeSentiment);
  const stored = await getSupportRequest(row.id);
  expect(stored?.intakeSentiment).toEqual(preview.sentiment);
  expect(stored?.events.at(-1)?.action).toBe("HANDOFF");
});
