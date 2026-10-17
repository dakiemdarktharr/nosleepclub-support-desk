import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/review/[id]/route";
import { GET } from "@/app/api/support/requests/[id]/route";
import { resetSupportTestStore } from "@/lib/support-repository";
import * as model from "@/lib/support-model";
import { submitSupport } from "@/services/support";
import { feedbackSupport, reviewSupport } from "@/services/review";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const create = (rawText: string) => submitSupport({
  requesterMode: "guest", rawText, confirmed: true, idempotencyKey: crypto.randomUUID(),
});
const approve = (id: string, version: number) => POST(new Request("http://local/api/review/" + id, {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": id },
  body: JSON.stringify({ action: "APPROVE", version }),
}), { params: Promise.resolve({ id }) });

it.each([
  { rawText: "Need database access", bucket: "MISSING_INFO" },
  { rawText: "Open public RDP port 3389", bucket: "SECURITY_RISK" },
  { rawText: "Grant production admin", bucket: "BEYOND_AUTHORITY" },
  { rawText: "Tôi muốn gặp nhân viên hỗ trợ", bucket: "BEYOND_AUTHORITY" },
])("direct approval API accepts a waiting $bucket request without a reason or AI", async ({ rawText, bucket }) => {
  const original = await create(rawText);
  expect(original.decision?.bucket).toBe(bucket);
  expect(["NEEDS_INFORMATION", "ESCALATED"]).toContain(original.status);
  const callModel = vi.spyOn(model, "callModel");
  const response = await approve(original.id, original.version);
  expect(response.status).toBe(200);
  const result = (await response.json()).data;
  expect(result.status).toBe("APPROVED_BY_HUMAN");
  expect(result.version).toBe(original.version + 1);
  expect(result.decision).toEqual(original.decision);
  expect(result.canonical).toEqual(original.canonical);
  expect(result.events).toHaveLength(original.events.length + 1);
  expect(result.events.at(-1)).toMatchObject({ action: "APPROVE", beforeStatus: original.status,
    afterStatus: "APPROVED_BY_HUMAN", senderMessage: "Nhân viên hỗ trợ đã duyệt yêu cầu." });
  expect(result.events.at(-1).actor).toBeTruthy();
  expect(result.events.at(-1).explanation).toContain("Nhân viên duyệt thủ công");
  expect(callModel).not.toHaveBeenCalled();
  const readback = await GET(new Request("http://local"), { params: Promise.resolve({ id: original.id }) });
  expect((await readback.json()).data).toEqual(result);
  expect((await approve(original.id, original.version)).status).toBe(409);
  expect((await approve(original.id, result.version)).status).toBe(409);
});

it("approval after a failed-help handoff preserves assistance and feedback", async () => {
  const original = await create("VPN không kết nối");
  const waiting = await feedbackSupport(original.id, { version: original.version, choice: "CONFUSED" });
  const result = (await (await approve(waiting.id, waiting.version)).json()).data;
  expect(result.status).toBe("APPROVED_BY_HUMAN");
  expect(result.assistance).toEqual(waiting.assistance);
  expect(result.feedback).toEqual(waiting.feedback);
  expect(result.decision).toEqual(waiting.decision);
});

it.each(["REJECT", "STOP"] as const)("cannot approve a request already closed by %s", async action => {
  const original = await create("Need database access");
  const closed = await reviewSupport(original.id, { version: original.version, action, reason: "Đóng hồ sơ thử nghiệm." }, "reviewer");
  const response = await approve(closed.id, closed.version);
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("INVALID_TRANSITION");
});

it("approval API retains the configured reviewer access guard", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SUPPORT_ACCESS_MODE", "disabled");
  const response = await approve(crypto.randomUUID(), 0);
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("REVIEW_NOT_ENABLED");
});
