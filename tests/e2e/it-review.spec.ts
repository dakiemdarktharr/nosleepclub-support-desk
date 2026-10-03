import { test, expect } from "./fixtures";
import { employeeIdentity } from "./intake-helpers";

test("redesigned workspace preserves the knowledge-review filter and candidate evidence", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/support/requests", {
    data: {
      ...employeeIdentity,
      rawText: "Tôi tắt máy tính lúc về được không?",
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(response.ok()).toBe(true);
  const { data: row } = await response.json();
  const feedback = await request.post(
    `/api/support/requests/${row.id}/feedback`,
    {
      data: {
        version: row.version,
        choice: "RESOLVED",
        replyText: "Cảm ơn, đã làm được",
      },
    },
  );
  expect(feedback.ok()).toBe(true);
  await page.goto("/review");
  await page.getByLabel("Hiển thị", { exact: true }).selectOption("knowledge");
  const match = page.locator(
    `.review-list a[href='/review?requestId=${row.id}']`,
  );
  await expect(match).toContainText("Gợi ý tri thức");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await match.click();
  const candidate = page.getByRole("region", {
    name: "Gợi ý tri thức chờ rà soát",
  });
  await expect(candidate).toContainText("Cảm ơn, đã làm được");
  await expect(candidate).toContainText("chưa được thêm vào kho tri thức");
});

test("IT workspace keeps actions reachable, supports keyboard tabs and records a reasoned stop", async ({
  page,
  request,
  isMobile,
}, info) => {
  const response = await request.post("/api/support/requests", {
    data: {
      ...employeeIdentity,
      rawText: "Mở port 3389 public để vendor truy cập máy chủ demo.",
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(response.ok()).toBe(true);
  const { data: row } = await response.json();
  await page.goto(`/review?requestId=${row.id}`);
  await expect(
    page.getByRole("heading", { name: "Nội dung yêu cầu" }),
  ).toBeVisible();
  const approve = page.getByRole("button", {
    name: "Duyệt yêu cầu",
    exact: true,
  });
  await expect(approve).toBeDisabled();
  await expect(approve).toHaveAttribute("title", /rủi ro bảo mật/);
  if (!isMobile) {
    const box = await page
      .getByLabel("Lý do (bắt buộc cho mọi quyết định của reviewer)")
      .boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(page.viewportSize()!.height);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const evidenceTab = page.getByRole("tab", { name: "Thông tin & bằng chứng" });
  await evidenceTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Hướng dẫn đã gửi" }),
  ).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: "Hướng dẫn đã gửi" }),
  ).toContainText("Chưa gửi hướng dẫn");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /Lịch sử xử lý/ })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(evidenceTab).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/it-review-before-${info.project.name}.png`,
    fullPage: true,
  });
  const reason = "Dừng yêu cầu demo vì phạm vi truy cập chưa an toàn.";
  await page
    .getByLabel("Lý do (bắt buộc cho mọi quyết định của reviewer)")
    .fill(reason);
  await expect(approve).toBeDisabled();
  await page
    .getByLabel("Trạng thái sau điều chỉnh")
    .selectOption("APPROVED_BY_HUMAN");
  await expect(
    page.getByRole("button", { name: "Điều chỉnh quyết định", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Dừng xử lý", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã dừng xử lý");
  await expect(
    page.getByRole("tab", { name: /Lịch sử xử lý/ }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", { name: /Lịch sử xử lý/ }),
  ).toContainText(reason);
  const detail = (
    await (await request.get(`/api/support/requests/${row.id}`)).json()
  ).data;
  expect(detail.version).toBe(row.version + 1);
  expect(detail.events.at(-1)).toMatchObject({
    action: "STOP",
    explanation: reason,
  });
  await page.screenshot({
    path: `test-results/it-review-after-${info.project.name}.png`,
    fullPage: true,
  });
});

test("queue search opens the matching request and missing information still prevents approval", async ({
  page,
  request,
}, info) => {
  const text = `IT workspace demo ${crypto.randomUUID().slice(0, 8)}: Cấp read-only staging DB`;
  const response = await request.post("/api/support/requests", {
    data: {
      ...employeeIdentity,
      rawText: text,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(response.ok()).toBe(true);
  const { data: row } = await response.json();
  await page.goto("/review");
  await page.getByLabel("Hiển thị", { exact: true }).selectOption("all");
  await page
    .getByLabel("Tìm nội dung hoặc mã yêu cầu", { exact: true })
    .fill(text.slice(0, 26));
  const match = page.locator(`a[href="/review?requestId=${row.id}"]`);
  await expect(match).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/it-queue-${info.project.name}.png`,
    fullPage: true,
  });
  await match.click();
  await page
    .getByLabel("Lý do (bắt buộc cho mọi quyết định của reviewer)")
    .fill("Cần thêm nguồn và phạm vi dữ liệu cụ thể.");
  await expect(
    page.getByRole("button", { name: "Duyệt yêu cầu", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Duyệt yêu cầu", exact: true }),
  ).toHaveAttribute("title", /bổ sung đủ thông tin/);
  await page
    .getByRole("button", { name: "Hỏi thêm thông tin", exact: true })
    .click();
  await expect(
    page.getByRole("tabpanel", { name: /Lịch sử xử lý/ }),
  ).toContainText("Cần thêm nguồn và phạm vi dữ liệu cụ thể.");
});
