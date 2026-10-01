import { test, expect } from "./fixtures";
import { getEmployees } from "../../src/domain/employees";

test("built employee API serves the mock directory only at the declared management level", async ({ request }) => {
  const rows = getEmployees();
  expect((await request.get("/api/employees")).status()).toBe(401);
  for (const level of ["below", "management"] as const) {
    const employee = rows.find((row) => level === "below" ? row.level < 21 : row.level >= 21)!;
    const response = await request.get("/api/employees", { headers: { "X-Employee-ID": employee.id } });
    expect(response.status()).toBe(level === "below" ? 403 : 200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    if (level === "management") expect((await response.json()).data).toHaveLength(rows.length);
  }
});
