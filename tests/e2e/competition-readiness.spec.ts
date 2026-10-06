import { expect, freshTest as test } from "./fixtures";
import { employeeIdentity, fillEmployeeIdentity } from "./intake-helpers";

test("judge can enter from home, run De A, inspect audit and try a new input with keyboard", async ({ page }) => {
  await page.goto("/");
  const staff = page.getByRole("link", { name: "Dành cho nhân viên", exact: true });
  await staff.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Đã hiểu", exact: true }).click();
  await expect(page.getByText("Reviewer demo công khai", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Bỏ qua hướng dẫn" }).click();
  const verify = page.getByRole("link", { name: "Kiểm thử", exact: true });
  await verify.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Chạy toàn bộ test (5)", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("5/5 · Pass: 5 · Fail: 0");
  const actual = page.getByRole("table").locator("tbody tr td:nth-child(3)");
  await expect(actual.filter({ hasText: "AUTO_APPROVE" })).toHaveCount(3);
  await expect(actual.filter({ hasText: "ESCALATE" })).toHaveCount(2);
  await page.getByText("Bằng chứng quyết định", { exact: true }).first().click();
  await expect(page.getByText("Nơi tiếp nhận:", { exact: false }).first()).toBeVisible();
  const resultsUrl = page.url();
  await page.getByRole("link", { name: "Mở request / audit" }).last().click();
  await page.getByText("Lịch sử yêu cầu và hướng dẫn", { exact: true }).click();
  await expect(page.locator(".support-timeline")).toBeVisible();
  await expect(page.locator(".support-timeline time").first()).toBeVisible();
  await page.getByText("Rule, evidence và thông tin còn thiếu", { exact: true }).last().click();
  await expect(page.locator(".support-timeline")).toContainText("SEC-002");
  await page.goto(resultsUrl);
  await fillEmployeeIdentity(page);
  await page.getByLabel("Yêu cầu tự do").fill("VPN không kết nối; lý do: kiểm tra mạng thử nghiệm");
  await page.getByRole("button", { name: "Đánh giá input mới" }).click();
  await expect(page.getByRole("link", { name: "Xem hướng dẫn / chuyển admin" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Có thể hỗ trợ an toàn" })).toBeVisible();
});

test("synthetic PII and JSON OTP stay masked in API, audit and rendered history", async ({ page, request }) => {
  const values = ["synthetic.person@example.invalid", "000-000-000-000", "123456", "EMP-SYNTHETIC-99"];
  const response = await request.post("/api/support/requests", { data: {
    ...employeeIdentity, rawText: `VPN lỗi; ${values[0]}; CCCD: ${values[1]}; {"otp":"${values[2]}"}; employee ID: ${values[3]}`,
    confirmed: true, idempotencyKey: crypto.randomUUID(),
  } });
  expect(response.status()).toBe(201);
  const body = await response.text();
  for (const value of values) expect(body).not.toContain(value);
  const { data } = JSON.parse(body);
  const events = await request.get(`/api/support/events?requestId=${data.id}`);
  expect(events.status()).toBe(200);
  const audit = await events.text();
  for (const value of values) expect(audit).not.toContain(value);
  await page.goto(`/requests/${data.id}`);
  await expect(page.getByText("Trạng thái:")).toBeVisible();
  for (const value of values) await expect(page.locator("body")).not.toContainText(value);
  await expect(page.locator("body")).toContainText("REDACTED");
});
