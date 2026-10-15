import { expect, test } from "./fixtures";

test("provider diagnostics stay out of sender preview without blocking edit or submit", async ({
  page,
}) => {
  // UI-only injection proves raw diagnostic values cannot leak through the presentation.
  await page.route("**/api/support/preview", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.sentiment = {
      ...body.data.sentiment,
      source: "rule-based",
      model: "gpt-6-luna",
      fallbackReason: "AUTHENTICATION",
    };
    body.data.assistance.fallbackReason = "MODEL_EVIDENCE_INVALID";
    await route.fulfill({ response, json: body });
  });
  await page.goto("/guest");
  await page
    .getByLabel("Mô tả yêu cầu", { exact: true })
    .fill("VPN không kết nối");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Câu trả lời của trợ lý" }),
  ).toContainText("hướng dẫn đã kiểm duyệt");
  const markup = await page.locator("main").innerHTML();
  for (const diagnostic of [
    "Sentiment",
    "gpt-6-luna",
    "AUTHENTICATION",
    "MODEL_EVIDENCE_INVALID",
    "Kết quả mong đợi",
    "Mã lý do:",
  ]) {
    expect(markup).not.toContain(diagnostic);
  }
  await expect(
    page.getByRole("button", { name: "Xác nhận và gửi yêu cầu", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Quay lại sửa", exact: true }).click();
  await expect(page.getByLabel("Mô tả yêu cầu", { exact: true })).toHaveValue(
    "VPN không kết nối",
  );
});
