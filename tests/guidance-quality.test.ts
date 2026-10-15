import { expect, it } from "vitest";
import type { SupportInput } from "@/domain/contracts";
import { guidanceTemplate } from "@/domain/guidance";
import { evaluatePolicy } from "@/domain/policy";
import { extractIntake } from "@/domain/text";

const input = (rawText: string): SupportInput => ({
  rawText, mode: "freeform", serviceGroup: "OTHER", fields: {},
  confirmed: true, idempotencyKey: crypto.randomUUID(),
});
const printer = (rawText: string) => extractIntake({
  ...input(rawText), mode: "structured", serviceGroup: "DEVICE_BOOT",
  requestKind: "GUIDANCE", fields: { intentLabel: "DEVICE_PRINTER" },
});

it("acknowledges the reported paper jam and gates a test print on a cleared alert", () => {
  const request = extractIntake(input("Máy in văn phòng báo kẹt giấy. Tôi nên kiểm tra gì trước?"));
  expect(evaluatePolicy(request)).toMatchObject({ action: "AUTO_APPROVE", ruleIds: ["GUIDE-007"] });
  const guide = guidanceTemplate(request);
  expect(guide.summary).toContain("đang báo kẹt giấy");
  expect(guide.stepByStepInstructions[0]).toContain("Dừng gửi thêm lệnh in");
  expect(guide.stepByStepInstructions[1]).toContain("đúng hãng/model");
  expect(guide.stepByStepInstructions[2]).toContain("Không cố kéo giấy");
  const printSteps = guide.stepByStepInstructions.filter(step => /thử.*trang/.test(step));
  expect(printSteps).toHaveLength(1);
  expect(printSteps[0]).toMatch(/^Chỉ khi máy báo sẵn sàng và không còn cảnh báo kẹt giấy/);
  expect(guide.nextQuestion).toContain("hãng/model");
  expect(guide.nextQuestion).toContain("mã lỗi");
  expect(guide.stepByStepInstructions.join(" ")).not.toMatch(/rút nguồn|tắt máy in|https?:|HP|Canon/);
});

it.each(["Máy in bị kẹt giấy", "Printer reports a paper jam", "The printer is jammed"])(
  "uses the same bounded jam guide for %s", text => {
    expect(guidanceTemplate(printer(text)).summary).toContain("đang báo kẹt giấy");
  },
);

it.each([
  ["Máy in không bị kẹt giấy, đang offline", "offline"],
  ["Máy in không còn báo kẹt giấy, đang offline", "offline"],
  ["Printer has no paper jam, it is offline", "offline"],
  ["Printer paper jam is cleared, but still offline", "offline"],
  ["Máy in đã hết kẹt giấy, hiện báo hết giấy", "hết giấy"],
  ["Máy in báo hết giấy", "hết giấy"],
  ["Printer is out of paper", "hết giấy"],
  ["Tôi chọn nhầm máy in", "máy in đang chọn"],
  ["I selected the wrong printer", "máy in đang chọn"],
])("preserves the actual non-jam symptom in %s", (text, summary) => {
  const guide = guidanceTemplate(printer(text));
  expect(guide.summary).toContain(summary);
  expect(guide.summary).not.toContain("đang báo kẹt giấy");
  expect(guide.nextQuestion).toContain("mã lỗi");
});

it("keeps an unresolved jam ahead of a concurrent offline status", () => {
  expect(guidanceTemplate(printer("Máy in offline và báo kẹt giấy")).summary).toContain("đang báo kẹt giấy");
});

it("does not ask the sender to repeat jam handling on a follow-up", () => {
  const guide = guidanceTemplate(printer("Máy in vẫn kẹt giấy"), 1);
  expect(guide.stepByStepInstructions[0]).toContain("Dừng lặp lại");
  expect(guide.nextQuestion).toContain("hãng/model");
  expect(guide.canPassToAdmin).toBe(true);
});

it("addresses VPN disconnects without claiming a cause or changing security settings", () => {
  const request = extractIntake(input("VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn."));
  const guide = guidanceTemplate(request);
  expect(guide.summary).toContain("liên tục ngắt kết nối");
  expect(guide.diagnosis).toContain("Có thể");
  expect(guide.stepByStepInstructions[0]).toContain("Kiểm tra Internet");
  expect(guide.stepByStepInstructions.at(-1)).toContain("giữ nguyên MFA, firewall");
  expect(guide.nextQuestion).toContain("bao lâu");
  expect(guide.nextQuestion).toContain("mã lỗi");
  expect(guide.potentialFixes).toEqual(guide.stepByStepInstructions);
});
