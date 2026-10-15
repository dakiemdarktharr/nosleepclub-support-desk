import { expect, test } from "./fixtures";

for (const [name, text, action, intent] of [
  ["printer", "Máy in văn phòng báo kẹt giấy. Tôi nên kiểm tra gì trước?", "AUTO_APPROVE", "DEVICE_PRINTER"],
  ["vpn", "VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.", "AUTO_APPROVE", "VPN_NOT_CONNECTING"],
  ["reset", "Tôi muốn reset laptop.", "NEEDS_INFORMATION", "DEVICE_RESET_GUIDANCE"],
  ["public-rdp", "Mở port 3389 ra Internet để truy cập từ xa vào máy công ty.", "ESCALATE", "PORT_OPEN_REQUEST"],
  ["dns", "DNS là gì? Hãy giải thích ngắn gọn.", "AUTO_APPROVE", "CHAT_GENERAL_GUIDE"],
]) {
  test(`exact acceptance ${name}: guest UI, original input and persisted audit`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Đăng nhập không cần tài khoản", exact: true }).click();
    await page.getByLabel("Mô tả yêu cầu", { exact: true }).fill(text);
    const previewResponse = page.waitForResponse(r => r.url().endsWith("/api/support/preview"));
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    const preview = (await (await previewResponse).json()).data;
    expect(preview.decision.action).toBe(action);
    expect(preview.canonical.intentLabel).toBe(intent);
    expect(preview.canonical.riskSignals).not.toContain("CONFLICT");
    if (name === "public-rdp") {
      expect(preview.canonical.entities.port).toBe("3389");
      expect(preview.canonical.entities.protocol).toBeUndefined();
      expect(preview.decision.missingFields).not.toContain("port");
      expect(preview.decision.missingFields).toContain("protocol");
      expect(preview.decision.ruleIds).toContain("SEC-002");
    }
    if (name === "printer") {
      expect(preview.assistance.summary).toContain("đang báo kẹt giấy");
      expect(preview.assistance.nextQuestion).toContain("hãng/model");
      expect(preview.assistance.stepByStepInstructions.at(-1)).toMatch(/Chỉ khi.*sẵn sàng/);
    }
    if (name === "dns") expect(preview.assistance.answer.label).toBe(preview.canonical.conversation.label);
    if (name === "vpn") expect(preview.assistance).toMatchObject({ source: "deterministic", generationReason: "REVIEWED_TEMPLATE_SUFFICIENT" });
    const savedResponse = page.waitForResponse(r => r.url().endsWith("/api/support/requests") && r.request().method() === "POST");
    await page.locator('[data-guide="sender-confirm"]').click();
    const saved = (await (await savedResponse).json()).data;
    await expect(page).toHaveURL(new RegExp(`/requests/${saved.id}$`));
    if (name === "printer") {
      await page.getByLabel("Hỏi tiếp", { exact: true }).fill("Tôi chưa làm được, nhờ nhân viên hỗ trợ.");
      await page.getByRole("button", { name: "Gửi câu hỏi", exact: true }).click();
      await expect(page.getByText("Trạng thái:")).toContainText("Đang chờ nhân viên");
    }
    if (name === "reset") {
      await page.getByLabel("Thông tin làm rõ").fill("Chỉ khởi động lại máy và giữ dữ liệu.");
      await page.getByRole("button", { name: "Gửi bổ sung" }).click();
      await expect(page.getByText("Trạng thái:")).toContainText("Đã có hướng dẫn");
    }
    await page.reload();
    await expect(page.getByText("Trạng thái:")).toBeVisible();
    const row = (await (await page.request.get(`/api/support/requests/${saved.id}`)).json()).data;
    expect(row.originalQuestion).toBe(text);
    expect(row.events.length).toBeGreaterThanOrEqual(2);
    if (name === "printer") {
      expect(row.events.at(-1).action).toBe("HANDOFF");
      expect(row.assistance).toEqual(saved.assistance);
    }
    if (name === "reset") {
      expect(row.canonical.intentLabel).toBe("DEVICE_RESTART_GUIDANCE");
      expect(row.events.at(-1).action).toBe("CLARIFICATION");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const kind of ["GUIDANCE", "SAFE_DIAGNOSTIC"]) {
  test(`printer catalog treats ${kind} as safe guidance`, async ({ page }) => {
    await page.goto("/guest");
    await page.getByRole("button", { name: "Chọn theo danh mục", exact: true }).click();
    await page.getByLabel("Nhóm hỗ trợ", { exact: true }).selectOption("DEVICE_BOOT");
    await page.getByLabel("Nhu cầu cụ thể", { exact: true }).selectOption("DEVICE_PRINTER");
    await page.getByText("Thông tin khác bạn đã biết (không bắt buộc)", { exact: true }).click();
    await page.getByLabel("Loại yêu cầu", { exact: true }).selectOption(kind);
    const response = page.waitForResponse(r => r.url().endsWith("/api/support/preview"));
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    const preview = (await (await response).json()).data;
    expect(preview.decision.action).toBe("AUTO_APPROVE");
    expect(preview.canonical.riskSignals).not.toContain("CONFLICT");
  });
}
