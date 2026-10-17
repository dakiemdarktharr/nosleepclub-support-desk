import { expect, test } from "./fixtures";

test("saved Verify loading locks pack and new run until the requested result arrives", async ({ page, request }) => {
  const response = await request.post("/api/support/verify-runs", { data: { pack: "de-a-v3" } });
  expect(response.ok()).toBe(true);
  const { data: run } = await response.json();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/support/verify-runs/${run.id}`, async (route) => {
    await gate;
    await route.fulfill({ json: { success: true, data: run } });
  });
  await page.goto(`/verify?run=${run.id}`);
  await expect(page.getByRole("status")).toContainText("Đang tải kết quả đã lưu");
  await expect(page.getByRole("progressbar", { name: "Tiến độ kiểm thử" })).not.toHaveAttribute("aria-valuenow");
  await expect(page.getByLabel("Bộ kiểm thử")).toBeDisabled();
  await expect(page.getByRole("button", { name: /Chạy toàn bộ test/ })).toBeDisabled();
  release();
  await expect(page.getByLabel("Bộ kiểm thử")).toBeEnabled();
  await expect(page.getByLabel("Bộ kiểm thử")).toHaveValue("de-a-v3");
  await expect(page.getByRole("button", { name: "Tiếp tục lần kiểm thử" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Liên kết kết quả đã lưu" })).toHaveAttribute("href", `/verify?run=${run.id}`);
});

test("Verify progress follows actual responses, retains partial results on error and resumes with reduced motion", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let releaseFirst!: () => void, releaseSecond!: () => void;
  const first = new Promise<void>(resolve => { releaseFirst = resolve; });
  const second = new Promise<void>(resolve => { releaseSecond = resolve; });
  let calls = 0;
  await page.route("**/api/support/verify-runs/*/cases", async route => {
    calls++;
    if (calls === 1) await first;
    if (calls === 2) {
      await second;
      await route.fulfill({ status: 503, json: { success: false, error: { message: "Lỗi thử nghiệm có kiểm soát" } } });
    } else await route.continue();
  });
  await page.goto("/verify");
  await page.getByRole("button", { name: "Chạy toàn bộ test (5)" }).click();
  const progress = page.getByRole("progressbar", { name: "Tiến độ kiểm thử" });
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await expect(progress).toHaveAttribute("aria-valuemax", "5");
  releaseFirst();
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(progress).toHaveAttribute("aria-valuetext", "1 trên 5 ca đã có kết quả, 20%");
  await expect(progress.locator("span")).toHaveCSS("transition-duration", "0s");
  await expect(progress.locator("span")).toHaveCSS("animation-name", "none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/verify-progress-${info.project.name}.png`, fullPage: true });
  releaseSecond();
  await expect(page.getByRole("button", { name: "Tiếp tục lần kiểm thử" })).toBeEnabled();
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("button", { name: "Tiếp tục lần kiểm thử" }).click();
  await expect(page.getByText("Đã nhận đủ kết quả", { exact: true })).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "5");
  expect(calls).toBe(6);
});
