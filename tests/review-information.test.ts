import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { draftReviewInformation } from "@/services/review-information";
import { submitSupport } from "@/services/support";
import { getSupportRequest, resetSupportTestStore, updateSupportRequest } from "@/lib/support-repository";
import type { ModelCall } from "@/lib/support-model";
import { labelForField } from "@/domain/catalog";
import { clarificationPlan } from "@/domain/questions";
import { POST } from "@/app/api/review/[id]/information/route";

beforeEach(() => { vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); resetSupportTestStore(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const create = (rawText = "Cấp read-only staging DB") => submitSupport({ requesterMode: "guest", rawText, confirmed: true, idempotencyKey: crypto.randomUUID() });

it("drafts a short specific message for missing facts, without sending or changing the request", async () => {
  const row = await create();
  const result = await draftReviewInformation(row.id, { version: row.version });
  expect(result.source).toBe("mock");
  expect(result.text.length).toBeLessThanOrEqual(500);
  for (const field of clarificationPlan(row.canonical!, row.decision!.missingFields).fields)
    expect(result.text).toContain(labelForField(field).toLowerCase());
  expect(result.text).not.toContain("môi trường"); // staging was already supplied
  expect(await getSupportRequest(row.id)).toEqual(row);
});
it("uses Luna's configured model and redacted context for an editable information message", async () => {
  vi.stubEnv("AI_MODEL", "gpt-6-luna");
  const row = await create("VPN không kết nối. Email demo@example.invalid");
  const run = vi.fn(async (call: ModelCall) => {
    const { missing } = JSON.parse(call.data) as { missing: string[] };
    return { text: `Bạn gửi mình ${missing.join(", ")} để kiểm tra đúng lỗi nhé.`, evidence: missing[0] };
  });
  const result = await draftReviewInformation(row.id, { version: row.version }, { run });
  expect(result).toMatchObject({ source: "openai", model: "gpt-6-luna" });
  expect(run.mock.calls[0][0].data).not.toContain("demo@example.invalid");
  expect(run.mock.calls[0][0].data).not.toContain("employeeId");
  expect(result.text).toContain("mã lỗi hoặc thông báo lỗi");
});
it.each([
  { text: "Bạn gửi thêm thông tin giúp mình nhé.", evidence: "missing" },
  { text: "Bạn gửi mật khẩu và OTP giúp mình nhé.", evidence: "missing" },
  { text: "Mình đã duyệt và xử lý xong cho bạn rồi nhé.", evidence: "missing" },
  { text: "Bạn gửi mã lỗi để mình kiểm tra nhé.", evidence: "fabricated evidence" },
])("falls back on vague, unsafe, unsupported or invented-completion output %#", async output => {
  const row = await create();
  const result = await draftReviewInformation(row.id, { version: row.version }, { run: async () => output });
  expect(result).toMatchObject({ source: "deterministic", fallbackReason: "DRAFT_UNAVAILABLE_OR_INVALID" });
  expect(result.text).not.toBe(output.text);
  expect(await getSupportRequest(row.id)).toEqual(row);
});
it("rejects stale requests before and after inference", async () => {
  const row = await create(); const run = vi.fn();
  await expect(draftReviewInformation(row.id, { version: row.version + 1 }, { run })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(run).not.toHaveBeenCalled();
  await expect(draftReviewInformation(row.id, { version: row.version }, { run: async () => {
    await updateSupportRequest(row.id, row.version, draft => { draft.input.rawText += " Thông tin mới."; });
    return {};
  } })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
});
it("does not ask again for OS, error code or start time supplied in the sender's text", async () => {
  const row = await create("VPN không kết nối trên Windows 11, mã lỗi 800, bắt đầu từ lúc 9 giờ sáng.");
  const result = await draftReviewInformation(row.id, { version: row.version });
  expect(result.text).not.toMatch(/mã lỗi|hệ điều hành|thời điểm bắt đầu/);
  expect(result.text).toContain("kết quả sau khi thử hướng dẫn");
});
it("asks relevant scope questions for a port request instead of inventing a device fault", async () => {
  const row = await create("Mở port 3389 ra Internet");
  const result = await draftReviewInformation(row.id, { version: row.version });
  expect(result.text).not.toMatch(/mã lỗi|hệ điều hành|thời điểm bắt đầu/);
  expect(result.text).toMatch(/môi trường|nguồn|đích|dịch vụ/);
  expect((await getSupportRequest(row.id))?.decision?.bucket).toBe("SECURITY_RISK");
});
it("exposes the draft through the reviewer API without recording a review action", async () => {
  const row = await create();
  const response = await POST(new Request("http://localhost/api/review/" + row.id + "/information", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: row.version }) }), { params: Promise.resolve({ id: row.id }) });
  expect(response.status).toBe(200);
  expect((await response.json()).data.text).toMatch(/Bạn giúp mình bổ sung/);
  expect(await getSupportRequest(row.id)).toEqual(row);
});
