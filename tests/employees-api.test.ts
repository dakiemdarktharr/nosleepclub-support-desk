import { afterEach, expect, it, vi } from "vitest";
import * as employees from "@/domain/employees";
import { GET } from "@/app/api/employees/route";
import { checkAuthorityLevel } from "@/lib/employee-rbac";

afterEach(() => vi.restoreAllMocks());
const request = (id?: string) => new Request("http://localhost/api/employees", { headers: id ? { "X-Employee-ID": id } : {} });
it("validates explicitly synthetic directory profiles and enforces level 21", async () => {
  const rows = employees.getEmployees();
  expect(rows).toHaveLength(36);
  expect(rows.map((employee) => employee.level)).toEqual(
    expect.arrayContaining([0, 20, 21, 36]),
  );
  for (const employee of rows) {
    expect(employee.name).toMatch(/^Synthetic Demo \d{2}$/);
    expect(employee.title).toMatch(/^Synthetic role \d{2}$/);
    expect(employee.department).toMatch(/^Synthetic unit \d{2}$/);
    expect(employee.id).toBe(employees.generateEmployeeId(employee.name));
    const response = GET(request(employee.id.toUpperCase()));
    expect(response.status).toBe(employee.level >= 21 ? 200 : 403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    if (employee.level >= 21) expect(body.data).toHaveLength(rows.length);
    else expect(body).not.toHaveProperty("data");
  }
});
it("rejects absent or unknown mock identity without returning the directory", async () => {
  for (const id of [undefined, "synthetic_unknown_employee"]) {
    const response = GET(request(id));
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("data");
  }
});
it("does not echo filesystem/parser exception details to response or logs", async () => {
  vi.spyOn(employees, "getEmployees").mockImplementation(() => { throw new Error("SYNTHETIC_PRIVATE_DIRECTORY_DETAILS"); });
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = GET(request("synthetic"));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("SYNTHETIC_PRIVATE_DIRECTORY_DETAILS");
  expect(JSON.stringify(logger.mock.calls)).not.toContain("SYNTHETIC_PRIVATE_DIRECTORY_DETAILS");
});
it("rejects invalid authority thresholds instead of creating permissive guards", () => {
  for (const level of [-1, 37, 1.5, NaN, Infinity]) expect(() => checkAuthorityLevel(level)).toThrow(RangeError);
});
