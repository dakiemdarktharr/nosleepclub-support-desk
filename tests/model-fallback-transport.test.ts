import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { callModel, createAssistanceWithFallback, extractWithModel, ModelFailure, type ModelCallTrace } from "@/lib/support-model";
import { extractIntake } from "@/domain/text";
import type { SupportInput } from "@/domain/contracts";

const reserve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/support-repository", () => ({ reserveModelAttemptForModel: reserve }));

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("AI_MODEL", "synthetic-test-model");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-unused-key");
  reserve.mockReset().mockResolvedValue(true);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const call = { purpose: "extraction" as const, model: "synthetic-test-model", instructions: "Return JSON.", data: "Synthetic input" };
const response = (status: number, content = "{}") => new Response(JSON.stringify(status === 200
  ? { choices: [{ finish_reason: "stop", message: { content } }] }
  : { error: { message: "upstream-private-detail", type: "api_error" } }),
{ status, headers: { "content-type": "application/json" } });

it.each([429, 500, 503])("retries HTTP %i once with the same configured model and records safe diagnostics", async status => {
  const transport = vi.fn().mockResolvedValueOnce(response(status)).mockResolvedValueOnce(response(200));
  vi.stubGlobal("fetch", transport);
  const traces: ModelCallTrace[] = [];
  await expect(callModel(call, {}, { onModelCall: trace => traces.push(trace) })).resolves.toBe("{}");
  expect(transport).toHaveBeenCalledTimes(2);
  expect(reserve).toHaveBeenCalledTimes(2);
  for (const [, init] of transport.mock.calls) expect(JSON.parse(String(init.body)).model).toBe(call.model);
  expect(traces).toEqual([{ model: call.model, attempts: 2, latencyMs: expect.any(Number),
    fallbackReason: status === 429 ? "RETRY_RATE_LIMIT" : "RETRY_UPSTREAM_ERROR" }]);
  expect(JSON.stringify(traces)).not.toMatch(/upstream-private-detail|synthetic-unused-key/);
});

it.each([400, 401, 403, 404])("never retries non-transient HTTP %i", async status => {
  const transport = vi.fn(async () => response(status));
  vi.stubGlobal("fetch", transport);
  await expect(callModel(call, {})).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE",
    reason: status === 401 ? "AUTHENTICATION" : "UPSTREAM_ERROR" });
  expect(transport).toHaveBeenCalledOnce();
  expect(reserve).toHaveBeenCalledOnce();
});

it("stops after the second transient failure and accounts for both attempts", async () => {
  const transport = vi.fn(async () => response(503));
  vi.stubGlobal("fetch", transport);
  await expect(callModel(call, {})).rejects.toMatchObject({ reason: "UPSTREAM_ERROR" });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(reserve).toHaveBeenCalledTimes(2);
});

it("retries a transient timeout once within the same model call budget", async () => {
  const run = vi.fn().mockRejectedValueOnce(new ModelFailure("MODEL_UNAVAILABLE", "TIMEOUT")).mockResolvedValueOnce({});
  const trace = vi.fn();
  await expect(callModel(call, {}, { run, onModelCall: trace })).resolves.toEqual({});
  expect(run).toHaveBeenCalledTimes(2);
  expect(trace).toHaveBeenCalledWith(expect.objectContaining({ attempts: 2, fallbackReason: "RETRY_TIMEOUT" }));
});

it("allows a nine-second first inference to finish without cutting it short for a retry", async () => {
  vi.useFakeTimers();
  const run = vi.fn(() => new Promise(resolve => setTimeout(() => resolve({ valid: true }), 9000)));
  const trace = vi.fn();
  const pending = callModel(call, {}, { run, onModelCall: trace });
  await vi.advanceTimersByTimeAsync(9000);
  await expect(pending).resolves.toEqual({ valid: true });
  expect(run).toHaveBeenCalledOnce();
  expect(trace).toHaveBeenCalledWith({ model: call.model, attempts: 1, latencyMs: 9000 });
});

it("uses the full twelve-second deadline then falls back without another doomed timeout attempt", async () => {
  vi.useFakeTimers();
  const run = vi.fn(() => new Promise<never>(() => {}));
  const pending = callModel(call, {}, { run });
  const rejected = expect(pending).rejects.toMatchObject({ reason: "TIMEOUT" });
  await vi.advanceTimersByTimeAsync(12000);
  await rejected;
  expect(run).toHaveBeenCalledOnce();
});

it("does not retry when the per-model attempt budget rejects the next attempt", async () => {
  reserve.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const transport = vi.fn(async () => response(429));
  vi.stubGlobal("fetch", transport);
  await expect(callModel(call, {})).rejects.toMatchObject({ reason: "BUDGET_EXHAUSTED" });
  expect(transport).toHaveBeenCalledOnce();
  expect(reserve).toHaveBeenCalledTimes(2);
});

it("never changes model or retries a provider safety refusal", async () => {
  const transport = vi.fn(async () => new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { refusal: "Provider declined the request" } }],
  }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", transport);
  await expect(callModel(call, {})).rejects.toMatchObject({ reason: "REFUSAL" });
  expect(transport).toHaveBeenCalledOnce();
});

it("requires the strict wire contract on real transport even when a legacy object satisfies the old domain schema", async () => {
  const input: SupportInput = { mode: "freeform", serviceGroup: "OTHER", rawText: "Máy in bị kẹt giấy", fields: {}, confirmed: false, idempotencyKey: "synthetic" };
  const baseline = extractIntake(input);
  const { subrequests: _sub, model: _model, redactions: _redactions, ...legacy } = baseline;
  void _sub; void _model; void _redactions;
  const transport = vi.fn(async () => response(200, JSON.stringify(legacy)));
  vi.stubGlobal("fetch", transport);
  const result = await extractWithModel(input, baseline);
  expect(result.model).toMatchObject({ failure: "MODEL_OUTPUT_INVALID", failureReason: "SCHEMA_INVALID", model: call.model, attempts: 1 });
  expect(transport).toHaveBeenCalledOnce();
});

it("discards invalid optional prose completely and records its actual attempt", async () => {
  const request = extractIntake({ mode: "freeform", serviceGroup: "OTHER", rawText: "VPN không kết nối", fields: {}, confirmed: false, idempotencyKey: "synthetic" });
  const transport = vi.fn(async () => response(200, "{malformed JSON"));
  vi.stubGlobal("fetch", transport);
  const result = await createAssistanceWithFallback(request, true);
  expect(result).toMatchObject({ source: "deterministic", fallbackReason: "MODEL_OUTPUT_INVALID",
    model: { source: "openai", model: call.model, attempts: 1, failure: "MODEL_OUTPUT_INVALID", latencyMs: expect.any(Number) } });
  expect(result.stepByStepInstructions).toHaveLength(4);
  expect(result.stepExplanations).toBeUndefined();
  expect(transport).toHaveBeenCalledOnce();
});

it("does not treat a provider refusal or a risky canonical request as eligible prose fallback", async () => {
  const request = extractIntake({ mode: "freeform", serviceGroup: "OTHER", rawText: "VPN không kết nối", fields: {}, confirmed: false, idempotencyKey: "synthetic" });
  await expect(createAssistanceWithFallback(request, true, { run: async () => {
    throw new ModelFailure("MODEL_UNAVAILABLE", "REFUSAL");
  } })).rejects.toMatchObject({ reason: "REFUSAL" });
  await expect(createAssistanceWithFallback({ ...request, riskSignals: ["SECURITY_CONTROL"] }, true, { run: async () => "invalid JSON" }))
    .rejects.toMatchObject({ code: "MODEL_OUTPUT_INVALID" });
});
