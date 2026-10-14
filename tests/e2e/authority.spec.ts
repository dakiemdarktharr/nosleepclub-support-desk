import { test, expect } from "./fixtures";

test("sender must explicitly apply duration then regenerate preview, without auto approval", async ({ page }) => {
  await page.goto("/guest");
  await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill("Xin read-only repo demo/docs trên GitHub để kiểm tra hướng dẫn thử nghiệm.");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  const proposal = page.getByRole("group", { name: "Thời hạn đề xuất" });
  await expect(proposal).toContainText("8 giờ");
  await proposal.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(proposal).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Xác nhận và gửi yêu cầu", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByRole("group", { name: "Thời hạn đề xuất" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Cần người phụ trách xem xét" })).toBeVisible();
});
test("authority API requires a session and cannot accept headers as an owner role", async ({ request }) => {
  expect((await request.get("/api/identity/authority", { headers: { "X-Employee-ID": "demoit" } })).status()).toBe(401);
  const response = await request.post("/api/identity/authority/decision", { data: { actor: "demoit", action: "approve" } });
  expect(response.status()).toBe(401);
});
test("authority UI labels demo, shows Mongo failure without a success receipt and fits mobile", async ({ page }) => {
  const zero = { cpu: 0, ramGb: 0, diskGb: 0, gpuT4: 0 };
  await page.route("**/api/identity/authority", (route) => route.fulfill({ json: { success: true, data: {
    pool: { id: "DEMO-SANDBOX", version: 0, assurance: "demo", ownerIds: ["demoit"], limits: { cpu: 16, ramGb: 64, diskGb: 500, gpuT4: 4 }, used: zero, reserved: zero, maxHours: 24, budget: "unconfigured", observedAt: "2026-10-14T00:00:00.000Z", validUntil: "2026-10-14T01:00:00.000Z" }, grants: [], canManage: false, assurance: "demo",
  } } }));
  await page.route("**/api/identity/authority/request", (route) => route.fulfill({ status: 503, json: { success: false, error: { message: "MongoDB không khả dụng. Chưa lưu đơn." } } }));
  await page.goto("/identity/authority");
  await expect(page.getByRole("heading", { name: "DEMO-SANDBOX", exact: true })).toBeVisible();
  await expect(page.getByText("Đăng nhập ID-only chưa xác minh người sử dụng.", { exact: false })).toBeVisible();
  await page.getByLabel("Thời hạn (giờ, tối đa 24)").fill("4");
  await page.getByLabel("Lý do", { exact: true }).fill("Thử nghiệm dữ liệu giả lập");
  await page.getByRole("button", { name: "Gửi đơn quyền demo" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Chưa lưu đơn" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu" })).toHaveCount(0);
  await expect(page.getByLabel("Lý do", { exact: true })).toHaveValue("Thử nghiệm dữ liệu giả lập");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
