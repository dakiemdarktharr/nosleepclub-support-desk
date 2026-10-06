import { performance } from "node:perf_hooks";
import { it, vi } from "vitest";
import { extractIntake } from "@/domain/text";
import { evaluatePolicy } from "@/domain/policy";
import { conversationalCanonical } from "@/domain/conversation";
import { extractWithModel } from "@/lib/support-model";
import { createConversationAnswer } from "@/lib/conversation-model";
import type { SupportInput } from "@/domain/contracts";

const question = "The print queue is stuck on my workstation";
const input: SupportInput = {
  mode: "freeform", serviceGroup: "OTHER", rawText: question, fields: {},
  confirmed: true, idempotencyKey: "synthetic-benchmark",
};

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: sorted[Math.floor((sorted.length - 1) * 0.5)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

it.skipIf(process.env.SUPPORT_INTENT_BENCH !== "1")("measures local intent stages with injected model output", async () => {
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("AI_PROVIDER", "openai");
  const output = {
    language: "en", requestKind: "SAFE_DIAGNOSTIC", serviceGroup: "DEVICE_BOOT",
    intentLabel: "DEVICE_PRINTER", entities: {}, environment: "unknown",
    requestedAction: "diagnose", riskSignals: [], missingFields: [],
    evidence: [{ field: "input", quote: question }, { field: "intentLabel", quote: question }],
    ambiguities: [], route: "support", conversationLabel: null, workKind: null,
    intentEvidence: question,
  };
  const baseline = extractIntake(input);
  const run = async () => output;
  const measured: Record<string, number[]> = {
    baselineExtraction: [], baselinePolicy: [], modelExtractionInjected: [], modelPolicy: [], answerMock: [],
  };
  for (let i = 0; i < 35; i++) {
    let start = performance.now();
    extractIntake(input);
    const baselineMs = performance.now() - start;
    start = performance.now();
    evaluatePolicy(baseline);
    const baselinePolicyMs = performance.now() - start;
    start = performance.now();
    const canonical = await extractWithModel(input, baseline, { run });
    const modelMs = performance.now() - start;
    start = performance.now();
    evaluatePolicy(canonical);
    const policyMs = performance.now() - start;
    if (i >= 5) {
      measured.baselineExtraction.push(baselineMs);
      measured.baselinePolicy.push(baselinePolicyMs);
      measured.modelExtractionInjected.push(modelMs);
      measured.modelPolicy.push(policyMs);
    }
  }
  vi.stubEnv("AI_PROVIDER", "mock");
  const chatInput = { ...input, rawText: "bạn tên gì" };
  const chat = conversationalCanonical(extractIntake(chatInput), {
    label: "IDENTITY", question: chatInput.rawText, ignoredOverride: false,
  });
  for (let i = 0; i < 35; i++) {
    const start = performance.now();
    await createConversationAnswer(chat);
    if (i >= 5) measured.answerMock.push(performance.now() - start);
  }
  console.log(JSON.stringify({
    scope: "Synthetic in-process server stages; injected model returns immediately; answer uses mock provider; no OpenAI, HTTP, Mongo or production",
    warmup: 5,
    units: "ms",
    stages: Object.fromEntries(Object.entries(measured).map(([key, values]) => [key, summary(values)])),
  }, null, 2));
  vi.unstubAllEnvs();
});
