import { test, expect } from "./fixtures";
const id = "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb";
const scope = { environment: "sandbox", resource: "project", operation: "read", target: "project-demo" };
const profile = { id, version: 1, name: "Job giả lập Alpha", scopes: [scope], active: true };
test("home offers two roles and guest access; support opens password-free login and optional tools", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main a")).toHaveCount(3);
  await expect(page.getByLabel("ID nhân viên", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Dành cho nhân viên", exact: true })).toHaveAttribute("href", "/review");
  await page.getByRole("link", { name: "Tôi cần hỗ trợ", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Đăng nhập", exact: true })).toBeVisible();
  await expect(page.getByLabel("ID nhân viên", { exact: true })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Nhân viên mới?" })).toBeVisible();
  await expect(page.getByText("Dùng ID đã được IT cấp", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Truy cập bằng ID là chế độ demo", { exact: false })).toHaveCount(0);
  await page.getByText("Hướng dẫn & tùy chọn", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Theo dõi đơn cấp ID" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("without Mongo the real API reports unavailable and does not create a demo account", async ({ request }) => {
  const login = await request.post("/api/identity/login", { data: { employeeId: "alphanvgl" } }); expect(login.status()).toBe(503);
  expect(login.headers()["set-cookie"]).toBeUndefined();
  const submit = await request.post("/api/identity/applications", { data: { id, trackingToken: "a".repeat(64), fullName: "Nhân Viên Giả Lập Alpha", job: { kind: "new", name: "Job giả lập", scopes: [scope] } } });
  expect(submit.status()).toBe(503); expect((await submit.json()).success).toBe(false);
  expect((await request.get("/api/identity/review", { headers: { "X-Employee-ID": "alphanvgl" } })).status()).toBe(401);
});
test("new employee wizard preserves scope, uses only allowed fields and waits for storage confirmation", async ({ page }) => {
  await page.route("**/api/identity/profiles", (route) => route.fulfill({ json: { success: true, data: [profile] } }));
  await page.goto("/identity/new");
  await page.getByLabel("Họ và tên người cần cấp ID").fill("Nhân Viên Giả Lập Alpha");
  await page.getByLabel("Tên job", { exact: true }).selectOption("new");
  await page.getByLabel("Tên job mới").fill("Job giả lập Beta");
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await page.getByLabel("Phạm vi đích").fill("*"); await page.getByRole("button", { name: "Thêm phạm vi" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("đích cụ thể");
  await page.getByLabel("Phạm vi đích").fill("project-demo"); await page.getByRole("button", { name: "Thêm phạm vi" }).click();
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(page.getByRole("heading", { name: "Kiểm tra trước khi gửi" })).toBeVisible();
  await page.route("**/api/identity/applications", (route) => route.fulfill({ status: 503, json: { success: false, error: { message: "MongoDB không khả dụng. Chưa xác nhận lưu." } } }));
  await page.getByRole("button", { name: "Gửi đơn cho IT" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Chưa xác nhận lưu");
  await expect(page.getByRole("heading", { name: "Đơn đang chờ IT duyệt" })).toHaveCount(0);
  await page.unroute("**/api/identity/applications");
  await page.route("**/api/identity/applications", async (route) => {
    expect(Object.keys(route.request().postDataJSON()).sort()).toEqual(["fullName", "id", "job", "trackingToken"]);
    await route.fulfill({ status: 201, json: { success: true, data: { id, status: "PENDING" } } });
  });
  await page.getByRole("button", { name: "Gửi đơn cho IT" }).click();
  await expect(page.getByRole("heading", { name: "Đơn đang chờ IT duyệt" })).toBeVisible();
  await expect(page.getByLabel("Liên kết theo dõi riêng")).toHaveValue(/\/identity\/track#id=.+&token=[a-f0-9]{64}/);
  await expect(page.getByText("ID chính thức của bạn")).toHaveCount(0);
});
test("existing job shows fixed scope; tracking reveals issued ID only after approval", async ({ page }) => {
  await page.route("**/api/identity/profiles", (route) => route.fulfill({ json: { success: true, data: [profile] } }));
  await page.goto("/identity/new"); await page.getByLabel("Họ và tên người cần cấp ID").fill("Nhân Viên Giả Lập Alpha");
  await page.getByLabel("Tên job", { exact: true }).selectOption(`${id}:1`); await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(page.getByText("project-demo", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Thêm phạm vi" })).toHaveCount(0);
  await page.route("**/api/identity/applications/*", (route) => route.fulfill({ json: { success: true, data: { fullName: "Nhân Viên Giả Lập Alpha", jobName: "Job giả lập", status: "APPROVED", employeeId: "alphanvgl", scopes: [scope], grantedScopes: [scope], reason: "Đã kiểm tra dữ liệu giả lập" } } }));
  await page.goto(`/identity/track#id=${id}&token=${"a".repeat(64)}`);
  await expect(page.getByText("alphanvgl", { exact: true })).toBeVisible(); await expect(page.getByRole("link", { name: "Đăng nhập bằng ID" })).toBeVisible();
});
test("IT controls require verified server authority; guide remains reachable on mobile", async ({ page }) => {
  await page.goto("/identity/review"); await expect(page.getByRole("main").getByRole("alert")).toContainText("Đăng nhập");
  await expect(page.getByRole("button", { name: "Duyệt và cấp ID" })).toHaveCount(0);
  await page.goto("/help"); await expect(page.getByRole("heading", { name: "Bắt đầu từ việc bạn cần làm" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Verify / Kiểm thử" })).toHaveAttribute("href", "/verify");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("IT approves only selected scopes and receives an explicit success result", async ({ page }) => {
  let approved = false;
  const sensitive = { ...scope, environment: "production" };
  const row = { id, fullName: "Nhân Viên Giả Lập Alpha", status: "PENDING", version: 0, job: { kind: "new", name: "Job giả lập" }, profile: null, requestedScopes: [scope, sensitive], createdAt: "2026-10-01T00:00:00.000Z" };
  await page.route("**/api/identity/review?*", (route) => route.fulfill({ json: { success: true, data: { items: approved ? [] : [row], hasMore: false } } }));
  await page.route("**/api/identity/audit?*", (route) => route.fulfill({ json: { success: true, data: { items: [], hasMore: false } } }));
  await page.route(`**/api/identity/review/${id}`, async (route) => {
    const payload = route.request().postDataJSON(); expect(payload.version).toBe(0); expect(payload.action).toBe("approve"); expect(payload.approvedScopes).toEqual([scope]);
    approved = true; await route.fulfill({ json: { success: true, data: { id, employeeId: "alphanvgl", status: "APPROVED" } } });
  });
  await page.goto("/identity/review");
  await page.getByRole("checkbox").nth(1).uncheck();
  await page.getByLabel("Lý do quyết định (hiển thị cho người gửi)").fill("Đã xác minh hồ sơ giả lập; chỉ duyệt phạm vi sandbox");
  await page.getByRole("button", { name: "Duyệt và cấp ID", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã cấp ID alphanvgl" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Duyệt và cấp ID", exact: true })).toHaveCount(0);
});
