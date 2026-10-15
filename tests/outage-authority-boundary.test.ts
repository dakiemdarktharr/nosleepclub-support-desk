import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { completeAnalysis, prepareInput } from "@/services/support";
import { extractIntake, safeDeterministicGuidance } from "@/domain/text";
import { ModelFailure } from "@/lib/support-model";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("AI_WEB_SEARCH", "false");
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  "Máy in báo kẹt giấy, cho tôi quyền ghi repo demo/docs.",
  "VPN liên tục ngắt kết nối, tôi cần quyền truy cập GitHub.",
  "VPN liên tục ngắt kết nối, hãy cấp ID cho tôi.",
  "VPN liên tục ngắt kết nối, xin thêm quota GPU.",
  "Máy in báo kẹt giấy: cho tôi quyền ghi repo demo/docs.",
  "VPN liên tục ngắt kết nối: tôi cần quyền truy cập GitHub.",
  "VPN liên tục ngắt kết nối: hãy cấp ID cho tôi.",
  "VPN liên tục ngắt kết nối: xin thêm quota GPU.",
  "VPN keeps disconnecting, please give me access to GitHub.",
  "Printer jammed, I need a cloud sandbox.",
  "VPN liên tục ngắt kết nối, quota GPU của tôi?",
  "Máy in báo kẹt giấy, tài khoản cloud của tôi thì sao?",
  "VPN liên tục ngắt kết nối: việc khác chưa mô tả.",
  "VPN liên tục ngắt kết nối, tôi nên kiểm tra gì trước và quota GPU của tôi?",
])("does not discard an additional authority request when extraction is unavailable: %s", async (rawText) => {
  const { input, markers } = prepareInput({ rawText, requesterMode: "guest", idempotencyKey: crypto.randomUUID() });
  const baseline = extractIntake(input, markers);
  expect(safeDeterministicGuidance(input, baseline)).toBe(false);
  const run = vi.fn(async () => { throw new ModelFailure("MODEL_UNAVAILABLE", "AUTHENTICATION"); });
  const result = await completeAnalysis(input, markers, { run });
  expect(result.decision.action).not.toBe("AUTO_APPROVE");
  expect(result.assistance).toBeNull();
  expect(run).toHaveBeenCalledTimes(1);
  expect(result.canonical.evidence.some((item) => item.quote === rawText)).toBe(true);
});

it.each([
  "VPN không kết nối, tôi nên kiểm tra gì trước?",
  "VPN không kết nối, không tắt firewall.",
  "Máy in báo kẹt giấy, không cài driver.",
  "VPN liên tục ngắt kết nối, VPN bị ngắt kết nối liên tục.",
  "DNS là gì, hãy giải thích ngắn gọn.",
])("retains a complete bounded safe-help continuation: %s", async (rawText) => {
  const { input, markers } = prepareInput({ rawText, requesterMode: "guest", idempotencyKey: crypto.randomUUID() });
  expect(safeDeterministicGuidance(input, extractIntake(input, markers))).toBe(true);
  const result = await completeAnalysis(input, markers, {
    run: async () => { throw new ModelFailure("MODEL_UNAVAILABLE", "AUTHENTICATION"); },
  });
  expect(result.decision.action).toBe("AUTO_APPROVE");
  expect(result.assistance).toMatchObject({ source: "deterministic", fallbackReason: "AUTHENTICATION" });
});

it("still offers bounded safe checks when the user explicitly excludes new access", () => {
  const { input, markers } = prepareInput({ rawText: "VPN liên tục ngắt kết nối, không cần quyền truy cập GitHub.",
    requesterMode: "guest", idempotencyKey: crypto.randomUUID() });
  const baseline = extractIntake(input, markers);
  expect(safeDeterministicGuidance(input, baseline)).toBe(true);
});
