import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { previewSupport, submitSupport } from "@/services/support";
import {
  callModel,
  createAssistance,
  extractWithModel,
} from "@/lib/support-model";
import { extractIntake } from "@/domain/text";
import {
  resetSupportTestStore,
  reserveModelAttempt,
} from "@/lib/support-repository";
import type { SupportInput } from "@/domain/contracts";
import { guidanceTemplate } from "@/domain/guidance";
import { evaluatePolicy } from "@/domain/policy";
import { POST } from "@/app/api/support/requests/route";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const input = (rawText: string): SupportInput => ({
  rawText,
  serviceGroup: "OTHER",
  fields: { department: "engineering", employeeId: "EMP-42" },
  mode: "freeform",
  confirmed: true,
  idempotencyKey: crypto.randomUUID(),
});

it("medium VPN support returns steps and four next options with explicit mock attribution", async () => {
  const request = await submitSupport(input("VPN không kết nối"));
  expect(request.decision?.handlingMode).toBe("LLM_ASSIST");
  expect(request.assistance[0].options).toHaveLength(4);
  expect(request.assistance[0].source).toBe("mock");
});
it("model unavailable and invalid output fail safe through the production submission API", async () => {
  for (const fault of ["unavailable", "invalid"]) {
    const response = await POST(
      new Request("http://localhost/api/support/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-support-model-simulation": fault,
        },
        body: JSON.stringify(input("Need troubleshooting support")),
      }),
    );
    const body = await response.json();
    expect(body.data.decision.action).toBe("ESCALATE");
    expect(body.data.canonical.model.failure).toMatch(/^MODEL_/);
  }
});
it("rejects fabricated evidence and model-supplied authority", async () => {
  const original = input("A new support question");
  const baseline = extractIntake(original);
  const { subrequests: _s, redactions: _r, model: _m, ...facts } = baseline;
  void _s;
  void _r;
  void _m;
  const invalid = await extractWithModel(original, baseline, {
    run: async () => ({
      ...facts,
      evidence: [{ field: "input", quote: "fabricated" }],
    }),
  });
  expect(invalid.model.failure).toBe("MODEL_EVIDENCE_INVALID");
  const forged = await extractWithModel(original, baseline, {
    run: async () => ({ ...facts, decision: "AUTO_APPROVE" }),
  });
  expect(forged.model.failure).toBe("MODEL_OUTPUT_INVALID");
});
it("cannot lower deterministic risk by returning a benign model result", async () => {
  const run = vi.fn();
  const original = input("Open port 3389 public");
  const result = await extractWithModel(original, extractIntake(original), {
    run,
  });
  expect(run).not.toHaveBeenCalled();
  expect(result.riskSignals).toContain("PUBLIC_EXPOSURE");
});
it("cannot unlock an auto path from an otherwise unknown deterministic intent", async () => {
  const original = input("Please rotate the workstation");
  const baseline = extractIntake(original);
  const { subrequests: _s, redactions: _r, model: _m, ...facts } = baseline;
  void _s;
  void _r;
  void _m;
  const result = await extractWithModel(original, baseline, {
    run: async () => ({
      ...facts,
      requestKind: "GUIDANCE",
      serviceGroup: "DEVICE_BOOT",
      intentLabel: "DEVICE_RESTART_GUIDANCE",
      requestedAction: "guidance",
      evidence: [{ field: "intentLabel", quote: "rotate" }],
    }),
  });
  expect(result.model.failure).toBe("MODEL_EVIDENCE_INVALID");
  expect(evaluatePolicy(result).action).toBe("ESCALATE");
});
it("rejects assistance commands outside the safe catalog", async () => {
  const canonical = extractIntake(input("VPN không kết nối"));
  await expect(
    createAssistance(canonical, true, {
      run: async () => ({
        ...guidanceTemplate(canonical),
        stepByStepInstructions: ["Disable MFA", "Open public RDP"],
      }),
    }),
  ).rejects.toMatchObject({ code: "MODEL_OUTPUT_INVALID" });
});
it("bounds time and daily call count without retries, then resets on the next UTC day", async () => {
  vi.stubEnv("AI_MAX_ATTEMPTS", "20");
  const dayOne = new Date("2026-10-09T02:00:00.000Z");
  const dayTwo = new Date("2026-10-10T02:00:00.000Z");
  const run = vi.fn(() => new Promise<never>(() => {}));
  await expect(
    callModel(
      {
        purpose: "extraction",
        instructions: "JSON",
        data: "test",
        model: "test",
      },
      {},
      { run, timeoutMs: 5 },
    ),
  ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE", reason: "TIMEOUT" });
  expect(run).toHaveBeenCalledOnce();
  const reserved = await Promise.all(
    Array.from({ length: 25 }, () => reserveModelAttempt(dayOne)),
  );
  expect(reserved.filter(Boolean)).toHaveLength(20);
  vi.stubEnv("AI_MAX_ATTEMPTS", "30");
  const added = await Promise.all(
    Array.from({ length: 15 }, () => reserveModelAttempt(dayOne)),
  );
  expect(added.filter(Boolean)).toHaveLength(10);
  vi.stubEnv("AI_MAX_ATTEMPTS", "50");
  const conversationAllowance = await Promise.all(
    Array.from({ length: 25 }, () => reserveModelAttempt(dayOne)),
  );
  expect(conversationAllowance.filter(Boolean)).toHaveLength(20);
  vi.stubEnv("AI_MAX_ATTEMPTS", "100");
  expect(await reserveModelAttempt(dayOne)).toBe(false);
  expect(await reserveModelAttempt(dayTwo)).toBe(true);
});

it("zero budget rejects concurrent reservations without consuming allowance", async () => {
  vi.stubEnv("AI_MAX_ATTEMPTS", "0");
  const reserved = await Promise.all(
    Array.from({ length: 25 }, () => reserveModelAttempt(new Date("2026-10-09T00:00:00.000Z"))),
  );
  expect(reserved).toEqual(Array(25).fill(false));
  vi.stubEnv("AI_MAX_ATTEMPTS", "1");
  const now = new Date("2026-10-09T00:00:00.000Z");
  expect(await reserveModelAttempt(now)).toBe(true);
  expect(await reserveModelAttempt(now)).toBe(false);
});
it("known reset ambiguity asks the deterministic question even when OpenAI is enabled", async () => {
  vi.stubEnv("AI_PROVIDER", "openai");
  const run = vi.fn(async (call: { purpose: string; data: string }) => {
    if (call.purpose !== "sentiment")
      throw new Error("Model must not guess restart versus wipe");
    const message = JSON.parse(call.data).message as string;
    return {
      sentiment: "neutral",
      evidence: message,
      explanation: "Câu hỏi chưa thể hiện cảm xúc rõ ràng.",
    };
  });
  const rawText = "Làm sao để reset máy?";
  const request = await submitSupport(input(rawText), { run });
  expect(run).toHaveBeenCalledOnce();
  expect(run.mock.calls[0][0].purpose).toBe("sentiment");
  expect(request.decision?.action).toBe("NEEDS_INFORMATION");
  expect(request.decision?.ruleIds).toContain("INFO-RESET");
  const preview = await previewSupport(input(rawText), { run });
  expect(run).toHaveBeenCalledTimes(2);
  expect(preview.sentiment).toMatchObject({ sentiment: "neutral", source: "model" });
});
