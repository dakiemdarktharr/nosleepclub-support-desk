import { test, expect } from "./fixtures";

test("guest keeps the submitted request across admin visits, reload and every reviewer status", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Đăng nhập không cần tài khoản", exact: true }).click();
  await expect(page.locator(".guest-notice")).toHaveCount(0);
  await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill("VPN không kết nối");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  const saved = page.waitForResponse(response => response.url().endsWith("/api/support/requests") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Xác nhận và gửi yêu cầu", exact: true }).click();
  const row = (await (await saved).json()).data;
  await expect(page).toHaveURL(new RegExp(`/requests/${row.id}$`));
  await page.getByRole("button", { name: /Chuyển cho nhân viên/ }).click();
  await expect(page.locator("main")).toContainText("Đang chờ nhân viên hỗ trợ");

  async function returnToGuest(status: string) {
    await page.goto("/");
    await page.getByRole("link", { name: "Đăng nhập không cần tài khoản", exact: true }).click();
    const history = page.getByRole("region", { name: "Yêu cầu đã gửi" });
    await expect(history.locator(`a[href='/requests/${row.id}']`)).toBeVisible();
    await expect(history).toContainText(status);
    await page.reload();
    await expect(history).toContainText(status);
  }
  async function admin() {
    await page.goto("/");
    await page.getByRole("link", { name: "Dành cho Admin", exact: true }).click();
    await page.goto(`/review?requestId=${row.id}`);
    await expect(page.locator(".review-draft-option")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /AI soạn/ })).toHaveCount(0);
    await expect(page.getByText("Chọn cách xử lý sau khi đối chiếu yêu cầu.")).toHaveCount(0);
    await expect(page.getByText("Reviewer demo công khai", { exact: false })).toHaveCount(0);
  }
  await returnToGuest("Pending");
  await admin();
  await page.getByRole("button", { name: "Duyệt yêu cầu", exact: true }).click();
  await expect(page.locator(".it-current-status")).toContainText("Nhân viên đã duyệt");
  await returnToGuest("Approved");
  await admin();
  await page.getByRole("button", { name: "Hỏi thêm thông tin", exact: true }).click();
  await expect(page.getByRole("button", { name: "Gửi yêu cầu bổ sung", exact: true })).toBeEnabled();
  const message = await page.getByLabel("Tin nhắn cho người gửi").inputValue();
  expect(message.length).toBeLessThanOrEqual(500);
  expect(message).toContain("mã lỗi hoặc thông báo lỗi");
  await page.getByRole("button", { name: "Gửi yêu cầu bổ sung", exact: true }).click();
  await expect(page.locator(".it-current-status")).toContainText("Cần bạn bổ sung thông tin");
  await returnToGuest("Needs more information");
  await page.locator(`a[href='/requests/${row.id}']`).click();
  await expect(page.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toContainText(message);
  await admin();
  await page.getByLabel("Tin nhắn cho người gửi").fill("Yêu cầu trùng đã được kiểm tra; bạn theo dõi hồ sơ đang xử lý nhé.");
  await page.getByRole("button", { name: "Từ chối", exact: true }).click();
  await expect(page.locator(".it-current-status")).toContainText("Yêu cầu đã bị từ chối");
  await returnToGuest("Rejected");
  const otherTab = await context.newPage();
  await otherTab.goto("/track");
  await expect(otherTab.getByRole("region", { name: "Yêu cầu đã gửi" })).toContainText("Rejected");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await otherTab.close();
});

test("tracking shows a recoverable error instead of a false pending status when offline", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vng-guest-requests-v1", JSON.stringify(["11111111-1111-4111-8111-111111111111"])));
  await page.route("**/api/support/requests/11111111-1111-4111-8111-111111111111", route => route.abort());
  await page.goto("/track");
  const history = page.getByRole("region", { name: "Yêu cầu đã gửi" });
  await expect(history).toContainText("Chưa tải được trạng thái");
  await expect(history).not.toContainText("Pending");
  await expect(history.getByRole("link")).toHaveCount(1);
});

test("another browser has no access to the first browser's saved list", async ({ page, browser }) => {
  await page.goto("/guest");
  await page.evaluate(() => localStorage.setItem("vng-guest-requests-v1", JSON.stringify(["11111111-1111-4111-8111-111111111111"])));
  const independent = await browser.newContext();
  const other = await independent.newPage();
  await other.goto("http://127.0.0.1:3227/guest");
  await expect(other.getByRole("region", { name: "Yêu cầu đã gửi" })).toHaveCount(0);
  await independent.close();
});
