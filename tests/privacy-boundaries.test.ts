import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { redact } from "@/domain/redaction";
import { prepareInput, submitSupport } from "@/services/support";
import { clarifySupport, reviewSupport } from "@/services/review";
import { continueConversation } from "@/services/conversation";
import { getSupportRequest, resetSupportTestStore } from "@/lib/support-repository";
import * as model from "@/lib/support-model";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("AI_MAX_ATTEMPTS", "0");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const input = (rawText: string) => ({ rawText, fields: { department: "engineering", employeeId: "EMP-TEST-01" }, confirmed: true, idempotencyKey: crypto.randomUUID() });
const hidden = "SYNTHETIC_HIDDEN_987";

it.each(["client_secret", "access_token", "refresh_token", "aws_session_token", "private_key"])("masks JSON %s before model extraction, stored input and audit", async (key) => {
  const extraction = vi.spyOn(model, "extractWithModel");
  const request = await submitSupport(input(`VPN lỗi; {"${key}":"${hidden}"}`));
  expect(extraction).toHaveBeenCalled();
  expect(JSON.stringify(extraction.mock.calls)).not.toContain(hidden);
  expect(JSON.stringify(await getSupportRequest(request.id))).not.toContain(hidden);
  expect(request.input.rawText).toContain("[REDACTED]");
  expect(request.events.length).toBeGreaterThan(0);
});
it("uses employee code for record lookup only and excludes it from model facts", async () => {
  const extraction = vi.spyOn(model, "extractWithModel");
  const request = await submitSupport(input("An unusual internal tool is not responding"));
  expect(extraction).toHaveBeenCalled();
  expect(extraction.mock.calls[0][0].fields).not.toHaveProperty("employeeId");
  expect(extraction.mock.calls[0][0].fields).not.toHaveProperty("department");
  expect(request.input.fields.employeeId).toBe("emp-test-01");
  expect(request.canonical?.entities).not.toHaveProperty("employeeId");
  expect(request.canonical?.entities).not.toHaveProperty("department");
});
it("normalizes decomposed/fullwidth labels and zero-width characters before masking", () => {
  for (const text of [`mật khẩu: ${hidden}`.normalize("NFD"), `ｔｏｋｅｎ: ${hidden}`, `client_\u200bsecret: ${hidden}`]) {
    expect(redact(text).text).not.toContain(hidden);
  }
});
it.each([
  ["CCCD: 000000000000", "000000000000", "LABELED_IDENTITY_NUMBER"],
  ["căn cước công dân là 000000000000", "000000000000", "LABELED_IDENTITY_NUMBER"],
  ["số điện thoại: 090 000 0000", "090 000 0000", "LABELED_PHONE_NUMBER"],
  ["phone number = +84 90-000-0000", "+84 90-000-0000", "LABELED_PHONE_NUMBER"],
])("masks explicitly labelled synthetic identifiers: %s", (text, value, marker) => {
  const safe = prepareInput({ ...input(text), fields: { department: "engineering", employeeId: "EMP-TEST-01", reason: text } });
  expect(JSON.stringify(safe.input)).not.toContain(value);
  expect(safe.markers).toContain(marker);
});
it.each(["ticket 000000000000", "CCCD: 0000000000000", "phone: 09000000000", "port 3227; RAM 16 GB", "password reset", "Nguyen Synthetic, score 8"])("does not claim broad PII masking or alter unrelated values: %s", (text) => {
  expect(redact(text).text).toBe(text);
});
it("masks clarification and reviewer reasons in persisted request/audit", async () => {
  const request = await submitSupport(input("Need database access"));
  expect(request.status).toBe("NEEDS_INFORMATION");
  const clarified = await clarifySupport(request.id, { version: request.version, rawText: `VPN lỗi; client_secret: ${hidden}` });
  const reviewed = await reviewSupport(request.id, { version: clarified.version, action: "STOP", reason: `Synthetic client_secret: ${hidden}` }, "public-demo-reviewer");
  expect(JSON.stringify(reviewed)).not.toContain(hidden);
  expect(JSON.stringify(await getSupportRequest(request.id))).not.toContain(hidden);
});
it("masks a follow-up before sentiment, analysis, feedback history and storage", async () => {
  const request = await submitSupport(input("How do I restart my laptop?"));
  expect(request.status).toBe("AUTO_APPROVED");
  const continued = await continueConversation(request.id, { version: request.version, question: `Vẫn lỗi, client_secret: ${hidden}` });
  expect(JSON.stringify(continued)).not.toContain(hidden);
  expect(JSON.stringify(await getSupportRequest(request.id))).not.toContain(hidden);
  expect(continued.status).not.toBe("COMPLETED");
});
