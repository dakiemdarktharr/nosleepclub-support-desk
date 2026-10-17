import { test, expect } from "./fixtures";

test("three division tabs receive only their routed requests, support keyboard switching and survive reload", async ({ page, request }, info) => {
  const rows = [];
  for (const rawText of ["VPN không kết nối", "Tôi cần kiểm tra hóa đơn", "Tôi cần kiểm tra phiếu lương"]) {
    const response = await request.post("/api/support/requests", { data: { requesterMode: "guest", rawText, confirmed: true, idempotencyKey: crypto.randomUUID() } });
    expect(response.ok()).toBe(true); rows.push((await response.json()).data);
  }
  expect(rows.map(row => row.decision.division)).toEqual(["IT", "COMMERCIAL", "HR"]);
  await page.goto("/review");
  await expect(page.getByRole("tablist", { name: "Ban tiếp nhận" }).getByRole("tab")).toHaveCount(3);
  await page.getByLabel("Gộp yêu cầu cùng vấn đề").uncheck();
  await page.getByLabel("Hiển thị", { exact: true }).selectOption("all");
  for (const [index, name] of ["Ban IT", "Ban Commercial", "Ban HR"].entries()) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`a[href='/review?requestId=${rows[index].id}']`)).toBeVisible();
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.locator(`a[href='/review?requestId=${rows[index].id}']`)).toBeVisible();
    for (const row of rows.filter((_, other) => other !== index)) await expect(page.locator(`a[href='/review?requestId=${row.id}']`)).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/support-desk-divisions-${info.project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByRole("tab", { name: "Ban HR", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Ban HR", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Ban Commercial", exact: true })).toBeFocused();
  await expect(page.locator(`a[href='/review?requestId=${rows[1].id}']`)).toBeVisible();
});

test("expansion Verify pack runs all thirty cases with persisted division and response checks", async ({ page, request }) => {
  await page.goto("/verify");
  await page.getByLabel("Bộ kiểm thử").selectOption("support-desk-expansion");
  await page.getByRole("button", { name: "Chạy toàn bộ test (30)", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Tiến độ kiểm thử" })).toHaveAttribute("aria-valuenow", "30", { timeout: 45_000 });
  await expect(page.getByRole("status")).toContainText("Pass: 30 · Fail: 0");
  const runId = new URL(page.url()).searchParams.get("run");
  const { data: run } = await (await request.get(`/api/support/verify-runs/${runId}`)).json();
  expect(run.results).toHaveLength(30);
  expect(run.results.every((row: { response?: { checks: string[] }; pass: boolean }) => row.pass && row.response?.checks.includes("division:pass"))).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Bộ kiểm thử")).toHaveValue("support-desk-expansion");
  await expect(page.getByRole("status")).toContainText("Pass: 30 · Fail: 0");
});

test("a delayed IT response cannot replace the selected HR queue", async ({ page, request }) => {
  const response = await request.post("/api/support/requests", { data: { requesterMode: "guest", rawText: "Tôi cần kiểm tra phiếu lương", confirmed: true, idempotencyKey: crypto.randomUUID() } });
  const { data: row } = await response.json();
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const received = new Promise<void>(resolve => { started = resolve; });
  await page.route(/\/api\/support\/requests\?/, async route => {
    const result = await route.fetch();
    if (new URL(route.request().url()).searchParams.get("division") === "IT") { started(); await held; }
    await route.fulfill({ response: result });
  });
  try {
    await page.goto("/review");
    await received;
    await page.getByRole("tab", { name: "Ban HR", exact: true }).click();
    await expect(page.locator(`a[href='/review?requestId=${row.id}']`)).toBeVisible();
    const finished = page.waitForResponse(value => new URL(value.url()).searchParams.get("division") === "IT");
    release(); await finished;
    await expect(page.getByRole("tab", { name: "Ban HR", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`a[href='/review?requestId=${row.id}']`)).toBeVisible();
  } finally { release(); }
});
