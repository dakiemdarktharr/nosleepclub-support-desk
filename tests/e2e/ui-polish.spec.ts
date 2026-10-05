import { expect, test } from "./fixtures";

test("role entry and compact login stay reachable by keyboard and browser back", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.locator("main a")).toHaveCount(2);
  await expect(page.locator("main form")).toHaveCount(0);
  await expect(page.getByText("Dùng thử các luồng hỗ trợ", { exact: false })).toHaveCount(0);
  await page.screenshot({ animations: "disabled", path: `artifacts/ui-entry-${info.project.name}.png`, fullPage: true });
  const entry = page.getByRole("link", { name: "Tôi cần hỗ trợ", exact: true });
  await entry.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("ID nhân viên", { exact: true })).toBeVisible();
  await page.screenshot({ animations: "disabled", path: `artifacts/ui-login-${info.project.name}.png`, fullPage: true });
  await page.getByText("Hướng dẫn & tùy chọn", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Theo dõi đơn cấp ID" })).toBeVisible();
  await page.getByRole("link", { name: "Nhân viên mới?" }).click();
  await expect(page).toHaveURL(/\/identity\/new$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Màn hình chính", exact: true }).click();
  await expect(page.locator("main a")).toHaveCount(2);
});

test("native dropdown supports keyboard selection, Escape and retained form input", async ({ page }, info) => {
  await page.goto("/send-help");
  const description = page.getByLabel("Mô tả yêu cầu", { exact: true });
  await description.fill("Nội dung kiểm tra giao diện giả lập");
  const department = page.getByLabel("Phòng ban", { exact: true });
  await department.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(department).not.toHaveValue("");
  const selected = await department.inputValue();
  await department.click();
  if (await page.evaluate(() => CSS.supports("appearance", "base-select"))) {
    await expect.poll(() => department.evaluate(element => getComputedStyle(element, "::picker(select)").opacity)).toBe("1");
  }
  await page.screenshot({ path: `artifacts/ui-dropdown-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(department).toBeFocused();
  await expect(department).toHaveValue(selected);
  await expect(description).toHaveValue("Nội dung kiểm tra giao diện giả lập");
});

test("reduced motion disables route transitions without delaying navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "Tôi cần hỗ trợ", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.locator(".route-surface").evaluate(element => element.getAnimations().length)).toBe(0);
  await expect(page.locator(".identity-form")).toHaveCSS("animation-name", "none");
  await page.getByRole("link", { name: "Màn hình chính", exact: true }).click();
  await expect(page.locator(".entry-primary")).toHaveCSS("transition-duration", "0s");
});
