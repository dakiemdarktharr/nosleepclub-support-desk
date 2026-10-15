import { expect, test } from "./fixtures";

for (const [label, destination] of [
  ["Tôi cần hỗ trợ", "/login"],
  ["Dành cho Admin", "/review"],
  ["Đăng nhập không cần tài khoản", "/guest"],
]) {
  test(`line reveal enters ${destination}, logo wipes home and back still works`, async ({ page }, info) => {
    await page.goto("/");
    const entry = page.getByRole("link", { name: label, exact: true });
    await expect(entry).toBeVisible();
    if (destination === "/login") {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, img => img.decode().catch(() => {})));
      });
      await page.screenshot({ path: `artifacts/motion-home-${info.project.name}.png`, fullPage: true, animations: "disabled" });
    }
    await entry.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-transition="line"]')).toBeAttached();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect(page.locator(".route-curtain")).toHaveCount(0);
    await page.getByRole("link", { name: "VNG Support", exact: true }).click();
    await expect(page.locator('[data-transition="wipe"]')).toBeAttached();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".route-curtain")).toHaveCount(0);
    await expect(page.locator("main a")).toHaveCount(3);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("buttons respond to pointer and keyboard without emulated touch hover", async ({ page }, info) => {
  await page.goto("/guest");
  const button = page.getByRole("button", { name: "Mô tả vấn đề", exact: true });
  if (info.project.name === "chromium") {
    await button.hover();
    await expect(button).toHaveCSS("scale", "1.025");
  }
  await button.focus();
  await page.keyboard.down("Space");
  await expect(button).toHaveCSS("scale", "0.97");
  await page.keyboard.up("Space");
  if (info.project.name === "mobile") await expect(button).toHaveCSS("scale", "none");
});

test("reduced motion skips curtains and retains a static, labelled AI progress bar", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "Đăng nhập không cần tài khoản", exact: true }).click();
  await expect(page).toHaveURL(/\/guest$/);
  await expect(page.locator(".route-curtain")).toHaveCount(0);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/support/preview", async route => { await gate; await route.continue(); });
  await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill("DNS là gì?");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  const progress = page.getByRole("progressbar", { name: "Đang chờ phản hồi" });
  await expect(progress).toBeVisible();
  await expect(progress).not.toHaveAttribute("aria-valuenow");
  await expect(progress.locator("span")).toHaveCSS("animation-name", "none");
  release();
  await expect(progress).toHaveCount(0);
});

test("AI pending survives slow responses, clears on failure and keeps the draft for retry", async ({ page }, info) => {
  await page.goto("/guest");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/support/preview", async route => {
    await gate;
    await route.fulfill({ status: 503, json: { success: false, error: { message: "Dịch vụ tạm thời gián đoạn. Vui lòng thử lại." } } });
  });
  const input = page.getByLabel("Mô tả yêu cầu", { exact: true });
  await input.fill("VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(input).toBeDisabled();
  await page.locator(".ai-pending").scrollIntoViewIfNeeded();
  await page.locator(".ai-progress > span").evaluate(element => {
    for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = 650; }
  });
  await page.locator(".ai-pending").screenshot({ path: `artifacts/motion-ai-card-${info.project.name}.png` });
  await page.screenshot({ path: `artifacts/motion-ai-${info.project.name}.png`, fullPage: true });
  release();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("gián đoạn");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(input).toHaveValue("VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.");
  await expect(input).toBeEnabled();
  await page.unroute("**/api/support/preview");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.locator('[data-guide="sender-confirm"]')).toBeEnabled();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

test("request skeleton resolves to the original record and followup shows AI progress", async ({ page, request }, info) => {
  const saved = await request.post("/api/support/requests", { data: { mode: "freeform", requesterMode: "guest", serviceGroup: "OTHER", rawText: "Máy in báo kẹt giấy. Tôi nên kiểm tra gì trước?", fields: {}, confirmed: true, idempotencyKey: crypto.randomUUID() } });
  expect(saved.status()).toBe(201);
  const row = (await saved.json()).data;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/support/requests/${row.id}`, async route => { await gate; await route.continue(); });
  await page.goto(`/requests/${row.id}`);
  const requestSkeleton = page.locator(".content-skeleton").filter({ hasText: "Đang tải yêu cầu…" });
  await expect(requestSkeleton).toBeVisible();
  await page.screenshot({ path: `artifacts/motion-skeleton-${info.project.name}.png`, fullPage: true, animations: "disabled" });
  release();
  await expect(requestSkeleton).toHaveCount(0);
  await expect(page.getByText(row.originalQuestion, { exact: true })).toBeVisible();
  let releaseFollowup!: () => void;
  const followupGate = new Promise<void>(resolve => { releaseFollowup = resolve; });
  await page.route(`**/api/support/requests/${row.id}/conversation`, async route => { await followupGate; await route.continue(); });
  await page.getByLabel("Hỏi tiếp", { exact: true }).fill("Tôi chưa làm được, nhờ nhân viên hỗ trợ.");
  await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  releaseFollowup();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByText("Trạng thái:")).toContainText("Đang chờ nhân viên");
});

test("changing reduced-motion preference cancels a curtain immediately", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Tôi cần hỗ trợ", exact: true }).click();
  await expect(page.locator(".route-curtain")).toBeAttached();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".route-curtain")).toHaveCount(0);
  await expect(page.getByLabel("ID nhân viên", { exact: true })).toBeEditable();
});

test("a stalled API releases the pending UI at the deadline without clearing the draft", async ({ page }) => {
  await page.goto("/guest");
  await page.clock.install();
  await page.route("**/api/support/preview", () => { /* Fault injection: no headers/body arrive. */ });
  const input = page.getByLabel("Mô tả yêu cầu", { exact: true });
  await input.fill("DNS là gì?");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  await page.clock.fastForward(60_001);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Hết thời gian chờ xác nhận");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(input).toBeEditable();
  await expect(input).toHaveValue("DNS là gì?");
});

test("first-visit onboarding waits for the role reveal and remains dismissible", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto("/");
  await page.getByRole("link", { name: "Dành cho Admin", exact: true }).click();
  await expect(page.locator('[data-transition="line"]')).toBeAttached();
  await expect(page.getByRole("dialog", { name: "Bắt đầu cùng VNG Support" })).not.toBeVisible();
  await expect(page.locator(".route-curtain")).toHaveCount(0);
  const intro = page.getByRole("dialog", { name: "Bắt đầu cùng VNG Support" });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: "Đã hiểu" }).click();
  await expect(intro).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Tiếp nhận hỗ trợ", exact: true })).toBeVisible();
});
