import { expect, test } from "./fixtures";
import { employeeIdentity, fillEmployeeIdentity } from "./intake-helpers";

test("welcome and intake omit the five distracting screenshot captions", async ({ page }) => {
  await page.goto("/");
  for (const text of ["MỖI VẤN ĐỀ · MỘT BƯỚC TIẾP THEO", "Kể cho chúng tôi điều bạn đang gặp.", "Bắt đầu: chọn", "Luôn có một cách để bắt đầu."])
    await expect(page.getByText(text, { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Tôi cần hỗ trợ", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dành cho nhân viên", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Tôi cần hỗ trợ", exact: true }).click();
  await expect(page.getByText("HỖ TRỢ KỸ THUẬT", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tôi cần hỗ trợ", exact: true })).toBeVisible();
});

test("reselecting a mode preserves input; blank input has an actionable error", async ({ page }) => {
  await page.goto("/send-help");
  await page.getByRole("button", { name: "Chọn theo danh mục", exact: true }).click();
  await fillEmployeeIdentity(page);
  await page.getByLabel("Nhóm hỗ trợ", { exact: true }).selectOption("DEVICE_BOOT");
  await expect(page.getByLabel("Phòng ban", { exact: true })).toHaveValue("engineering");
  await expect(page.getByLabel("Mã nhân viên", { exact: true })).toHaveValue("EMP-E2E-001");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Nhập mô tả yêu cầu hoặc chọn một nhu cầu cụ thể");
  await page.getByLabel("Nhu cầu cụ thể", { exact: true }).selectOption("DEVICE_RESTART_GUIDANCE");
  await expect(page.getByLabel("Phòng ban", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Mã nhân viên", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Mã nhân viên", { exact: true })).toHaveValue("EMP-E2E-001");
  await page.getByRole("button", { name: "Chọn theo danh mục", exact: true }).click();
  await expect(page.getByLabel("Nhu cầu cụ thể", { exact: true })).toHaveValue("DEVICE_RESTART_GUIDANCE");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await page.getByRole("button", { name: "Quay lại sửa", exact: true }).click();
  await expect(page.getByLabel("Nhu cầu cụ thể", { exact: true })).toHaveValue("DEVICE_RESTART_GUIDANCE");
  await page.getByRole("button", { name: "Mô tả vấn đề", exact: true }).click();
  await expect(page.getByLabel("Phòng ban", { exact: true })).toHaveValue("engineering");
  await expect(page.getByLabel("Mã nhân viên", { exact: true })).toHaveValue("emp-e2e-001");
  await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Nhập mô tả yêu cầu");
});

for (const mode of ["Mô tả vấn đề", "Chọn theo danh mục"]) {
  test(`requires department and employee code from ${mode}`, async ({ page }) => {
    await page.goto("/send-help");
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill("VPN không kết nối");
    const department = page.getByLabel("Phòng ban", { exact: true });
    const employeeId = page.getByLabel("Mã nhân viên", { exact: true });
    await expect(employeeId).toHaveAttribute("required", "");
    let posts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/api\/support\/(preview|requests)$/.test(request.url())) posts++;
    });
    for (const [dept, id] of [["", ""], ["", "EMP-E2E-001"]]) {
      await department.selectOption(dept);
      await employeeId.fill(id);
      await page.getByRole("button", { name: "Gửi", exact: true }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("Chọn phòng ban trước khi gửi yêu cầu");
      await expect(page.getByRole("region", { name: "Kiểm tra dữ kiện" })).toHaveCount(0);
      expect(posts).toBe(0);
    }
    await department.selectOption("engineering");
    await employeeId.fill("");
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Nhập mã nhân viên");
    expect(posts).toBe(0);
    await employeeId.fill("EMP-E2E-001");
    const previewResponse = page.waitForResponse((response) => response.url().endsWith("/api/support/preview"));
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    expect((await previewResponse).status()).toBe(200);
    const savedResponse = page.waitForResponse((response) => response.url().endsWith("/api/support/requests") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Xác nhận và gửi yêu cầu" }).click();
    const saved = await savedResponse;
    expect(saved.status()).toBe(201);
    expect((await saved.json()).data.input.fields).toMatchObject({ department: "engineering", employeeId: "emp-e2e-001" });
    await expect(page).toHaveURL(/\/requests\/[a-f0-9-]+$/);
  });
}

test("tracking accepts uppercase UUIDs and pasted links with a trailing slash", async ({ page, request }) => {
  const response = await request.post("/api/support/requests", { data: { ...employeeIdentity, rawText: "Tôi tắt máy tính lúc về được không?", confirmed: true, idempotencyKey: crypto.randomUUID() } });
  expect(response.ok()).toBe(true);
  const { data: row } = await response.json();
  for (const value of [row.id.toUpperCase(), `http://127.0.0.1:3227/requests/${row.id.toUpperCase()}/?from=share`]) {
    await page.goto("/track");
    await page.getByLabel("Liên kết hoặc mã yêu cầu").fill("invalid");
    await page.getByRole("button", { name: "Theo dõi", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await page.getByLabel("Liên kết hoặc mã yêu cầu").fill(value);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Theo dõi", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/requests/${row.id}$`));
    await expect(page.getByRole("heading", { name: "Vấn đề bạn đã gửi" })).toBeVisible();
  }
});

test("employee sees the reviewer clarification without expanding the audit log", async ({ page, request }) => {
  const response = await request.post("/api/support/requests", { data: { ...employeeIdentity, rawText: "Tôi tắt máy tính lúc về được không?", confirmed: true, idempotencyKey: crypto.randomUUID() } });
  const { data: row } = await response.json();
  const reason = "Bạn đã lưu công việc và chờ cập nhật hoàn tất chưa?";
  const review = await request.post(`/api/review/${row.id}`, { data: { version: row.version, action: "REQUEST_INFORMATION", reason } });
  expect(review.ok()).toBe(true);
  await page.goto(`/requests/${row.id}`);
  await expect(page.getByRole("heading", { name: "Phản hồi của nhân viên" })).toBeVisible();
  await expect(page.getByText(reason, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bổ sung thông tin" })).toBeVisible();
});
