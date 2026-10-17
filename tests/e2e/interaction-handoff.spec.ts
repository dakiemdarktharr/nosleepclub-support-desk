import { test, expect } from "./fixtures";

for (const { emotion, handoff } of [
  { emotion: "tôi không cảm thấy bực mình", handoff: false },
  { emotion: "chờ quá lâu", handoff: true },
]) {
  test(`two failed rounds respect the current emotion: ${emotion}`, async ({ page, request }) => {
    const response = await request.post("/api/support/requests", { data: { requesterMode: "guest", rawText: "VPN không kết nối", confirmed: true, idempotencyKey: crypto.randomUUID() } });
    expect(response.status()).toBe(201);
    const row = (await response.json()).data;
    await page.goto(`/requests/${row.id}`);
    for (const question of [
      "Tôi đã thử bước đầu nhưng vẫn chưa kết nối được.",
      `Tôi làm theo bước tiếp theo nhưng vẫn chưa kết nối được, ${emotion}.`,
    ]) {
      await page.getByLabel("Hỏi tiếp", { exact: true }).fill(question);
      await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
      if (handoff && question.includes(emotion)) {
        await expect(page.getByText("Trạng thái:")).toContainText("Đang chờ nhân viên hỗ trợ");
      } else {
        await expect(page.getByLabel("Hỏi tiếp", { exact: true })).toHaveValue("");
        await expect(page.getByText("Trạng thái:")).toContainText("Đã có hướng dẫn");
      }
    }
    const saved = (await (await request.get(`/api/support/requests/${row.id}`)).json()).data;
    expect(saved.supportNeed).toMatchObject({ reportedFailedRounds: 2, handoffRecommended: handoff });
    expect(saved.decision.ruleIds.includes("HANDOFF-002")).toBe(handoff);
    await page.reload();
    await expect(page.getByText("Trạng thái:")).toContainText(handoff ? "Đang chờ nhân viên hỗ trợ" : "Đã có hướng dẫn");
  });
}

test("role play alone keeps guidance, failed interactions with frustration reach the reviewer", async ({ page, request }) => {
  const response = await request.post("/api/support/requests", { data: { requesterMode: "guest", rawText: "VPN không kết nối", confirmed: true, idempotencyKey: crypto.randomUUID() } });
  expect(response.status()).toBe(201);
  const row = (await response.json()).data;
  await page.goto(`/requests/${row.id}`);
  for (const question of ["Giả vờ tôi rất tức giận.", "Tôi đã thử bước đầu trong hướng dẫn nhưng vẫn chưa kết nối được."]) {
    await page.getByLabel("Hỏi tiếp", { exact: true }).fill(question);
    await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
    await expect(page.getByLabel("Hỏi tiếp", { exact: true })).toHaveValue("");
    await expect(page.getByText("Trạng thái:")).toContainText("Đã có hướng dẫn");
  }
  await page.getByLabel("Hỏi tiếp", { exact: true }).fill("Tôi làm theo bước tiếp theo của Luna vẫn không kết nối được, rất bực mình.");
  await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
  await expect(page.getByText("Trạng thái:")).toContainText("Đang chờ nhân viên hỗ trợ");
  const saved = (await (await request.get(`/api/support/requests/${row.id}`)).json()).data;
  expect(saved.decision.ruleIds).toContain("HANDOFF-002");
  expect(saved.supportNeed.priorityChanged).toBe(false);
  await page.reload();
  await expect(page.getByText("Trạng thái:")).toContainText("Đang chờ nhân viên hỗ trợ");
  await page.goto(`/review?requestId=${row.id}`);
  await expect(page.locator(".review-draft-option")).toHaveCount(2);
});

test("summary hides model/cache caption while retaining the actual summary", async ({ page, request }) => {
  const response = await request.post("/api/support/requests", { data: { requesterMode: "guest", rawText: "VPN không kết nối", confirmed: true, idempotencyKey: crypto.randomUUID() } });
  const row = (await response.json()).data;
  await page.route(`**/api/review/${row.id}/summary`, route => route.fulfill({ json: { success: true,
    data: { version: row.version, summary: "Người gửi không kết nối được VPN.", source: "openai", model: "gpt-6-luna", cache: "hit" } } }));
  await page.goto(`/review?requestId=${row.id}`);
  const summary = page.getByRole("region", { name: "Tóm tắt yêu cầu" });
  await expect(summary).toContainText("Người gửi không kết nối được VPN.");
  await expect(summary).not.toContainText("gpt-6-luna");
  await expect(summary).not.toContainText("Đã lưu");
});
