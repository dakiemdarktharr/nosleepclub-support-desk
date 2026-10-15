import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareInput, completeAnalysis } from "@/services/support";
import { extractIntake } from "@/domain/text";
import { reviewedGuideAnswers } from "@/lib/reviewed-guidance";
import { callModel, type ModelCall } from "@/lib/support-model";
import { withSupportMeasurements, supportMeasurements, measureSupportStage } from "@/lib/support-telemetry";
import { POST } from "@/app/api/support/preview/route";
import { resetSupportTestStore } from "@/lib/support-repository";
import * as repository from "@/lib/support-repository";

const vpn = "VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.";
const input = (rawText: string) => prepareInput({ requesterMode: "guest", rawText, idempotencyKey: crypto.randomUUID() }).input;
beforeEach(() => { vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); resetSupportTestStore(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("uses the complete reviewed VPN guide after validated extraction without a paraphrase call", async () => {
  const data = input(vpn);
  const { model: _m, redactions: _r, subrequests: _s, ...facts } = extractIntake(data);
  void _m; void _r; void _s;
  const run = vi.fn(async (call: ModelCall) => {
    expect(call.purpose).toBe("extraction");
    return facts;
  });
  const result = await completeAnalysis(data, [], { run });
  expect(run).toHaveBeenCalledTimes(1);
  expect(result.decision.action).toBe("AUTO_APPROVE");
  expect(result.assistance).toMatchObject({ source: "deterministic", generationReason: "REVIEWED_TEMPLATE_SUFFICIENT" });
  expect(result.assistance?.fallbackReason).toBeUndefined();
  expect(result.assistance?.stepByStepInstructions).toHaveLength(4);
  expect(JSON.stringify(result.assistance)).toMatch(/MFA.*firewall/);
  expect(result.assistance?.nextQuestion).toMatch(/mã lỗi/);
});

it.each([
  `${vpn} Tại sao lại xảy ra như vậy?`,
  `${vpn} Hãy giải thích chi tiết từng bước.`,
  `${vpn} So sánh với lỗi DNS.`,
  `${vpn} Cấp quyền admin cho tôi.`,
  `${vpn} Tắt MFA giúp tôi.`,
])("does not skip a new question, details or authority checks: %s", rawText => {
  const data = input(rawText);
  expect(reviewedGuideAnswers(data, extractIntake(data))).toBe(false);
});
it("keeps the enrichment path for follow-up rounds", () => {
  const data = input(vpn);
  expect(reviewedGuideAnswers(data, extractIntake(data), 1)).toBe(false);
});
it("still rejects invalid extraction even though a reviewed template exists", async () => {
  const result = await completeAnalysis(input(vpn), [], { run: async () => ({ invalid: true }) });
  expect(result.decision.action).toBe("ESCALATE");
  expect(result.assistance).toBeNull();
});
it("returns request-only telemetry after required validation/auth with no user text", async () => {
  const response = await POST(new Request("http://localhost/api/support/preview", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "telemetry-test" },
    body: JSON.stringify({ requesterMode: "guest", rawText: vpn, idempotencyKey: crypto.randomUUID() }),
  }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.data.diagnostics).toMatchObject({ version: 1, coldStart: "unknown", answerCache: "not_applicable", modelCalls: [] });
  for (const stage of ["validationAuth", "inputValidation", "extraction", "policy", "persistence"])
    expect(body.data.diagnostics.stagesMs[stage]).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(body.data.diagnostics)).not.toContain(vpn);
  expect(response.headers.get("server-timing")).toContain("total;dur=");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("isolates concurrent measurements and never includes prompts or keys", async () => {
  const call = { purpose: "extraction" as const, instructions: "PRIVATE_INSTRUCTIONS", data: "PRIVATE_DATA", model: "synthetic-model" };
  const [a, b] = await Promise.all([1, 2].map(count => withSupportMeasurements(async () => {
    for (let i = 0; i < count; i++) await callModel(call, {}, { run: async () => ({}) });
    await measureSupportStage("outputValidation", async () => ({}));
    return supportMeasurements()!;
  })));
  expect(a.modelCalls).toHaveLength(1);
  expect(b.modelCalls).toHaveLength(2);
  expect(JSON.stringify([a, b])).not.toMatch(/PRIVATE/);
  expect(supportMeasurements()).toBeUndefined();
});
it("records actual token counts and usage on a provider response", async () => {
  // HTTP is fully stubbed below. Do not depend on or lift CI's zero-live-call
  // guard to exercise provider response parsing and token accounting.
  const reserve = vi.spyOn(repository, "reserveModelAttemptForModel").mockResolvedValue(true);
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-telemetry-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: "{}" } }],
    usage: { prompt_tokens: 234, completion_tokens: 23, prompt_tokens_details: { cached_tokens: 128 } },
  }), { status: 200, headers: { "content-type": "application/json" } })));
  await withSupportMeasurements(async () => {
    await callModel({ purpose: "extraction", instructions: "test", data: "test", model: "gpt-6-luna" }, {});
    expect(supportMeasurements()?.modelCalls[0]).toMatchObject({ attempts: 1,
      usage: { inputTokens: 234, outputTokens: 23, cachedInputTokens: 128 } });
    expect(reserve).toHaveBeenCalledOnce();
  });
});
