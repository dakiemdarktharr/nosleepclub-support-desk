import type { Page } from "@playwright/test";

export const employeeIdentity = {
  fields: { department: "engineering", employeeId: "EMP-E2E-001" },
};

export async function fillEmployeeIdentity(page: Page) {
  await page.getByLabel("Phòng ban", { exact: true }).selectOption("engineering");
  await page.getByLabel("Mã nhân viên", { exact: true }).fill("EMP-E2E-001");
}
