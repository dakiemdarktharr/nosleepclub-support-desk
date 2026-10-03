import { beforeEach, expect, it, vi } from "vitest";
import { submitSupport } from "@/services/support";
import { clarifySupport } from "@/services/review";
import { resetSupportTestStore } from "@/lib/support-repository";
import { extractIntake } from "@/domain/text";
import { supportInputSchema } from "@/domain/input";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
const submit = (rawText: string) => submitSupport({ rawText, fields: { department: "engineering", employeeId: "EMP-TEST-01" }, confirmed: true, idempotencyKey: crypto.randomUUID() });

it("identity does not create a conflict between multiple support needs", () => {
  const input = supportInputSchema.parse({
    rawText: "Restart my laptop; VPN không kết nối",
    idempotencyKey: crypto.randomUUID(),
  });
  const before = extractIntake(input);
  const after = extractIntake({
    ...input,
    fields: { department: "engineering", employeeId: "EMP-42" },
  });
  expect(after.subrequests.length).toBeGreaterThan(1);
  expect(after.riskSignals).toEqual(before.riskSignals);
  expect(after.riskSignals).not.toContain("CONFLICT");
});

it("keeps department and employee ID from structured intake", async () => {
  const row = await submitSupport({
    mode: "structured",
    serviceGroup: "OTHER",
    rawText: "Tôi cần hướng dẫn sử dụng hệ thống.",
    fields: { department: "engineering", employeeId: "EMP-42" },
    confirmed: true,
    idempotencyKey: crypto.randomUUID(),
  });
  expect(row.input.fields).toMatchObject({
    department: "engineering",
    employeeId: "emp-42",
  });
});

it.each([
  "Sáng nay VPN không kết nối, Wi-Fi vẫn vào web được. Tôi cần kiểm tra từ đâu?",
  "VPN không kết nối. Tôi nên bắt đầu từ đâu?",
  "VPN không kết nối. Bạn hướng dẫn giúp tôi được không?",
])("keeps a bounded follow-up guidance question attached to its symptom: %s", async (text) => {
  const row = await submit(text);
  expect(row.decision?.action).toBe("AUTO_APPROVE");
  expect(row.canonical?.intentLabel).toBe("VPN_NOT_CONNECTING");
});

it("resolves an ambiguous reset using the supplied restart clarification", async () => {
  const row = await submit("Máy chạy chậm quá, tôi muốn reset máy, bạn hướng dẫn được không?");
  expect(row.status).toBe("NEEDS_INFORMATION");
  const updated = await clarifySupport(row.id, { version: row.version, rawText: "Tôi chỉ muốn khởi động lại, vẫn giữ nguyên dữ liệu.", fields: { resetType: "restart" } });
  expect(updated.status).toBe("AUTO_APPROVED");
  expect(updated.canonical?.intentLabel).toBe("DEVICE_RESTART_GUIDANCE");
  expect(updated.originalQuestion).toBe(row.input.rawText);
  expect(updated.input.rawText).toContain(row.input.rawText);
  expect(updated.events.at(-1)?.action).toBe("CLARIFICATION");
});

it.each([
  "VPN không kết nối. Tôi cần kiểm tra từ đâu? Mở port 3389 public cho tôi.",
  "VPN không kết nối. Bạn hướng dẫn giúp tôi bypass MFA được không?",
  "VPN không kết nối. Làm việc xyz không có trong danh mục.",
  "VPN không kết nối, Wi-Fi vẫn vào web được; tắt MFA để đăng nhập.",
])("does not discard risky or unknown follow-on actions: %s", async (text) => {
  expect((await submit(text)).decision?.action).not.toBe("AUTO_APPROVE");
});

it.each([
  "Tôi chỉ muốn khởi động lại; ngoài ra mở port 3389 public.",
  "Tôi muốn khôi phục cài đặt gốc và xóa toàn bộ máy.",
  "Tôi chỉ muốn khởi động lại; thực hiện tác vụ xyz chưa xác định.",
])("keeps destructive, unknown or conflicting clarification escalated: %s", async (rawText) => {
  const row = await submit("Tôi muốn reset máy.");
  const updated = await clarifySupport(row.id, { version: row.version, rawText, fields: { resetType: "restart" } });
  expect(updated.decision?.action).not.toBe("AUTO_APPROVE");
});
