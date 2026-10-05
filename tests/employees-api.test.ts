import { beforeEach, expect, it, vi } from "vitest";
import { getEmployees, generateEmployeeId } from "@/domain/employees";
import { GET } from "@/app/api/employees/route";
import { SupportError } from "@/lib/support-repository";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), store: vi.fn() }));
vi.mock("@/lib/identity-auth", () => ({ requireIdentitySession: mocks.auth }));
vi.mock("@/lib/identity-store", () => ({ identityStore: mocks.store }));
beforeEach(() => vi.resetAllMocks());
it("retains 36 validated legacy fixtures without using them as runtime accounts", () => {
  const rows = getEmployees(); expect(rows).toHaveLength(36);
  expect(new Set(rows.map((row) => row.id)).size).toBe(36);
  for (const row of rows) expect(row.id).toBe(generateEmployeeId(row.name));
});
it("requires verified IT instead of trusting an ID header", async () => {
  mocks.auth.mockRejectedValue(new SupportError("AUTHENTICATION_REQUIRED", "Đăng nhập", 401));
  const response = await GET(new Request("http://localhost/api/employees", { headers: { "X-Employee-ID": "alphanvgl" } }));
  expect(response.status).toBe(401); expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), true);
  expect(mocks.store).not.toHaveBeenCalled(); expect(await response.json()).not.toHaveProperty("data");
});
it("returns Mongo directory without trusted delivery channels and never caches", async () => {
  mocks.auth.mockResolvedValue({ employee: { id: "operator" }, assurance: "verified" });
  const find = vi.fn().mockReturnValue({ sort: () => ({ limit: () => ({ toArray: async () => [{ id: "alphanvgl" }] }) }) });
  mocks.store.mockResolvedValue({ db: { collection: () => ({ find }) } });
  const response = await GET(new Request("http://localhost/api/employees"));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(find).toHaveBeenCalledWith({}, { projection: { _id: 0, verifiedChannel: 0 } });
});
it("redacts storage errors instead of reading CSV on failure", async () => {
  mocks.auth.mockResolvedValue({}); mocks.store.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_DB_URI"));
  const response = await GET(new Request("http://localhost/api/employees"));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("SYNTHETIC_PRIVATE_DB_URI");
});
