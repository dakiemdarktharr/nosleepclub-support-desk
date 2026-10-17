import { test, expect } from "./fixtures";
import type { SupportRequest } from "../../src/domain/contracts";

for (const rawText of ["Need database access", "Open public RDP port 3389", "Grant production admin"]) {
  test("reviewer approves a waiting request with an empty message: " + rawText, async ({ page, request }) => {
    const created = await request.post("/api/support/requests", { data: {
      requesterMode: "guest", rawText, confirmed: true, idempotencyKey: crypto.randomUUID(),
    } });
    expect(created.ok()).toBe(true);
    const original: SupportRequest = (await created.json()).data;
    await page.goto("/review?requestId=" + original.id);
    await expect(page.getByLabel("Tin nhắn cho người gửi")).toHaveValue("");
    const approve = page.getByRole("button", { name: "Duyệt yêu cầu", exact: true });
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.locator(".it-current-status")).toContainText("Nhân viên đã duyệt");
    const stored: SupportRequest = (await (await request.get("/api/support/requests/" + original.id)).json()).data;
    expect(stored.status).toBe("APPROVED_BY_HUMAN");
    expect(stored.decision).toEqual(original.decision);
    expect(stored.events.filter(event => event.action === "APPROVE")).toHaveLength(1);
    await page.reload();
    await expect(page.locator(".it-current-status")).toContainText("Nhân viên đã duyệt");
    await page.goto("/requests/" + original.id);
    await expect(page.getByText("Nhân viên đã duyệt", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toContainText("Nhân viên hỗ trợ đã duyệt yêu cầu.");
  });
}

test("approval stays available while Luna drafts and ignores a late draft", async ({ page, request }) => {
  const created = await request.post("/api/support/requests", { data: {
    requesterMode: "guest", rawText: "Need database access", confirmed: true, idempotencyKey: crypto.randomUUID(),
  } });
  expect(created.ok()).toBe(true);
  const row: SupportRequest = (await created.json()).data;
  let releaseDraft!: () => void;
  const draftGate = new Promise<void>(resolve => { releaseDraft = resolve; });
  await page.route("**/api/review/" + row.id + "/information", async route => {
    await draftGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true,
      data: { version: row.version, text: "Bạn bổ sung tên hệ thống giúp mình nhé.", source: "mock" },
    }) });
  });
  await page.goto("/review?requestId=" + row.id);
  await page.getByRole("button", { name: "Hỏi thêm thông tin", exact: true }).click();
  await expect(page.getByText("Đang soạn tin nhắn hỏi thông tin còn thiếu…")).toBeVisible();
  const approve = page.getByRole("button", { name: "Duyệt yêu cầu", exact: true });
  await expect(approve).toBeEnabled();
  const lateDraft = page.waitForResponse(response => response.url().endsWith("/" + row.id + "/information"));
  try {
    await approve.click();
    await expect(page.locator(".it-current-status")).toContainText("Nhân viên đã duyệt");
  } finally { releaseDraft(); }
  await (await lateDraft).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByLabel("Tin nhắn cho người gửi")).toHaveValue("");
  const stored: SupportRequest = (await (await request.get("/api/support/requests/" + row.id)).json()).data;
  expect(stored.status).toBe("APPROVED_BY_HUMAN");
  expect(stored.events.filter(event => event.action === "APPROVE")).toHaveLength(1);
  expect(stored.events.some(event => event.action === "REQUEST_INFORMATION")).toBe(false);
});
