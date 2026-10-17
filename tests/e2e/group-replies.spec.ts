import { test, expect } from "./fixtures";
import dataset from "../../data/cache-system.json";
import type { SupportRequest } from "../../src/domain/contracts";

test("admin opens seven grouped requests and sends a reply to every tracker, with safe retry and membership refresh", async ({ page, request, context }, info) => {
  test.setTimeout(120_000);
  const rows: SupportRequest[] = [];
  async function create(text: string) {
    const response = await request.post("/api/support/requests", { data: {
      requesterMode: "guest", rawText: text, confirmed: true, idempotencyKey: crypto.randomUUID(),
    } });
    expect(response.ok()).toBe(true);
    const original: SupportRequest = (await response.json()).data;
    const handoff = await request.post(`/api/support/requests/${original.id}/feedback`, { data: { version: original.version, choice: "ADMIN" } });
    expect(handoff.ok()).toBe(true);
    return (await handoff.json()).data as SupportRequest;
  }
  for (const text of dataset.groups[3].requests) rows.push(await create(text));
  await page.goto("/review");
  // Verify fixtures are also visible now; this scenario addresses real submissions.
  await page.getByLabel("Nguồn yêu cầu").selectOption("support");
  const row = page.locator(".it-request-row").filter({ hasText: "7 yêu cầu về máy in offline" });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByRole("heading", { name: "7 yêu cầu về máy in offline", exact: true })).toBeVisible();
  const members = page.getByRole("region", { name: "Yêu cầu trong nhóm" });
  await expect(members.getByRole("link")).toHaveCount(7);
  for (const row of rows) await expect(members.locator(`a[href="/review?requestId=${row.id}"]`)).toHaveCount(1);
  const send = page.getByRole("button", { name: "Gửi cho 7 yêu cầu", exact: true });
  const composer = page.getByLabel("Nội dung trả lời");
  await expect(send).toBeDisabled();
  const text = "Bạn kiểm tra nguồn và kết nối máy in, sau đó mở lại hàng đợi in nhé.";
  await composer.fill(text);
  const tracker = await context.newPage();
  await tracker.goto(`/requests/${rows[0].id}`);
  await expect(tracker.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toHaveCount(0);
  // Save the response, then drop its network acknowledgement. Retrying must
  // reuse the send ID and never deliver a second copy to any member.
  await page.route("**/api/review/groups/*", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  }, { times: 1 });
  await send.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Mất kết nối");
  await expect(composer).toHaveValue(text);
  await send.click();
  await expect(page.getByRole("status").filter({ hasText: "Đã gửi đến 7 yêu cầu." })).toBeVisible();
  await expect(composer).toHaveValue("");
  await tracker.bringToFront();
  await expect(tracker.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toContainText(text, { timeout: 10000 });
  await tracker.reload();
  await expect(tracker.getByRole("region", { name: "Tin nhắn từ nhân viên" })).toContainText(text);
  for (const row of rows) {
    const saved: SupportRequest = (await (await request.get(`/api/support/requests/${row.id}`)).json()).data;
    expect(saved.sharedReplies).toHaveLength(1);
    expect(saved.sharedReplies![0].text).toBe(text);
    expect(saved.status).toBe(row.status);
    expect(saved.version).toBe(row.version);
  }
  await page.bringToFront();
  await page.screenshot({ path: `test-results/group-replies-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const late = await create(dataset.groups[3].requests[0]);
  expect((await (await request.get(`/api/support/requests/${late.id}`)).json()).data.sharedReplies ?? []).toEqual([]);
  const followup = "Bạn kiểm tra lại trạng thái máy in giúp mình nhé.";
  await composer.fill(followup);
  await send.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Nhóm đã thay đổi");
  await expect(page.getByRole("heading", { name: "8 yêu cầu về máy in offline", exact: true })).toBeVisible();
  await expect(composer).toHaveValue(followup);
  await page.getByRole("button", { name: "Gửi cho 8 yêu cầu", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã gửi đến 8 yêu cầu." })).toBeVisible();
  for (const row of [...rows, late]) {
    const saved: SupportRequest = (await (await request.get(`/api/support/requests/${row.id}`)).json()).data;
    expect(saved.sharedReplies).toHaveLength(row.id === late.id ? 1 : 2);
    expect(saved.sharedReplies!.at(-1)!.text).toBe(followup);
  }
  await tracker.close();
});
