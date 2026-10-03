import { test, expect } from "./fixtures";
import { employeeIdentity } from "./intake-helpers";

test("audit events scroll inside their panel without scrolling the page", async ({ page }) => {
  const events = Array.from({ length: 40 }, (_, index) => ({
    id: `event-${index}`,
    requestId: `request-${index}`,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    actor: "employee-demo",
    beforeStatus: "RECEIVED",
    afterStatus: "NEEDS_INFORMATION",
    action: "DECISION",
    requestKind: "OTHER",
    riskLevel: "LOW",
    bucket: "BEYOND_AUTHORITY",
    ruleIds: ["AUTH-001"],
    safeEvidence: [],
    missingFields: [],
    questions: [],
    targetedQuestions: [],
    nextStep: "Chờ nhân viên hỗ trợ.",
    policyVersion: "test",
    redactions: [],
    approvalStatus: "UNVERIFIED",
    subrequestOutcomes: [],
    explanation: `Sự kiện kiểm thử số ${index + 1}.`,
  }));
  await page.route("**/api/support/events?*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { items: events, nextCursor: null, total: events.length },
    }),
  }));

  await page.goto("/audit");
  const panel = page.getByRole("region", { name: "Danh sách sự kiện xử lý" });
  await expect(panel).toHaveCSS("overflow-y", "auto");
  await expect(panel).toHaveCSS("overscroll-behavior-y", "contain");
  await expect.poll(() => panel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await panel.hover();
  const pageScrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 450);
  await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.evaluate(() => window.scrollY)).resolves.toBe(pageScrollBefore);
});

test("review requests scroll inside their panel without scrolling the page", async ({ page }) => {
  const requests = Array.from({ length: 40 }, (_, index) => ({
    id: `request-${index}`,
    version: 1,
    status: "ESCALATED",
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    employeeId: `EMP-${index}`,
    title: `Yêu cầu kiểm thử số ${index + 1}`,
    serviceGroup: "OTHER",
    action: "ESCALATE",
    hasKnowledgeCandidate: false,
    uncertaintyClass: "AUTHORITY_REQUIRED",
    assignedTeam: "Support",
  }));
  await page.route("**/api/support/requests?*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { items: requests, nextCursor: null, total: requests.length },
    }),
  }));

  await page.goto("/review");
  const panel = page.getByRole("region", { name: "Danh sách yêu cầu phù hợp" });
  await expect(panel).toHaveCSS("overflow-y", "auto");
  await expect(panel).toHaveCSS("overscroll-behavior-y", "contain");
  await expect.poll(() => panel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await panel.hover();
  const pageScrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 450);
  await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.evaluate(() => window.scrollY)).resolves.toBe(pageScrollBefore);
});

test("review, audit and verify share one employee workspace", async ({ page }) => {
  const pages = [
    ["/review", "Yêu cầu cần xử lý"],
    ["/audit", "Lịch sử xử lý"],
    ["/verify", "Kiểm thử"],
  ] as const;
  for (const [path, currentLabel] of pages) {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name: "Điều hướng hỗ trợ" });
    await expect(page.locator(".it-workspace")).toBeVisible();
    await expect(page.locator(".it-content")).toBeVisible();
    await expect(nav.getByRole("link", { name: currentLabel, exact: true }))
      .toHaveAttribute("aria-current", "page");
    await expect(page.locator(".it-header nav")).toHaveCount(0);
  }
});

test("employee filter suggests matching codes and supports keyboard selection", async ({ page }) => {
  let filteredEmployeeId = "";
  await page.route("**/api/support/requests?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("view") === "employee-suggestions") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: ["emp-001", "emp-010"] }),
      });
    }
    filteredEmployeeId = params.get("employeeId") ?? "";
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { items: [], nextCursor: null, total: 0 } }),
    });
  });

  await page.goto("/review");
  const employeeFilter = page.getByLabel("Mã nhân viên", { exact: true });
  await employeeFilter.fill("emp-0");
  const suggestions = page.getByRole("listbox", { name: "Mã nhân viên gợi ý" });
  await expect(suggestions.getByRole("option")).toHaveText(["emp-001", "emp-010"]);

  await employeeFilter.press("ArrowDown");
  await employeeFilter.press("Enter");
  await expect(employeeFilter).toHaveValue("emp-001");
  await expect(suggestions).toHaveCount(0);
  await expect.poll(() => filteredEmployeeId).toBe("emp-001");

  await employeeFilter.fill("emp-0");
  await suggestions.getByRole("option", { name: "emp-010" }).click();
  await expect(employeeFilter).toHaveValue("emp-010");
  await expect.poll(() => filteredEmployeeId).toBe("emp-010");
});

