import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { prepareInput, completeAnalysis, submitSupport } from "@/services/support";
import { clarifySupport, feedbackSupport } from "@/services/review";
import { continueConversation } from "@/services/conversation";
import { extractIntake } from "@/domain/text";
import { explicitFeedbackChoice } from "@/domain/feedback";
import { ModelFailure, type ModelCall } from "@/lib/support-model";
import { resetSupportTestStore, getSupportRequest } from "@/lib/support-repository";

const printer = "Máy in văn phòng báo kẹt giấy. Tôi nên kiểm tra gì trước?";
const vpn = "VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.";
const input = (rawText: string) => prepareInput({ rawText, requesterMode: "guest", confirmed: true, idempotencyKey: crypto.randomUUID() }).input;
const facts = (rawText: string) => {
  const { model: _m, redactions: _r, subrequests: _s, ...result } = extractIntake(input(rawText));
  void _m; void _r; void _s;
  return result;
};
beforeEach(() => { vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("AI_WEB_SEARCH", "false"); resetSupportTestStore(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([printer, vpn, "DNS là gì? Hãy giải thích ngắn gọn."])("uses a reviewed fallback after exactly one rejected credential: %s", async rawText => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("AI_WEB_SEARCH", "true");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const run = vi.fn(async () => { throw new ModelFailure("MODEL_UNAVAILABLE", "AUTHENTICATION"); });
  const safe = prepareInput(input(rawText));
  const result = await completeAnalysis(safe.input, safe.markers, { run });
  expect(result.decision.action).toBe("AUTO_APPROVE");
  expect(result.canonical.model).toMatchObject({ source: "deterministic", fallbackReason: "AUTHENTICATION", attempts: 1 });
  expect(result.assistance).toMatchObject({ source: "deterministic", fallbackReason: "AUTHENTICATION" });
  if (rawText.startsWith("DNS")) expect(result.assistance?.answer?.text).toContain("địa chỉ IP");
  expect(run).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["REFUSAL", "EMPTY_RESPONSE"] as const)("does not turn rejected extraction into safe guidance: %s", async reason => {
  const result = await completeAnalysis(input(printer), [], { run: async () => { throw new ModelFailure("MODEL_UNAVAILABLE", reason); } });
  expect(result.decision.action).toBe("ESCALATE");
  expect(result.assistance).toBeNull();
});

it("discards every invalid prose field after valid extraction and records fallback in audit", async () => {
  const run = async (call: ModelCall) => call.purpose === "extraction" ? facts(vpn) : { summary: "UNTRUSTED_PROSE", stepIndexes: [99] };
  const row = await submitSupport(input(vpn), { run });
  expect(row.decision?.action).toBe("AUTO_APPROVE");
  expect(row.assistance[0]).toMatchObject({ source: "deterministic", fallbackReason: expect.stringContaining("MODEL_OUTPUT_INVALID") });
  expect(JSON.stringify(row.assistance)).not.toContain("UNTRUSTED_PROSE");
  expect(row.events.at(-1)).toMatchObject({ assistanceSource: "deterministic", fallbackReason: expect.stringContaining("MODEL_OUTPUT_INVALID") });
});

it("uses the same safe fallback when a clarification resolves missing information", async () => {
  const row = await submitSupport(input(vpn), { run: async () => ({ ...facts(vpn), ambiguities: ["Chưa rõ hiện tượng ngắt kết nối"] }) });
  expect(row.status).toBe("NEEDS_INFORMATION");
  const reply = "VPN bị ngắt kết nối liên tục.";
  const clarified = await clarifySupport(row.id, { version: row.version, rawText: reply }, {
    run: async call => call.purpose === "extraction" ? facts(`${vpn}\n${reply}`) : { invalid: true },
  });
  expect(clarified.status).toBe("AUTO_APPROVED");
  expect(clarified.originalQuestion).toBe(vpn);
  expect(clarified.assistance[0].fallbackReason).toContain("MODEL_OUTPUT_INVALID");
  expect(clarified.events.at(-1)?.action).toBe("CLARIFICATION");
});

it("uses vetted follow-up steps if optional prose fails during continued troubleshooting", async () => {
  const row = await submitSupport(input(vpn));
  const next = await feedbackSupport(row.id, { version: row.version, choice: "STILL_BROKEN" }, undefined, { run: async () => ({ invalid: true }) });
  expect(next.status).toBe("AUTO_APPROVED");
  expect(next.assistance).toHaveLength(2);
  expect(next.assistance[1]).toMatchObject({ source: "deterministic", fallbackReason: expect.stringContaining("MODEL_OUTPUT_INVALID") });
  expect(next.assistance[0]).toEqual(row.assistance[0]);
});

it("keeps original guidance and HANDOFF audit for the exact request for a human", async () => {
  const row = await submitSupport(input(printer));
  const reply = "Tôi chưa làm được, nhờ nhân viên hỗ trợ.";
  const next = await continueConversation(row.id, { version: row.version, question: reply });
  expect(next.status).toBe("ESCALATED");
  expect(next.originalQuestion).toBe(printer);
  expect(next.assistance).toEqual(row.assistance);
  expect(next.events.at(-1)?.action).toBe("HANDOFF");
  expect(next.feedback.at(-1)?.replyText).toBe(reply);
  expect((await getSupportRequest(row.id))?.events).toEqual(next.events);
  expect(explicitFeedbackChoice("Không cần nhờ nhân viên hỗ trợ.")).toBeNull();
  expect(explicitFeedbackChoice("Tôi nhớ nhân viên hỗ trợ nói rằng hãy chờ.")).toBeNull();
});

it("clarifies reset, then keeps history when the user chooses restart without data loss", async () => {
  const row = await submitSupport(input("Tôi muốn reset laptop."));
  expect(row.status).toBe("NEEDS_INFORMATION");
  expect(row.assistance).toHaveLength(0);
  const next = await clarifySupport(row.id, { version: row.version, rawText: "Chỉ khởi động lại máy và giữ dữ liệu." });
  expect(next.status).toBe("AUTO_APPROVED");
  expect(next.canonical?.intentLabel).toBe("DEVICE_RESTART_GUIDANCE");
  expect(next.originalQuestion).toBe("Tôi muốn reset laptop.");
  expect(next.events.at(-1)?.action).toBe("CLARIFICATION");
});
