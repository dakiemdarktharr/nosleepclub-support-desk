import { expect, test } from "./fixtures";
import { mkdir } from "node:fs/promises";
import { fillEmployeeIdentity } from "./intake-helpers";

test("record a raw demo and verify reviewer override, stop and audit", async ({
  browser,
  extraHTTPHeaders,
}, info) => {
  test.skip(
    info.project.name !== "chromium",
    "One desktop recording is sufficient.",
  );
  const context = await browser.newContext({
    extraHTTPHeaders,
    baseURL: "http://127.0.0.1:3227",
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: "test-results/demo-video",
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    for (const role of ["intro", "sender", "reviewer"]) sessionStorage.setItem(`vng-guide-v1:${role}`, "seen");
  });
  const video = page.video();
  try {
    await page.goto("/");
    await page
      .getByRole("link", { name: "Tôi cần hỗ trợ", exact: true })
      .click();
    await page.getByText("Hướng dẫn & tùy chọn", { exact: true }).click();
    await page.getByRole("link", { name: "Trải nghiệm demo", exact: true }).click();
    await fillEmployeeIdentity(page);
    await page
      .getByLabel("Mô tả yêu cầu", { exact: true })
      .fill("Tôi tắt máy tính lúc về được không?");
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    await page.getByRole("button", { name: "Xác nhận và gửi yêu cầu" }).click();
    await expect(page).toHaveURL(/\/requests\/[a-f0-9-]+$/);
    await expect(page.getByText("Trạng thái:")).toContainText(
      "Đã có hướng dẫn",
    );
    const id = page.url().split("/").at(-1);
    await page
      .getByRole("button", {
        name: "D. Chuyển cho nhân viên hỗ trợ",
        exact: true,
      })
      .click();
    await expect(page.getByText("Trạng thái:")).toContainText(
      "Đang chờ nhân viên hỗ trợ",
    );
    await page.goto(`/review?requestId=${id}`);
    await expect(
      page.getByRole("button", { name: "Điều chỉnh quyết định", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Lý do (bắt buộc cho mọi quyết định của reviewer)")
      .fill("Cần làm rõ thời điểm tắt thiết bị trong demo.");
    await page
      .getByRole("button", { name: "Điều chỉnh quyết định", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Cần bạn bổ sung thông tin",
    );
    await page
      .getByLabel("Lý do (bắt buộc cho mọi quyết định của reviewer)")
      .fill("Dừng hồ sơ demo sau khi kiểm tra thao tác điều chỉnh.");
    await page.getByRole("button", { name: "Dừng xử lý", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Đã dừng xử lý");
    await expect(
      page.getByRole("button", { name: "Duyệt yêu cầu", exact: true }),
    ).toBeDisabled();
    await page.locator("#request-audit").scrollIntoViewIfNeeded();
    const detail = await (
      await context.request.get(`/api/support/requests/${id}`)
    ).json();
    expect(
      detail.data.events.some(
        (e: { action: string }) => e.action === "OVERRIDE",
      ),
    ).toBe(true);
    expect(
      detail.data.events.some((e: { action: string }) => e.action === "STOP"),
    ).toBe(true);
    await page.goto("/verify");
    await page
      .getByRole("button", { name: "Chạy toàn bộ test (5)", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "5/5 · Pass: 5 · Fail: 0",
    );
    await page.reload();
    await expect(page.getByRole("table")).toBeVisible();
    await page.screenshot({
      path: "artifacts/verify-persisted.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
  await mkdir("submission", { recursive: true });
  await video?.saveAs("submission/DEMO-LOCAL-MOCK.webm");
});