test("quick queues, displayed ID search, return and reset work together", async ({ page, request }, info) => {
  const result = await request.post("/api/support/requests", { data: { ...employeeIdentity, rawText: "Open port 3389 public", confirmed: true, idempotencyKey: crypto.randomUUID() } });
  expect(result.ok()).toBe(true);
  const row = (await result.json()).data;
  const code = `HT-${row.id.slice(0, 8).toUpperCase()}`;
  await page.goto("/review");
  await expect(page.getByRole("link", { name: "Lịch sử xử lý", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Ngoài quy định", exact: true }).click();
  await expect(page.getByLabel("Hàng đợi chuyển tiếp")).toHaveValue("OUT_OF_POLICY");
  await page.getByLabel("Mã nhân viên", { exact: true }).fill("EMP-E2E-001");
  await page.getByLabel("Tìm nội dung hoặc mã yêu cầu", { exact: true }).fill(code);
  const link = page.locator(`.review-list a[href='/review?requestId=${row.id}']`);
  await expect(link).toBeVisible();
  await expect(page.locator(".review-list li")).toHaveCount(1);
  await page.screenshot({ path: `test-results/vng-queue-${info.project.name}.png`, fullPage: true });
  await link.click();
  await page.getByRole("link", { name: "← Danh sách yêu cầu" }).click();
  await expect(page.getByLabel("Tìm nội dung hoặc mã yêu cầu", { exact: true })).toHaveValue(code);
  await expect(page.getByLabel("Mã nhân viên", { exact: true })).toHaveValue("EMP-E2E-001");
  await expect(page.getByLabel("Hàng đợi chuyển tiếp")).toHaveValue("OUT_OF_POLICY");
  await expect(link).toBeVisible();
  await page.getByLabel("Mã nhân viên", { exact: true }).fill("");
  await page.getByLabel("Tìm nội dung hoặc mã yêu cầu", { exact: true }).fill("synthetic-no-match-000000");
  await expect(page.getByText("Chưa có yêu cầu phù hợp")).toBeVisible();
  await page.getByRole("button", { name: "Xem tất cả yêu cầu" }).click();
  await expect(page.getByLabel("Hiển thị", { exact: true })).toHaveValue("all");
  await expect(page.getByLabel("Nguồn yêu cầu")).toHaveValue("all");
  await expect(page.getByLabel("Tìm nội dung hoặc mã yêu cầu", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Mã nhân viên", { exact: true })).toHaveValue("");
  await expect(link).toBeVisible();
  await page.screenshot({ path: `test-results/vng-dashboard-${info.project.name}.png`, fullPage: true });
  await page.goto("/audit");
  await page.getByLabel("Mã nhân viên", { exact: true }).fill("EMP-E2E-001");
  await expect(page.locator(".support-timeline li").first()).toBeVisible();
  await page.screenshot({ path: `test-results/vng-audit-${info.project.name}.png`, fullPage: true });
});

test("failed filter refresh removes stale results and can recover without session storage", async ({ page, request }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "vng-review-filters-v1") throw new Error("Synthetic storage unavailable");
      original.call(this, key, value);
    };
  });
  const result = await request.post("/api/support/requests", { data: { ...employeeIdentity, rawText: "Open port 3389 public", confirmed: true, idempotencyKey: crypto.randomUUID() } });
  expect(result.ok()).toBe(true);
  await page.goto("/review");
  await expect(page.locator(".review-list li").first()).toBeVisible();
  await page.route("**/api/support/requests?*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SERVER_ERROR", message: "Synthetic temporary failure" } }) }));
  await page.getByLabel("Hàng đợi chuyển tiếp").selectOption("AUTHORITY_REQUIRED");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Synthetic temporary failure");
  await expect(page.locator(".review-list li")).toHaveCount(0);
  await page.unroute("**/api/support/requests?*");
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".review-list li").first()).toBeVisible();
});
