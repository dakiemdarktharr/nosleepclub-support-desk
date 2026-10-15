import { expect, test } from "./fixtures";

test("sender sees safe guidance and progress; staff retains sentiment, expected results and full audit", async ({
  page,
}, info) => {
  await page.goto("/guest");
  await page
    .getByLabel("Mô tả yêu cầu", { exact: true })
    .fill("Máy in văn phòng báo kẹt giấy. Tôi nên kiểm tra gì trước?");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("Không cố kéo giấy");
  await expect(page.locator("main")).not.toContainText("Kết quả mong đợi:");
  await expect(page.locator("main")).not.toContainText("Sentiment");
  await page.screenshot({
    animations: "disabled",
    path: `artifacts/polish-preview-${info.project.name}.png`,
    fullPage: true,
  });
  const savedResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/support/requests") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Xác nhận và gửi yêu cầu", exact: true })
    .click();
  const saved = (await (await savedResponse).json()).data;
  expect(saved.intakeSentiment).toMatchObject({
    source: "rule-based",
    sentiment: "neutral",
  });
  await expect(page).toHaveURL(new RegExp(`/requests/${saved.id}$`));
  // Understanding a physical fix must not silently complete a device issue.
  await expect(
    page.getByRole("button", { name: "Tôi đã hiểu", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "D. Chuyển cho nhân viên hỗ trợ",
      exact: true,
    })
    .click();
  await expect(page.getByText("Trạng thái:")).toContainText(
    "Đang chờ nhân viên hỗ trợ",
  );
  await page.getByText("Lịch sử yêu cầu và hướng dẫn", { exact: true }).click();
  const progress = page.getByRole("list", { name: "Tiến trình hỗ trợ" });
  await expect(progress).toContainText("Đã chuyển nhân viên hỗ trợ");
  const markup = await page.locator("main").innerHTML();
  for (const diagnostic of [
    "GUIDE-007",
    "deterministic-policy",
    "sentiment neutral",
    "Rule, evidence",
    "safeEvidence",
    "Kết quả mong đợi:",
  ])
    expect(markup).not.toContain(diagnostic);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    animations: "disabled",
    path: `artifacts/polish-sender-history-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto(`/review?requestId=${saved.id}`);
  await expect(
    page.getByRole("region", { name: "Phân tích cảm xúc nội bộ" }),
  ).toContainText("Trung tính");
  await expect(
    page.getByRole("region", { name: "Phân tích cảm xúc nội bộ" }),
  ).toContainText("Dự phòng theo luật");
  await page
    .getByRole("tab", { name: "Hướng dẫn đã gửi", exact: true })
    .click();
  await expect(
    page.getByRole("tabpanel", { name: "Hướng dẫn đã gửi" }),
  ).toContainText("Kết quả mong đợi:");
  await page.getByRole("tab", { name: /^Lịch sử xử lý/ }).click();
  await expect(page.locator(".support-timeline")).toContainText("HANDOFF");
  await expect(page.locator(".support-timeline")).toContainText("GUIDE-007");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    animations: "disabled",
    path: `artifacts/polish-staff-history-${info.project.name}.png`,
    fullPage: true,
  });
});

test("legacy requests remain readable without inventing an intake sentiment", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/support/requests", {
    data: {
      requesterMode: "guest",
      rawText: "VPN không kết nối",
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  await page.route(`**/api/support/requests/${data.id}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    delete body.data.intakeSentiment;
    await route.fulfill({ response, json: body });
  });
  await page.goto(`/review?requestId=${data.id}`);
  await expect(
    page.getByRole("region", { name: "Chẩn đoán nội bộ" }),
  ).toContainText("chưa lưu phân tích cảm xúc");
});
