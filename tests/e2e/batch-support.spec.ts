import { test, expect } from "./fixtures";
test("reviewer chooses a friendly draft, confirms it, and sender receives it through polling and reload", async ({ page, request, context }, info) => {
  const response = await request.post("/api/support/requests", { data: {
    requesterMode: "guest", rawText: "VPN không kết nối", confirmed: true, idempotencyKey: crypto.randomUUID(),
  } });
  expect(response.ok()).toBe(true);
  const { data: row } = await response.json();
  const handoff = await request.post(`/api/support/requests/${row.id}/feedback`, { data: { version: row.version, choice: "ADMIN" } });
  expect(handoff.ok()).toBe(true);
  await page.goto("/review");
  await page.getByRole("button", { name: "Đã xử lý tự động", exact: true }).click();
  await page.locator(`a[href='/review?requestId=${row.id}']`).click();
  await page.getByRole("button", { name: "AI soạn 3 gợi ý tin nhắn" }).click();
  await expect(page.locator(".review-draft-option")).toHaveCount(3);
  await expect(page.locator(".review-draft-option").nth(0)).toContainText("Hỏi thêm thông tin");
  await expect(page.locator(".review-draft-option").nth(1)).toContainText("Kiểm tra Internet");
  await expect(page.locator(".review-draft-option").nth(2)).toContainText("giữ nguyên MFA");
  for (const index of [1, 2]) {
    const option = page.locator(".review-draft-option").nth(index);
    const fullText = await option.locator("span").innerText();
    await option.click();
    await expect(page.getByLabel("Lý do (không bắt buộc khi duyệt yêu cầu)")).toHaveValue(fullText);
    expect(fullText).toContain("Nếu vẫn chưa được");
  }
  await page.locator(".review-draft-option").first().click();
  await expect(page.getByLabel("Lý do (không bắt buộc khi duyệt yêu cầu)")).not.toHaveValue("");
  const latest = await (await request.get(`/api/support/requests/${row.id}`)).json();
  expect(latest.data.version).toBe((await handoff.json()).data.version);
  expect(latest.data.events.some((event: { senderMessage?: string }) => event.senderMessage)).toBe(false);
  const message = await page.getByLabel("Lý do (không bắt buộc khi duyệt yêu cầu)").inputValue();
  expect(message).toMatch(/bạn/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/batch-drafts-${info.project.name}.png`, fullPage: true });
  const sender = await context.newPage();
  await sender.goto(`/requests/${row.id}`);
  await expect(sender.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toHaveCount(0);
  // Keep the sender visible while the reviewer sends, exercising the real poll.
  await sender.bringToFront();
  await page.getByRole("button", { name: "Hỏi thêm thông tin", exact: true }).click();
  await expect(page.getByText("Đã lưu quyết định và gửi tin nhắn vào hồ sơ người gửi")).toBeVisible();
  await sender.bringToFront();
  await expect(sender.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toContainText(message, { timeout: 10000 });
  const reviewed = (await (await request.get(`/api/support/requests/${row.id}`)).json()).data;
  expect((await request.post(`/api/support/requests/${row.id}/feedback`, { data: { version: reviewed.version, choice: "ADMIN" } })).ok()).toBe(true);
  await sender.reload();
  await expect(sender.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toContainText(message);
  await sender.screenshot({ path: `artifacts/batch-message-${info.project.name}.png`, fullPage: true });
  await sender.close();
});
test("shared outage update reaches both individual trackers without closing them", async ({ page, request }, info) => {
  const site = `DEMO-${crypto.randomUUID().slice(0,8)}`.toUpperCase();
  const ids: string[] = [];
  for (let i=0; i<2; i++) {
    const response = await request.post("/api/support/requests", { data: {
      requesterMode: "guest", rawText: "Cúp điện công ty", fields: { incidentSite: site },
      confirmed: true, idempotencyKey: crypto.randomUUID(),
    } });
    expect(response.ok()).toBe(true); ids.push((await response.json()).data.id);
  }
  await page.goto("/review");
  const group = page.locator("article").filter({ has: page.getByRole("heading", { name: new RegExp(site) }) });
  await expect(group).toContainText("2 hồ sơ");
  await group.getByRole("button", { name: "Thông báo đang kiểm tra" }).click();
  await expect(group).toContainText("Nhân viên hỗ trợ đang kiểm tra");
  for (const id of ids) {
    await page.goto(`/requests/${id}`);
    await expect(page.getByRole("region", { name: "Cập nhật sự cố chung" })).toContainText("Nhân viên hỗ trợ đang kiểm tra");
    await page.reload();
    await expect(page.getByRole("region", { name: "Cập nhật sự cố chung" })).toContainText(site);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/batch-incident-${info.project.name}.png`, fullPage: true });
});
test("guest outage form offers optional explicit site without hiding support", async ({ page }) => {
  await page.goto("/guest");
  await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill("Sự cố sập mạng");
  await expect(page.getByLabel("Khu vực sự cố", { exact: true })).toBeVisible();
  await page.getByLabel("Khu vực sự cố", { exact: true }).fill("DEMO-HQ");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xác nhận và gửi yêu cầu" })).toBeVisible();
});
test("repeated public FAQ reports cache provenance and still enforces policy", async ({ request }) => {
  for (let i = 0; i < 2; i++) {
    const response = await request.post("/api/support/preview", { data: { requesterMode: "guest", rawText: "WiFi không kết nối", idempotencyKey: crypto.randomUUID() } });
    expect(response.ok()).toBe(true);
    const { data } = await response.json();
    expect(data.decision.action).toBe("AUTO_APPROVE");
    if (i === 1) {
      expect(data.assistance.source).toBe("cache");
      expect(data.assistance.cache.kind).toBe("FAQ");
      expect(data.canonical.model.source).toBe("deterministic");
    }
  }
  const response = await request.post("/api/support/preview", { data: { requesterMode: "guest", rawText: "WiFi không kết nối. Tắt firewall giúp tôi", idempotencyKey: crypto.randomUUID() } });
  expect((await response.json()).data.decision.action).toBe("ESCALATE");
});
