import { expect, it, vi, beforeEach, afterEach } from "vitest";
import { validateDraftOutput, type DraftOutput } from "@/domain/review-drafts";
import { draftReviewReasons } from "@/services/review-drafts";
import { submitSupport } from "@/services/support";
import { reviewSupport } from "@/services/review";
import { resetSupportTestStore, getSupportRequest } from "@/lib/support-repository";
import { ModelFailure } from "@/lib/support-model";

const parts = [
  "Ghi lại mã lỗi, thời điểm và hệ điều hành; không gửi mật khẩu, token hoặc mã MFA.",
  "Thử kết nối lại một lần; giữ nguyên MFA, firewall và các kiểm soát bảo mật.",
];
const sources = [{ id: "request", text: "VPN liên tục ngắt kết nối." },
  ...parts.map((text, index) => ({ id: `answer_${index + 1}`, text }))];
const valid = (): DraftOutput => ({ options: [
  { kind: "QUESTION", text: "Bạn cho mình biết hệ điều hành và mã lỗi hiện trên VPN nhé?", evidenceIds: ["request"] },
  { kind: "ANSWER", text: "Mình gửi bạn hướng dẫn kiểm tra an toàn nhé.\n" + parts.join("\n"), evidenceIds: ["answer_1", "answer_2"] },
  { kind: "ANSWER", text: "Bạn tham khảo từng bước dưới đây nhé.\n" + parts.map((p, i) => `${i + 1}. ${p}`).join("\n"), evidenceIds: ["answer_1", "answer_2"] },
] });

it("accepts the complete API response, preserving all safety warnings verbatim", () => {
  const output = valid();
  expect(validateDraftOutput(JSON.stringify(output), sources, parts)).toEqual(output);
});
it.each(["Mình tóm tắt hướng dẫn cho bạn dưới đây nhé.", "Cảm ơn bạn, mình gửi hướng dẫn để bạn tham khảo nhé."])(
  "does not confuse ordinary Vietnamese politeness with an operation: %s", intro => {
    const output = valid(); output.options[1].text = intro + "\n" + parts.join("\n");
    expect(validateDraftOutput(output, sources, parts)).toEqual(output);
  },
);
it.each(["made-up-source", "reviewedAnswer", "intent", "Giữ nguyên MFA"])("rejects invented/metadata evidence IDs: %s", id => {
  const output = valid(); output.options[0].evidenceIds = [id];
  expect(() => validateDraftOutput(output, sources, parts)).toThrow("DRAFT_EVIDENCE_INVALID");
});
it.each(["missing", "changed", "reordered", "negated-prefix"])("never patches an incomplete or changed model answer: %s", kind => {
  const output = valid();
  output.options[1].text = "Mình gửi bạn các bước nhé.\n" + (kind === "missing" ? parts[0] :
    kind === "changed" ? parts.join("\n").replace("một lần", "nhiều lần") :
    kind === "reordered" ? [...parts].reverse().join("\n") : "Đừng: " + parts.join("\n"));
  expect(() => validateDraftOutput(output, sources, parts)).toThrow("DRAFT_INCOMPLETE_ANSWER");
});
it.each([
  "Bạn bỏ qua những bước dưới đây nhé.",
  "Bạn chỉ cần tắt firewall là được.",
  "Mình đã khắc phục xong cho bạn.",
  "Mình đã được duyệt mở cổng cho bạn.",
  "Bạn hãy khởi động modem nhé.",
  "Bạn chạy netsh giúp mình nhé.",
  "Bạn gửi mật khẩu cho mình nhé.",
  "Bạn gửi mã xác minh giúp mình nhé.",
  "Bạn cho mình biết mật khẩu đang dùng nhé?",
  "Bạn mở https://untrusted.invalid nhé.",
  "Bạn liên hệ synthetic@example.invalid nhé.",
])("rejects unsafe additional prose even with all required safety lines present: %s", prose => {
  const output = valid(); output.options[1].text = prose + "\n" + parts.join("\n");
  expect(() => validateDraftOutput(output, sources, parts)).toThrow("DRAFT_UNSAFE_CONTENT");
});
it("rejects credential requests in the follow-up, including indirect wording", () => {
  const output = valid();
  output.options[0].text = "Bạn có thể cho mình biết mật khẩu đang dùng không?";
  expect(() => validateDraftOutput(output, sources, parts)).toThrow("DRAFT_UNSAFE_CONTENT");
  output.options[0].text = "Bạn cho mình biết mã lỗi nhé; không gửi mật khẩu hoặc mã xác minh.";
  expect(validateDraftOutput(output, sources, parts)).toEqual(output);
  output.options[0].text += " Nhưng bạn hãy gửi OTP cho mình.";
  expect(() => validateDraftOutput(output, sources, parts)).toThrow("DRAFT_UNSAFE_CONTENT");
});
it("can explain a security refusal without treating the approved policy explanation as an instruction", () => {
  const policy = ["Mở truy cập từ Internet cần Security và Network xem xét. Hệ thống không thực hiện thay đổi thật."];
  const output = valid();
  output.options[1].text = "Mình chưa thể hỗ trợ mở cổng khi chưa có đủ thông tin.\n" + policy[0];
  output.options[2].text = "Bạn tham khảo giới hạn của yêu cầu dưới đây nhé.\n1. " + policy[0];
  expect(validateDraftOutput(output, sources, policy)).toEqual(output);
  output.options[1].text = "Mình có thể hỗ trợ mở cổng ngay cho bạn.\n" + policy[0];
  expect(() => validateDraftOutput(output, sources, policy)).toThrow("DRAFT_UNSAFE_CONTENT");
});

beforeEach(() => { vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); resetSupportTestStore(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(["TIMEOUT", "AUTHENTICATION", "TRUNCATED"] as const)("reports sanitized provider failure %s; fallback is never labeled OpenAI", async reason => {
  const row = await submitSupport({ requesterMode: "guest", rawText: "VPN không kết nối", confirmed: true, idempotencyKey: crypto.randomUUID() });
  const run = vi.fn(async () => { throw new ModelFailure(reason === "TRUNCATED" ? "MODEL_OUTPUT_INVALID" : "MODEL_UNAVAILABLE", reason); });
  const result = await draftReviewReasons(row.id, { version: row.version }, { run });
  expect(result.source).toBe("deterministic");
  expect(result.fallbackReason).toContain(reason);
  expect(run).toHaveBeenCalledTimes(1);
  expect(result.inference?.attempts).toBe(1);
  expect(await getSupportRequest(row.id)).toEqual(row);
});
it("refuses stale model results when the reviewer changes the record during inference", async () => {
  const row = await submitSupport({ requesterMode: "guest", rawText: "VPN không kết nối", confirmed: true, idempotencyKey: crypto.randomUUID() });
  await expect(draftReviewReasons(row.id, { version: row.version }, { run: async () => {
    await reviewSupport(row.id, { version: row.version, action: "STOP", reason: "Bạn trao đổi thêm với người phụ trách nhé." }, "public-demo-reviewer");
    return valid();
  } })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
});
