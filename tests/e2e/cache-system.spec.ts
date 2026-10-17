import { expect, test, type Page } from "./fixtures";

async function expectGroupedResults(page: Page) {
  const report = page.getByRole("region", { name: "Thống kê kết quả cache", exact: true });
  await expect(report.getByRole("region", { name: /^Nhóm:/ })).toHaveCount(5);
  for (const label of ["VPN không kết nối", "VPN liên tục ngắt kết nối", "Wi-Fi không kết nối", "Máy in offline"]) {
    const group = report.getByRole("region", { name: `Nhóm: ${label}`, exact: true });
    await expect(group.getByText("7 yêu cầu cùng nội dung", { exact: true })).toBeVisible();
    await expect(group.locator("dl").getByText("Đã kiểm tra", { exact: true }).locator("..")).toContainText("7/7");
    await expect(group.locator("dl").getByText("PASS", { exact: true }).locator("..")).toContainText("7");
    await expect(group.locator("dl").getByText("FAIL", { exact: true }).locator("..")).toContainText("0");
    await expect(group.getByText("Nhận diện đúng nhóm: 7/7 yêu cầu đã chạy.", { exact: true })).toBeVisible();
    await expect(group.getByText("HIT: 6 · MISS: 1 · BYPASS: 0", { exact: true })).toBeVisible();
  }
  const controls = report.getByRole("region", { name: "Nhóm: Yêu cầu đối chứng", exact: true });
  await expect(controls.getByText("14 yêu cầu đối chứng", { exact: true })).toBeVisible();
  await expect(controls.getByText("HIT: 0 · MISS: 0 · BYPASS: 14", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
}

test("test cache system runs 42 real cases and restores grouped statistics", async ({ page, request }, info) => {
  await page.goto("/verify");
  await page.getByLabel("Bộ kiểm thử").selectOption({ label: "test cache system" });
  await expect(page.getByRole("heading", { name: "test cache system" })).toBeVisible();
  await page.getByText("Xem 42 câu và kỳ vọng", { exact: true }).click();
  await expect(page.getByText("Bạn ơi, VPN của mình không kết nối được. Nhờ bạn hướng dẫn với.", { exact: false }).first()).toBeVisible();
  await page.getByText("Xem 42 câu và kỳ vọng", { exact: true }).click();
  await page.getByRole("button", { name: "Chạy toàn bộ test (42)" }).click();
  const progress = page.getByRole("progressbar", { name: "Tiến độ kiểm thử" });
  await expect(progress).toHaveAttribute("aria-valuenow", "42", { timeout: 45_000 });
  await expect(page.getByRole("status")).toContainText("Pass: 42 · Fail: 0");
  const saved = page.url();
  const runId = new URL(saved).searchParams.get("run");
  expect(runId).toBeTruthy();
  const response = await request.get(`/api/support/verify-runs/${runId}`);
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  expect(data.status).toBe("COMPLETE");
  expect(data.results.filter((row: { cache: { actual: string } }) => row.cache.actual === "HIT")).toHaveLength(24);
  expect(data.results.filter((row: { cache: { actual: string } }) => row.cache.actual === "MISS")).toHaveLength(4);
  expect(data.results.filter((row: { cache: { actual: string } }) => row.cache.actual === "BYPASS")).toHaveLength(14);
  expect(data.results.every((row: { pass: boolean; requestId?: string }) => row.pass && row.requestId)).toBe(true);
  await expectGroupedResults(page);
  await page.reload();
  await expect(page.getByLabel("Bộ kiểm thử")).toHaveValue("test-cache-system");
  await expect(progress).toHaveAttribute("aria-valuenow", "42");
  await expect(page.getByRole("status")).toContainText("Pass: 42 · Fail: 0");
  await expectGroupedResults(page);
  const group = page.getByRole("region", { name: "Nhóm: VPN không kết nối", exact: true });
  const paraphrase = group.getByText("Bạn ơi, VPN của mình không kết nối được. Nhờ bạn hướng dẫn với.", { exact: true });
  await expect(paraphrase).toBeHidden();
  await group.getByText("Xem 7 yêu cầu và kết quả", { exact: true }).click();
  await expect(paraphrase).toBeVisible();
  await expect(group.getByText("PASS · Kỳ vọng: HIT · Thực tế: HIT", { exact: true })).toHaveCount(6);
  await group.getByText("Chi tiết kiểm tra", { exact: true }).nth(1).click();
  await expect(group.getByText("cache-outcome:pass", { exact: true }).nth(1)).toBeVisible();
  await group.getByText("Xem 7 yêu cầu và kết quả", { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("region", { name: "Thống kê kết quả cache", exact: true }).screenshot({ path: `artifacts/cache-groups-${info.project.name}.png` });
  await page.getByLabel("Bộ kiểm thử").selectOption("de-a-v3");
  await expect(page.getByRole("region", { name: "Thống kê kết quả cache", exact: true })).toHaveCount(0);
  await page.goto(saved);
  await page.evaluate(() => sessionStorage.setItem("vng-review-filters-v1", JSON.stringify({ filter: "pending", origin: "support", queue: "OUT_OF_POLICY", search: "old filter", employeeId: "old-employee" })));
  await page.getByRole("button", { name: "Xem yêu cầu cần xử lý", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/review\\?verifyRunId=${runId}`));
  for (const title of ["lỗi kết nối VPN", "VPN ngắt kết nối", "lỗi kết nối Wi-Fi", "máy in offline"]) {
    await expect(page.locator(".it-request-row").filter({ hasText: `7 yêu cầu về ${title}` })).toHaveCount(1);
  }
  await expect(page.getByLabel("Nguồn yêu cầu")).toHaveValue("verify");
  await expect(page.getByLabel("Hiển thị", { exact: true })).toHaveValue("all");
  await page.locator(".it-request-row").filter({ hasText: "7 yêu cầu về máy in offline" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `artifacts/cache-queue-${info.project.name}.png`, fullPage: true });
  await page.locator(".it-request-row").filter({ hasText: "7 yêu cầu về máy in offline" }).click();
  const members = page.getByRole("region", { name: "Yêu cầu trong nhóm" });
  await expect(members.getByRole("link")).toHaveCount(7);
  const memberIds = await members.getByRole("link").evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).searchParams.get("requestId")));
  await page.getByLabel("Nội dung trả lời").fill("Bạn kiểm tra nguồn và kết nối máy in rồi thử in lại nhé.");
  await page.getByRole("button", { name: "Gửi cho 7 yêu cầu", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Đã gửi đến 7 yêu cầu.");
  for (const id of memberIds) {
    const tracker = await request.get(`/api/support/requests/${id}`);
    expect(tracker.ok()).toBe(true);
    expect((await tracker.json()).data.sharedReplies).toEqual([expect.objectContaining({ text: "Bạn kiểm tra nguồn và kết nối máy in rồi thử in lại nhé." })]);
  }
});

test("partial cache groups show unrun requests and update correctly when resumed", async ({ page, request }) => {
  const created = await request.post("/api/support/verify-runs", { data: { pack: "test-cache-system" } });
  expect(created.ok()).toBe(true);
  const { data: run } = await created.json();
  expect((await request.post(`/api/support/verify-runs/${run.id}/cases`, { data: { caseId: run.cases[0].caseId } })).ok()).toBe(true);
  expect((await request.post(`/api/support/verify-runs/${run.id}`, { data: { action: "stop" } })).ok()).toBe(true);
  await page.goto(`/verify?run=${run.id}`);
  const group = page.getByRole("region", { name: "Nhóm: VPN không kết nối", exact: true });
  await expect(group.getByText("7 yêu cầu cùng nội dung", { exact: true })).toBeVisible();
  await expect(group.locator("dl").getByText("Đã kiểm tra", { exact: true }).locator("..")).toContainText("1/7");
  await expect(group.locator("dl").getByText("Chưa chạy", { exact: true }).locator("..")).toContainText("6");
  await expect(group.getByText("HIT: 0 · MISS: 1 · BYPASS: 0", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Nhóm: Máy in offline", exact: true })).toContainText("Chưa có kết quả nhận diện nhóm.");
  await page.getByRole("button", { name: "Tiếp tục lần kiểm thử", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Tiến độ kiểm thử" })).toHaveAttribute("aria-valuenow", "42", { timeout: 45_000 });
  await expectGroupedResults(page);
});
