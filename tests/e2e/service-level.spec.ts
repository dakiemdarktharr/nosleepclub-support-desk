import { test, expect } from "./fixtures";
import type { SupportRequest } from "../../src/domain/contracts";

test("reviewer sees shadow clocks and sample counts while the requester sees no unapproved commitments", async ({ page, request }, info) => {
  const created = await request.post("/api/support/requests", { data: {
    requesterMode: "guest", rawText: "Máy in offline", confirmed: true, idempotencyKey: crypto.randomUUID(),
  } });
  expect(created.ok()).toBe(true);
  const original: SupportRequest = (await created.json()).data;
  const handed = await request.post(`/api/support/requests/${original.id}/feedback`, { data: { version: original.version, choice: "ADMIN" } });
  expect(handed.ok()).toBe(true);
  await page.goto(`/review?requestId=${original.id}`);
  const panel = page.getByRole("region", { name: "Đo thời gian phục vụ", exact: true });
  await expect(panel).toContainText("SHADOW");
  await expect(panel).toContainText("Phản hồi đầu tiên của nhân viên");
  await panel.getByText("Mục tiêu, lịch và trách nhiệm", { exact: true }).first().click();
  await expect(panel).toContainText("Chờ xác nhận");
  await expect(panel).toContainText("Chưa cấu hình mục tiêu");
  await panel.screenshot({ path: `test-results/service-level-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const sent = await request.post(`/api/review/${original.id}`, { data: {
    version: (await handed.json()).data.version, action: "SEND_MESSAGE", reason: "Kiểm tra nguồn và kết nối máy in nhé.",
  } });
  expect(sent.ok()).toBe(true);
  await page.reload();
  await expect(panel).toContainText("Hoàn tất · SHADOW");
  const sentRow: SupportRequest = (await sent.json()).data;
  const rejected = await request.post(`/api/review/${original.id}`, { data: { version: sentRow.version, action: "REJECT", reason: "Từ chối hồ sơ giả lập" } });
  expect(rejected.ok()).toBe(true);
  const reopened = await request.post(`/api/review/${original.id}`, { data: { version: (await rejected.json()).data.version, action: "OVERRIDE", target: "NEEDS_INFORMATION", reason: "Mở lại hồ sơ để bổ sung" } });
  expect(reopened.ok()).toBe(true);
  const measured = await request.get(`/api/review/${original.id}/service-level`);
  expect(measured.ok()).toBe(true);
  const clocks: Array<{ metric: string; state: string }> = (await measured.json()).data.clocks;
  expect(clocks.filter(clock => clock.metric === "human_response").map(clock => clock.state)).toEqual(["COMPLETED", "RUNNING"]);
  await page.goto(`/requests/${original.id}`);
  await expect(page.getByRole("region", { name: "Đo thời gian phục vụ", exact: true })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText("SHADOW");
  await page.goto("/review/service-level");
  await page.getByLabel("Từ (giờ trên máy)").fill("2026-10-01T00:00");
  await page.getByLabel("Đến (giờ trên máy)").fill("2026-11-01T00:00");
  await page.getByRole("button", { name: "Xem phép đo", exact: true }).click();
  const result = page.getByRole("region", { name: "Kết quả phép đo" });
  await expect(result).toContainText("SHADOW không chứng minh đạt SLA");
  await expect(result).toContainText("chưa có cơ sở tính");
  await result.screenshot({ path: `test-results/service-level-report-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
