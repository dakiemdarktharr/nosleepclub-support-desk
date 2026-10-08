import { freshTest as test, expect } from "./fixtures";

test("fresh guest enters by keyboard, submits without employee identity and can track the request", async ({ page, context }, info) => {
  await context.addCookies([{ name: "vng_identity", value: "a".repeat(64), domain: "127.0.0.1", path: "/" }]);
  const identityCalls: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/identity/")) identityCalls.push(request.url()); });
  await page.goto("/");
  await page.getByRole("link", { name: "Đăng nhập không cần tài khoản", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/guest$/);
  await expect(page.getByLabel("Mã nhân viên", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Phòng ban", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Dành cho nhân viên", exact: true })).toHaveCount(0);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "Chọn theo danh mục", exact: true }).click();
  await page.getByRole("button", { name: "Mô tả vấn đề", exact: true }).click();
  await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill("VPN không kết nối");
  const preview = page.waitForResponse(r => r.url().endsWith("/api/support/preview"));
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  const response = await preview;
  expect(response.status()).toBe(200);
  expect((await response.json()).data.decision.action).toBe("AUTO_APPROVE");
  const saved = page.waitForResponse(r => r.url().endsWith("/api/support/requests") && r.request().method() === "POST");
  await page.locator('[data-guide="sender-confirm"]').click();
  const row = (await (await saved).json()).data;
  expect(row.input.requesterMode).toBe("guest");
  expect(row.input.fields.employeeId).toBeUndefined();
  await expect(page).toHaveURL(new RegExp("/requests/" + row.id + "$"));
  await expect(page.getByRole("button", { name: "Sao chép liên kết theo dõi" })).toBeVisible();
  expect(identityCalls).toEqual([]);
  await page.getByRole("link", { name: "Gửi yêu cầu", exact: true }).click();
  await expect(page).toHaveURL(/\/guest$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/guest-${info.project.name}.png`, fullPage: true });
});

test("login unavailable offers a direct guest exit; sensitive requests still escalate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("ID nhân viên", { exact: true }).fill("alphanvgl");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("Đăng nhập nhân viên và cấp ID chưa sẵn sàng.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Đăng nhập không cần tài khoản", exact: true }).click();
  await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill("Tắt MFA để đăng nhập");
  const response = page.waitForResponse(r => r.url().endsWith("/api/support/preview"));
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  expect((await (await response).json()).data.decision.action).toBe("ESCALATE");
});
