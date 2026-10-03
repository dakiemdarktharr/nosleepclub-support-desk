import { expect, test } from "./fixtures";
import { employeeIdentity, fillEmployeeIdentity } from "./intake-helpers";
test("conversation answers before confirmation, wraps and continues without a reviewer", async ({
  page,
}, info) => {
  await page.goto("/workspace");
  await fillEmployeeIdentity(page);
  await page
    .getByLabel("Mô tả yêu cầu", { exact: true })
    .fill("làm sao khôi phục tài khoản google");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  const bubble = page.getByRole("article", { name: "Câu trả lời của trợ lý" });
  await expect(bubble).toContainText("Google");
  await expect(
    page.getByRole("button", { name: "Xác nhận và gửi yêu cầu" }),
  ).toHaveCount(0);
  await expect(bubble).toBeVisible();
  const timings = await bubble.evaluate((element) => ({
    pop: getComputedStyle(element).animationDuration,
    reveal: getComputedStyle(element.parentElement!).animationDuration,
  }));
  expect(timings).toEqual({ pop: "0.2s", reveal: "0.4s" });
  await bubble.locator("summary").click();
  await expect(bubble.getByRole("link", { name: /Google:/ })).toHaveAttribute(
    "href",
    /support.google.com/,
  );
  await expect(page.locator(".assistant-reveal")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: `artifacts/conversation-${info.project.name}.png`,
    fullPage: true,
  });
  await bubble.locator(".assistant-text").evaluate((element) => {
    element.textContent =
      "A".repeat(2000) + "\n" + "Dòng hướng dẫn dài. ".repeat(200);
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Lưu và tiếp tục trò chuyện" })
    .click();
  await expect(page).toHaveURL(/\/requests\//);
  await page
    .getByLabel("Hỏi tiếp", { exact: true })
    .fill("Tôi không nhận được mã xác minh");
  await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
  await expect(page.getByLabel("Hỏi tiếp", { exact: true })).toHaveValue("");
  await expect(page.getByText("Trạng thái:")).toContainText("Đã có hướng dẫn");
  const saved = await (
    await page.request.get(`/api/support${new URL(page.url()).pathname}`)
  ).json();
  expect(saved.data.input.fields).toMatchObject({
    ...employeeIdentity.fields,
    employeeId: employeeIdentity.fields.employeeId.toLowerCase(),
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".assistant-bubble")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await page
    .getByRole("button", {
      name: "D. Chuyển cho nhân viên hỗ trợ",
      exact: true,
    })
    .click();
  await expect(page.getByText("Trạng thái:")).toContainText(
    "Đang chờ nhân viên",
  );
});

test("safe diagnosis exposes potential fixes and accepts a contextual follow-up", async ({
  page,
}) => {
  await page.goto("/workspace");
  await fillEmployeeIdentity(page);
  await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill("mất kết nối mạng");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByLabel("Chẩn đoán khả dĩ")).toBeVisible();
  await expect(page.getByText("Cách khắc phục có thể thử")).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận và gửi yêu cầu" }).click();
  await expect(page).toHaveURL(/\/requests\//);
  await expect(page.getByRole("heading", { name: "Hỏi tiếp về phản hồi này" })).toBeVisible();
  await page.getByLabel("Hỏi tiếp", { exact: true }).fill("Tôi đã kiểm tra Wi-Fi nhưng vẫn không kết nối");
  await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
  await expect(page.getByLabel("Hỏi tiếp", { exact: true })).toHaveValue("");
});
