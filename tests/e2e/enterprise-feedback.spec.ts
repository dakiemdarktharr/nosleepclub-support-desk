import { expect, test } from "./fixtures";
import { employeeIdentity, fillEmployeeIdentity } from "./intake-helpers";

test("affect-only feedback keeps the ticket open until an explicit outcome", async ({ page, request }) => {
  const response = await request.post("/api/support/requests", { data: {
    ...employeeIdentity, rawText: "VPN không kết nối", confirmed: true, idempotencyKey: crypto.randomUUID(),
  } });
  expect(response.status()).toBe(201);
  const { data: row } = await response.json();
  await page.goto(`/requests/${row.id}`);
  for (const text of ["Tôi rất hài lòng.", "Tôi rất bực mình."]) {
    await page.getByLabel("Hỏi tiếp", { exact: true }).fill(text);
    await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
    await expect(page.getByLabel("Hỏi tiếp", { exact: true })).toHaveValue("");
    await expect(page.getByRole("status").filter({ hasText: "Đã ghi nhận phản hồi" })).toBeVisible();
    await expect(page.getByText("Trạng thái:")).toContainText("Đã có hướng dẫn");
  }
  const saved = (await (await request.get(`/api/support/requests/${row.id}`)).json()).data;
  expect(saved.feedback.map((item: { choice: string }) => item.choice)).toEqual(["COMMENT", "COMMENT"]);
  expect(saved.knowledgeCandidate).toBeUndefined();
  await page.getByLabel("Hỏi tiếp", { exact: true }).fill("Cảm ơn, đã làm được.");
  await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
  await expect(page.getByText("Trạng thái:")).toContainText("Đã hoàn tất");
});

for (const text of ["tôi không vào acc youtube được", "tôi không vào acc youtube được, làm sao để vào?"]) {
  test(`account help works without question syntax: ${text}`, async ({ page }) => {
    await page.goto("/send-help");
    await fillEmployeeIdentity(page);
    await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill(text);
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    await expect(page.getByRole("article", { name: "Câu trả lời của trợ lý" })).toContainText("Google");
    await page.getByRole("button", { name: "Lưu và tiếp tục trò chuyện" }).click();
    await expect(page).toHaveURL(/\/requests\//);
    await page.getByLabel("Hỏi tiếp", { exact: true }).fill("tôi không vào được");
    await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
    await expect(page.getByLabel("Hỏi tiếp", { exact: true })).toHaveValue("");
    await expect(page.getByText("Trạng thái:")).toContainText("Đã có hướng dẫn");
    await page.getByLabel("Hỏi tiếp", { exact: true }).fill("cảm ơn, đã làm được");
    await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
    await expect(page.getByText("Trạng thái:")).toContainText("Đã hoàn tất");
  });
}
test("reviewer can select separate policy and authority queues", async ({ page }) => {
  const create = async (rawText: string) => {
    const response = await page.request.post("/api/support/requests", { data: { ...employeeIdentity, rawText, confirmed: true, idempotencyKey: crypto.randomUUID() } });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).data.id as string;
  };
  const security = await create("Open port 3389 public");
  const authority = await create("Cấp quyền admin production");
  await page.goto("/review");
  const queue = page.getByLabel("Hàng đợi chuyển tiếp");
  await queue.selectOption("OUT_OF_POLICY");
  await expect(page.locator(`.review-list a[href='/review?requestId=${security}']`)).toContainText("Security");
  await expect(page.locator(`.review-list a[href='/review?requestId=${authority}']`)).toHaveCount(0);
  await queue.selectOption("AUTHORITY_REQUIRED");
  await expect(page.locator(`.review-list a[href='/review?requestId=${authority}']`)).toContainText("Cần thẩm quyền");
  await expect(page.locator(`.review-list a[href='/review?requestId=${security}']`)).toHaveCount(0);
});
test("mascot corners reveal the page background", async ({ page }, info) => {
  await page.goto("/");
  const mascot = page.locator(".welcome-art img");
  await expect(mascot).toBeVisible();
  await expect.poll(() => mascot.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const alpha = await mascot.evaluate((element) => {
    const img = element as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return [[0, 0], [canvas.width - 1, 0], [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1]].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]);
  });
  expect(alpha).toEqual([0, 0, 0, 0]);
  await page.screenshot({ path: `artifacts/enterprise-mascot-${info.project.name}.png`, fullPage: true });
});
