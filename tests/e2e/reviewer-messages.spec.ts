import { test, expect } from "./fixtures";
import type { SupportRequest } from "../../src/domain/contracts";

for (const source of ["draft", "manual"] as const) {
  test(`reviewer sends a ${source} message without approving and sender receives it`, async ({ page, request, context }, info) => {
    const created = await request.post("/api/support/requests", { data: {
      requesterMode: "guest", rawText: "Need database access", confirmed: true, idempotencyKey: crypto.randomUUID(),
    } });
    expect(created.ok()).toBe(true);
    const original: SupportRequest = (await created.json()).data;
    const handoff = await request.post(`/api/support/requests/${original.id}/feedback`, {
      data: { version: original.version, choice: "ADMIN" },
    });
    expect(handoff.ok()).toBe(true);
    const row: SupportRequest = (await handoff.json()).data;
    expect(row.status).toBe("ESCALATED");
    await page.goto(`/review?requestId=${row.id}`);
    const send = page.getByRole("button", { name: "Gửi cho người gửi", exact: true });
    const approve = page.getByRole("button", { name: "Duyệt yêu cầu", exact: true });
    const composer = page.getByLabel("Tin nhắn cho người gửi");
    await expect(send).toBeDisabled();
    await expect(approve).toBeEnabled();
    await expect(page.locator(".it-block-notice")).toHaveCount(0);
    let message: string;
    if (source === "draft") {
      const option = page.locator(".review-draft-option").first();
      await expect(option).toBeVisible();
      message = await option.locator("span").innerText();
      await option.click();
    } else {
      await composer.fill("   ");
      await expect(send).toBeDisabled();
      message = "Bạn gửi thêm tên hệ thống và phạm vi truy cập giúp mình nhé.\nMình sẽ kiểm tra tiếp.";
      await composer.fill(message);
    }
    await expect(composer).toHaveValue(message);
    await expect(send).toBeEnabled();
    await page.screenshot({ path: `test-results/reviewer-message-${source}-${info.project.name}.png`, fullPage: true });
    const beforeSend = (await (await request.get(`/api/support/requests/${row.id}`)).json()).data;
    expect(beforeSend.version).toBe(row.version);
    expect(beforeSend.events.some((event: { senderMessage?: string }) => event.senderMessage)).toBe(false);
    const sender = await context.newPage();
    await sender.goto(`/requests/${row.id}`);
    await expect(sender.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toHaveCount(0);
    await sender.bringToFront();
    await send.click();
    await expect(page.getByText("Đã gửi tin nhắn vào hồ sơ người gửi. Trạng thái yêu cầu được giữ nguyên.")).toBeVisible();
    await expect(composer).toHaveValue("");
    await expect(send).toBeDisabled();
    await expect(approve).toBeEnabled();
    await sender.bringToFront();
    await expect(sender.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toContainText(message, { timeout: 10000 });
    await sender.reload();
    await expect(sender.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toContainText(message);
    const stored: SupportRequest = (await (await request.get(`/api/support/requests/${row.id}`)).json()).data;
    expect(stored.status).toBe(row.status);
    expect(stored.version).toBe(row.version + 1);
    expect(stored.decision).toEqual(row.decision);
    expect(stored.events.at(-1)).toMatchObject({ action: "SEND_MESSAGE", senderMessage: message });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await sender.close();
  });
}

test("failed sends preserve the draft, and retry sends it only once", async ({ page, request }) => {
  const created = await request.post("/api/support/requests", { data: {
    requesterMode: "guest", rawText: "VPN không kết nối", confirmed: true, idempotencyKey: crypto.randomUUID(),
  } });
  expect(created.ok()).toBe(true);
  const row: SupportRequest = (await created.json()).data;
  await page.goto(`/review?requestId=${row.id}`);
  const composer = page.getByLabel("Tin nhắn cho người gửi");
  const send = page.getByRole("button", { name: "Gửi cho người gửi", exact: true });
  const message = "Bạn gửi thông báo lỗi VPN giúp mình nhé.";
  await composer.fill(message);
  await page.route(`**/api/review/${row.id}`, route => route.fulfill({
    status: 503, contentType: "application/json",
    body: JSON.stringify({ success: false, error: { code: "SERVER_ERROR", message: "Chưa gửi được tin nhắn thử nghiệm." } }),
  }), { times: 1 });
  await send.click();
  await expect(page.getByRole("alert").filter({ hasText: "Chưa gửi được tin nhắn thử nghiệm." })).toBeVisible();
  await expect(composer).toHaveValue(message);
  await expect(send).toBeEnabled();
  await expect(page.getByText("Đã gửi tin nhắn vào hồ sơ người gửi. Trạng thái yêu cầu được giữ nguyên.")).toHaveCount(0);
  await send.click();
  await expect(composer).toHaveValue("");
  const stored: SupportRequest = (await (await request.get(`/api/support/requests/${row.id}`)).json()).data;
  expect(stored.events.filter(event => event.action === "SEND_MESSAGE")).toHaveLength(1);
  expect(stored.events.at(-1)?.senderMessage).toBe(message);
});
