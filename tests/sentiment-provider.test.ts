import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyzeSupportSentiment } from "@/lib/feedback-model";

const budget = vi.hoisted(() => vi.fn());
vi.mock("@/lib/support-repository", () => ({ reserveModelAttempt: budget }));

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("AI_MODEL", "gpt-6-luna");
  vi.stubEnv("AI_CONVERSATION_MODEL", "");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
  budget.mockReset().mockResolvedValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(["support-request", "post-answer"] as const)("sends Luna's bounded non-reasoning JSON request for %s", async context => {
  const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "gpt-6-luna", reasoning_effort: "none", store: false, max_completion_tokens: 128 });
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
      sentiment: "negative", evidence: "bực mình", explanation: "Bạn thể hiện sự bực mình.",
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", transport);
  expect(await analyzeSupportSentiment("Chờ lâu nên bực mình", context)).toMatchObject({ source: "model", model: "gpt-6-luna", sentiment: "negative" });
  expect(transport).toHaveBeenCalledOnce();
  expect(budget).toHaveBeenCalledOnce();
});

it.each([[401, "AUTHENTICATION"], [429, "RATE_LIMIT"], [500, "MODEL_UNAVAILABLE"]] as const)("exposes safe fallback diagnostics for HTTP %i without retry or upstream body", async (status, reason) => {
  const transport = vi.fn(async () => new Response(JSON.stringify({ error: { message: "private-upstream-detail", type: "api_error" } }), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", transport);
  const result = await analyzeSupportSentiment("Tôi bực mình vì phải chờ", "support-request");
  expect(result).toMatchObject({ source: "rule-based", model: "gpt-6-luna", fallbackReason: reason });
  expect(JSON.stringify(result)).not.toContain("private-upstream-detail");
  expect(JSON.stringify(result)).not.toContain("synthetic-test-key");
  expect(transport).toHaveBeenCalledOnce();
});

it("does not call the provider when the shared daily budget is exhausted", async () => {
  budget.mockResolvedValue(false);
  const transport = vi.fn(); vi.stubGlobal("fetch", transport);
  expect(await analyzeSupportSentiment("Tôi bực mình", "support-request")).toMatchObject({ source: "rule-based", fallbackReason: "BUDGET_EXHAUSTED" });
  expect(transport).not.toHaveBeenCalled();
});

it("distinguishes an offline mock from a missing API key", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  expect(await analyzeSupportSentiment("VPN lỗi", "support-request")).toMatchObject({ fallbackReason: "NOT_CONFIGURED" });
  vi.stubEnv("AI_PROVIDER", "mock");
  expect(await analyzeSupportSentiment("VPN lỗi", "support-request")).toMatchObject({ fallbackReason: "MOCK_PROVIDER" });
  expect(budget).not.toHaveBeenCalled();
});
