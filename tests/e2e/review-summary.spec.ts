import { test, expect } from "./fixtures";

test("reviewer defaults to original and summary, preserves audit on demand and reuses summary on reload", async ({ page, request }) => {
  const rawText = "Máy in văn phòng báo kẹt giấy. Tôi cần kiểm tra gì an toàn?";
  const created = await request.post("/api/support/requests", { data: { requesterMode: "guest", rawText, confirmed: true, idempotencyKey: crypto.randomUUID() } });
  expect(created.status()).toBe(201);
  const row = (await created.json()).data;
  const summary = page.waitForResponse(r => r.url().endsWith(`/api/review/${row.id}/summary`));
  await page.goto(`/review?requestId=${row.id}`);
  expect((await summary).status()).toBe(200);
  await expect(page.getByRole("region", { name: "Yêu cầu nguyên văn" })).toContainText(rawText);
  await expect(page.getByRole("region", { name: "Tóm tắt yêu cầu" })).toContainText("Bản tóm tắt mô phỏng");
  await expect(page.getByRole("region", { name: "Hồ sơ xử lý" })).toHaveCount(0);
  const toggle = page.getByRole("button", { name: "Xem lịch sử & bằng chứng", exact: true });
  await toggle.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Hồ sơ xử lý" })).toBeVisible();
  await page.getByRole("tab", { name: /^Lịch sử xử lý/ }).click();
  await expect(page.locator(".support-timeline > li")).toHaveCount(row.events.length);
  for (const event of row.events) {
    await expect(page.locator(".support-timeline")).toContainText(event.explanation);
  }
  const next = page.waitForResponse(r => r.url().endsWith(`/api/review/${row.id}/summary`));
  await page.reload();
  expect((await (await next).json()).data.cache).toBe("hit");
  await expect(page.getByRole("region", { name: "Hồ sơ xử lý" })).toHaveCount(0);
  expect((await (await request.get(`/api/support/requests/${row.id}`)).json()).data.version).toBe(row.version);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("summary outage keeps original and reviewer controls usable", async ({ page, request }) => {
  const response = await request.post("/api/support/requests", { data: { requesterMode: "guest", rawText: "VPN không kết nối", confirmed: true, idempotencyKey: crypto.randomUUID() } });
  const row = (await response.json()).data;
  await page.route(`**/api/review/${row.id}/summary`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: { message: "Tóm tắt tạm không khả dụng." } }) }));
  await page.goto(`/review?requestId=${row.id}`);
  await expect(page.getByRole("region", { name: "Yêu cầu nguyên văn" })).toContainText("VPN không kết nối");
  await expect(page.getByRole("region", { name: "Tóm tắt yêu cầu" })).toContainText("Tóm tắt tạm không khả dụng");
  await expect(page.getByRole("button", { name: "Thử tóm tắt lại" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "AI soạn 3 gợi ý tin nhắn" })).toBeEnabled();
});
