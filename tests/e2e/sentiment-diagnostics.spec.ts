import { expect, test } from "./fixtures";

test("preview explains model authentication fallback and keeps the request editable", async ({ page }) => {
  // UI-only response override; the real mock API still produces the preview.
  await page.route("**/api/support/preview", async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.sentiment = { ...body.data.sentiment, source: "rule-based", model: "gpt-6-luna", fallbackReason: "AUTHENTICATION" };
    await route.fulfill({ response, json: body });
  });
  await page.goto("/guest");
  await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill("VPN không kết nối");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  const assessment = page.getByRole("region", { name: "Sentiment nhận diện trước khi gửi" });
  await expect(assessment).toContainText("Dự phòng theo luật");
  await expect(assessment).toContainText("API model từ chối xác thực (401)");
  await expect(assessment).toContainText("Model đã cấu hình: gpt-6-luna");
  await expect(page.getByRole("button", { name: "Xác nhận và gửi yêu cầu", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Quay lại sửa", exact: true })).toBeEnabled();
});
