import jsQR from "jsqr";
import { expect, test } from "./fixtures";
import { employeeIdentity } from "./intake-helpers";

test("QR decodes to the role picker and URL can be copied from any page", async ({ page, context }, info) => {
  await page.goto("/review?requestId=00000000-0000-4000-8000-000000000000#private-detail");
  await page.getByRole("button", { name: "URL / QR", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Mở website trên điện thoại" });
  await expect(dialog).toBeVisible();
  const pixels = await dialog.locator("canvas").evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("QR must be a canvas");
    const image = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    return { data: Array.from(image.data), width: image.width, height: image.height };
  });
  const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
  expect(decoded?.data).toBe("http://127.0.0.1:3227/");
  await expect(dialog.getByLabel("URL website")).toHaveValue(decoded!.data);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await dialog.getByRole("button", { name: "Sao chép URL", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Đã sao chép liên kết.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(decoded!.data);
  await page.screenshot({ path: `artifacts/site-qr-${info.project.name}.png` });
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "URL / QR", exact: true })).toBeFocused();
  // A scan opens a fresh tab with no guide flags, as on another device.
  const scanned = await context.newPage();
  await scanned.goto(decoded!.data);
  await expect(scanned.getByRole("heading", { name: "Đăng nhập", exact: true })).toBeVisible();
  await expect(scanned.getByRole("link", { name: "Tôi cần hỗ trợ", exact: true })).toBeVisible();
  await expect(scanned.getByRole("link", { name: "Dành cho nhân viên", exact: true })).toBeVisible();
});

test("pages and QR dialog fit narrow phones and landscape without horizontal scrolling", async ({ page, request }) => {
  test.setTimeout(120_000);
  const response = await request.post("/api/support/requests", { data: {
    ...employeeIdentity, rawText: "VPN không kết nối", mode: "freeform", serviceGroup: "NETWORK_VPN", confirmed: true, idempotencyKey: crypto.randomUUID(),
  } });
  expect(response.ok()).toBe(true);
  const { data: row } = await response.json();
  const routes = ["/", "/send-help", "/workspace", "/track", "/review", `/review?requestId=${row.id}`, `/requests/${row.id}`, "/audit", "/verify"];
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${route} fits ${viewport.width}px` }).toBe(true);
    }
    await page.getByRole("button", { name: "URL / QR", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Mở website trên điện thoại" });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.height).toBeLessThanOrEqual(viewport.height);
    await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
});
