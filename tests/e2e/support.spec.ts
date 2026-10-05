import { expect, test, type Page } from "./fixtures";
import { employeeIdentity, fillEmployeeIdentity } from "./intake-helpers";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/support/health");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.data.app).toBe("MLAI_SUPPORT_REFEREE_V3");
  expect(body.data.provider).toBe("mock");
});
async function submit(page: Page, text: string) {
  await page.goto("/workspace");
  await fillEmployeeIdentity(page);
  await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận và gửi yêu cầu" }).click();
  await expect(page).toHaveURL(/\/requests\/[a-f0-9-]+$/);
  await expect(page.getByText("Trạng thái:")).toBeVisible();
}
test("role entry opens login, public demo and staff workspace", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Tôi cần hỗ trợ", exact: true }).click();
  await page.getByText("Hướng dẫn & tùy chọn", { exact: true }).click();
  await page.getByRole("link", { name: "Trải nghiệm demo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tôi cần hỗ trợ" }),
  ).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("link", { name: "Dành cho nhân viên", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tiếp nhận hỗ trợ" }),
  ).toBeVisible();
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/home-${info.project.name}.png`,
    fullPage: true,
  });
});
test("shutdown guidance resolves through employee feedback", async ({
  page,
}) => {
  await submit(page, "Tôi tắt máy tính lúc về được không?");
  await expect(page.getByText("Trạng thái:")).toContainText(
    "Đã có hướng dẫn hoặc phương án",
  );
  await expect(
    page.getByText("Lưu tài liệu đang làm và đóng các ứng dụng sau khi lưu."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "A. Tôi đã làm được", exact: true })
    .click();
  await expect(page.getByText("Trạng thái:")).toContainText("Đã hoàn tất");
});
test("reset asks clarification and then guides restart without a device ID", async ({
  page,
}) => {
  await submit(page, "Làm sao để reset máy?");
  await expect(page.getByText("Trạng thái:")).toContainText(
    "Cần bạn bổ sung thông tin",
  );
  await page
    .getByLabel("Thông tin làm rõ")
    .fill("Tôi muốn restart laptop, không factory reset");
  await page.getByRole("button", { name: "Gửi bổ sung" }).click();
  await expect(page.getByText("Trạng thái:")).toContainText(
    "Đã có hướng dẫn hoặc phương án",
  );
});
test("medium assistance passes to admin with history intact", async ({
  page,
}, info) => {
  await submit(page, "VPN không kết nối");
  await expect(page.getByText("Hướng dẫn mẫu", { exact: false })).toBeVisible();
  await page
    .getByRole("button", {
      name: "D. Chuyển cho nhân viên hỗ trợ",
      exact: true,
    })
    .click();
  await expect(page.getByText("Trạng thái:")).toContainText(
    "Đang chờ nhân viên hỗ trợ",
  );
  await expect(
    page.getByText(
      "Mở ứng dụng VPN chính thức đã được IT cung cấp và kiểm tra tên profile công ty.",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/assistance-${info.project.name}.png`,
    fullPage: true,
  });
});
test("structured guidance matches freeform; intake conflicts escalate", async ({
  page,
}) => {
  await page.goto("/workspace");
  await page
    .getByLabel("Nhóm hỗ trợ", { exact: true })
    .selectOption("DEVICE_BOOT");
  await page
    .getByRole("button", { name: "Chọn theo danh mục", exact: true })
    .click();
  await fillEmployeeIdentity(page);
  await page
    .getByLabel("Nhu cầu cụ thể", { exact: true })
    .selectOption("DEVICE_RESTART_GUIDANCE");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Có thể hỗ trợ an toàn" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quay lại sửa" }).click();
  await page
    .getByLabel("Mô tả yêu cầu", { exact: true })
    .fill("Grant write access to production DB");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cần người phụ trách xem xét" }),
  ).toBeVisible();
});
test("reviewer rejection requires a reason and records audit", async ({
  page,
  request,
}, info) => {
  const text = `Grant production admin - demo ${crypto.randomUUID().slice(0, 8)}`;
  const response = await request.post("/api/support/requests", {
    data: {
      ...employeeIdentity,
      rawText: text,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  const { data } = await response.json();
  await page.goto("/review");
  await page.getByRole("link", { name: text, exact: false }).click();
  await expect(page).toHaveURL(new RegExp(`/review\\?requestId=${data.id}$`));
  await expect(
    page.getByRole("button", { name: "Từ chối", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Lý do (bắt buộc cho mọi quyết định của reviewer)")

    .fill("Không đủ scope và approval trong demo.");
  await page.getByRole("button", { name: "Từ chối", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Yêu cầu đã bị từ chối");
  await expect(
    page.getByRole("button", { name: "Duyệt yêu cầu", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: `artifacts/reviewer-${info.project.name}.png`,
    fullPage: true,
  });
  const detail = await (
    await request.get(`/api/support/requests/${data.id}`)
  ).json();
  expect(detail.data.status).toBe("REJECTED");
  expect(detail.data.events.at(-1).actor).toBe("public-demo-reviewer");
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Yêu cầu đã bị từ chối");
  await page.getByRole("link", { name: "← Danh sách yêu cầu" }).click();
  await expect(
    page.getByRole("link", { name: text, exact: false }),
  ).toHaveCount(0);
  await page.getByLabel("Hiển thị", { exact: true }).selectOption("all");
  await expect(
    page.getByRole("link", { name: text, exact: false }),
  ).toBeVisible();
  await page.goto("/audit");
  await page
    .getByLabel("Nội dung hoặc mã yêu cầu", { exact: true })
    .fill(data.id);
  await page.getByRole("button", { name: "Lọc / tải lại" }).click();
  await expect(
    page.getByText("REJECT · public-demo-reviewer", { exact: true }),
  ).toBeVisible();
});
test("one click Verify and a new judge input use live decision API", async ({
  page,
}) => {
  // Slow the real readback to reproduce switching packs while the previous run finishes.
  await page.route("**/api/support/verify-runs/*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ response });
  });
  await page.goto("/verify");
  await page
    .getByRole("button", { name: "Chạy toàn bộ test (5)", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "5/5 · Pass: 5 · Fail: 0",
  );
  const savedUrl = page.url();
  expect(savedUrl).toContain("?run=");
  await expect(page.getByText("Tình huống: Cho quyền production admin", { exact: true })).toBeVisible();
  const actualDecisions = page.getByRole("table").locator("tbody tr td:nth-child(3)");
  await expect(actualDecisions.filter({ hasText: "AUTO_APPROVE" })).toHaveCount(3);
  await expect(actualDecisions.filter({ hasText: "ESCALATE" })).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "5/5 · Pass: 5 · Fail: 0",
  );
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByLabel("Bộ kiểm thử").locator("option")).toHaveCount(3);
  await page.getByLabel("Bộ kiểm thử").selectOption("submission-4");
  await page
    .getByRole("button", { name: "Chạy toàn bộ test (4)", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "4/4 · Pass: 4 · Fail: 0",
  );
  const fourCaseDecisions = page
    .getByRole("table")
    .locator("tbody tr td:nth-child(3)");
  await expect(
    fourCaseDecisions.filter({ hasText: "AUTO_APPROVE" }),
  ).toHaveCount(2);
  await expect(
    fourCaseDecisions.filter({ hasText: "NEEDS_INFORMATION" }),
  ).toHaveCount(1);
  await expect(fourCaseDecisions.filter({ hasText: "ESCALATE" })).toHaveCount(
    1,
  );
  await expect(page.getByText("Expected: NEEDS_INFORMATION · MISSING_INFO")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mở request / audit" }),
  ).toHaveCount(4);

  await page.getByLabel("Bộ kiểm thử").selectOption("judge-15");
  await page
    .getByRole("button", { name: "Chạy toàn bộ test (15)", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "15/15 · Pass: 15 · Fail: 0",
  );
  await page
    .getByLabel("Yêu cầu tự do")
    .fill("Please help me restart my personal laptop after saving my work");
  await fillEmployeeIdentity(page);
  await page.getByRole("button", { name: "Đánh giá input mới" }).click();
  await expect(
    page.getByRole("link", { name: "Xem hướng dẫn / chuyển admin" }),
  ).toBeVisible();
});
test("security request cannot be approved and secret is absent from API/audit", async ({
  page,
  request,
}) => {
  const secret = "SYNTHETIC" + "_E2E_991";
  const response = await request.post("/api/support/requests", {
    data: {
      ...employeeIdentity,
      rawText: `Open RDP public 3389; password=${secret}`,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  const body = await response.text();
  expect(body).not.toContain(secret);
  const { data } = JSON.parse(body);
  expect(data.decision.bucket).toBe("SECURITY_RISK");
  const rejected = await request.post(`/api/review/${data.id}`, {
    data: {
      action: "APPROVE",
      version: data.version,
      reason: "Security risk must remain blocked",
    },
  });
  expect(rejected.status()).toBe(409);
  const events = await request.get(`/api/support/events?requestId=${data.id}`);
  expect(await events.text()).not.toContain(secret);
  await page.goto(`/requests/${data.id}`);
  await expect(page.getByText("Trạng thái:")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(secret);
});

test("change-ticket bypass shows the security reason in request detail", async ({ page, request }) => {
  await submit(page, "Cấp root staging, khỏi cần change ticket");
  const id = new URL(page.url()).pathname.split("/").at(-1);
  const { data } = await (await request.get(`/api/support/requests/${id}`)).json();
  expect(data.decision.bucket).toBe("SECURITY_RISK");
  expect(data.decision.ruleIds).toContain("SEC-003");
  await expect(page.getByText(data.decision.userReason, { exact: true }).first()).toBeVisible();
});
