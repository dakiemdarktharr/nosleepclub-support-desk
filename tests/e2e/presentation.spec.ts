import { expect, test } from "./fixtures";
import { fillEmployeeIdentity } from "./intake-helpers";

test("welcome uses native cursor, clear entry buttons and reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".entry-links a")).toHaveCount(2);
  await expect(page.locator(".site-header")).toBeVisible();
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.locator(".welcome-art img")).toBeVisible();
  await expect(page.locator(".navi-cursor")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "URL / QR", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(".brand")).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".entry-primary")).toHaveCSS(
    "transition-duration",
    "0s",
  );
});

test("old help route and workspace alias share preview, edit and v3 submit", async ({
  page,
}, info) => {
  for (const route of ["/workspace", "/send-help"]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: "Tôi cần hỗ trợ" }),
    ).toBeVisible();
    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.locator("form select")).toHaveCount(2);
    await expect(page.locator("form textarea")).toHaveCount(1);
  }
  const description = page.getByLabel("Mô tả yêu cầu", { exact: true });
  await fillEmployeeIdentity(page);
  await description.fill("Tôi tắt máy tính lúc về được không?");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(description).toBeDisabled();
  await page.getByRole("button", { name: "Quay lại sửa" }).click();
  await expect(description).toHaveValue("Tôi tắt máy tính lúc về được không?");
  await description.fill("VPN không kết nối");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  const sentiment = page.getByRole("region", {
    name: "Sentiment nhận diện trước khi gửi",
  });
  await expect(sentiment).toContainText("Trung tính");
  await expect(sentiment).toContainText("Dự phòng theo luật (rule-based)");
  await expect(sentiment).toContainText(
    "Câu mô tả sự cố hoặc yêu cầu, chưa có dấu hiệu cảm xúc rõ ràng.",
  );
  await expect(
    page.getByText("Cách hỗ trợ: Hướng dẫn từng bước", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/help-preview-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Xác nhận và gửi yêu cầu" }).click();
  await expect(page).toHaveURL(/\/requests\/[a-f0-9-]+$/);
  await expect(
    page.getByRole("button", { name: "D. Chuyển cho nhân viên hỗ trợ" }),
  ).toBeVisible();
  await expect(page.getByText("Trạng thái:")).toContainText(
    "Đã có hướng dẫn hoặc phương án",
  );
});

test("explain stays open, handoff is explicit and rejected request shows current status", async ({
  page,
  request,
}) => {
  await page.goto("/send-help");
  await fillEmployeeIdentity(page);
  await page
    .getByLabel("Mô tả yêu cầu", { exact: true })
    .fill("VPN không kết nối");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByText("CHƯA GỬI YÊU CẦU")).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận và gửi yêu cầu" }).click();
  await expect(page).toHaveURL(/\/requests\/[a-f0-9-]+$/);
  await page.getByLabel("Bước cần giải thích").selectOption("1");
  await page.getByRole("button", { name: "C. Giải thích bước này" }).click();
  await expect(
    page.getByRole("heading", { name: "Giải thích bước 2" }),
  ).toBeVisible();
  await expect(page.getByText("Trạng thái:")).toContainText("Đã có hướng dẫn");
  await page
    .getByRole("button", { name: "D. Chuyển cho nhân viên hỗ trợ" })
    .click();
  await expect(page.getByText("Trạng thái:")).toContainText(
    "Đang chờ nhân viên hỗ trợ",
  );
  const id = page.url().split("/").at(-1)!;
  const row = (await (await request.get(`/api/support/requests/${id}`)).json())
    .data;
  await request.post(`/api/review/${id}`, {
    data: {
      action: "REJECT",
      version: row.version,
      reason: "Synthetic reviewer feedback",
    },
  });
  await page.reload();
  await expect(page.getByText("Trạng thái:")).toContainText(
    "Yêu cầu đã bị từ chối",
  );
  await expect(
    page.getByText(
      "Nhân viên hỗ trợ sẽ xem xét yêu cầu. Dùng liên kết này để theo dõi cập nhật.",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Vấn đề bạn đã gửi" }),
  ).toBeVisible();
});
