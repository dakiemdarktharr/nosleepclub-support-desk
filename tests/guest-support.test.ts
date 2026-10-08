import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as preview } from "@/app/api/support/preview/route";
import { POST as submit } from "@/app/api/support/requests/route";
import { resetSupportTestStore, getSupportRequest } from "@/lib/support-repository";
import { continueConversation } from "@/services/conversation";
import { identityCookie } from "@/lib/identity-auth";
import { GET as employees } from "@/app/api/employees/route";
import { supportInputSchema } from "@/domain/input";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("AI_MAX_ATTEMPTS", "0");
  vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("IDENTITY_MONGODB_URI", "");
  vi.stubEnv("IDENTITY_MONGODB_DB", ""); resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const input = (rawText = "VPN không kết nối") => ({ requesterMode: "guest", rawText, idempotencyKey: crypto.randomUUID() });
const request = (body: unknown) => new Request("http://localhost/api/support/requests", {
  method: "POST", headers: { "content-type": "application/json", cookie: `${identityCookie}=${"a".repeat(64)}` }, body: JSON.stringify(body),
});
it("guest preview, confirmed save and readback work without Mongo, employee fields or a usable identity cookie", async () => {
  const response = await preview(request(input()));
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(data.decision.action).toBe("AUTO_APPROVE");
  expect(data.input.fields).toEqual({});
  const saved = await submit(request({ ...data.input, confirmed: true }));
  expect(saved.status).toBe(201);
  const row = (await saved.json()).data;
  expect(row.input.requesterMode).toBe("guest");
  expect(row.events.some((event: { actor: string }) => event.actor === "guest")).toBe(true);
  expect(row.events.some((event: { actor: string }) => event.actor === "employee-demo")).toBe(false);
  expect((await getSupportRequest(row.id))?.input).toEqual(row.input);
  const next = await continueConversation(row.id, { version: row.version, question: "Tắt MFA để đăng nhập" });
  expect(next.input.requesterMode).toBe("guest");
  expect(next.decision?.action).toBe("ESCALATE");
});
it.each(["Tắt MFA để đăng nhập", "Open port 3389 public", "Cấp quyền root production"])("guest still escalates sensitive input: %s", async rawText => {
  const response = await preview(request(input(rawText)));
  expect(response.status).toBe(200);
  expect((await response.json()).data.decision.action).toBe("ESCALATE");
});
it("guest input cannot claim employee metadata or Verify authority", () => {
  const parsed = supportInputSchema.parse({ ...input(), fields: { employeeId: "synthetic-admin", department: "it" } });
  expect(parsed.fields).toEqual({});
  expect(supportInputSchema.safeParse({ ...input(), verifyRunId: crypto.randomUUID(), verifyCaseId: "synthetic" }).success).toBe(false);
});
it("guest cannot bypass confirmation or gain employee directory access", async () => {
  const response = await submit(request(input()));
  expect(response.status).toBe(422);
  expect((await response.json()).error.code).toBe("CONFIRMATION_REQUIRED");
  const directory = await employees(new Request("http://localhost/api/employees", { headers: { "x-employee-id": "guest" } }));
  expect(directory.status).toBe(401);
});
