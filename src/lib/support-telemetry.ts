import { AsyncLocalStorage } from "node:async_hooks";

export type SupportStage = "validationAuth" | "inputValidation" | "extraction" | "policy" |
  "retrieval" | "generation" | "outputValidation" | "persistence" | "sentiment";
export type ModelMeasurement = {
  purpose: "extraction" | "assistance" | "sentiment" | "review-draft" | "review-summary";
  model: string;
  attempts: number;
  latencyMs: number;
  retryReason?: string;
  failureReason?: string;
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
};
type Measurements = {
  startedAt: number;
  invocation: "first_observed" | "reused";
  stages: Partial<Record<SupportStage, number>>;
  modelCalls: ModelMeasurement[];
  answerCache: "not_applicable" | "not_eligible" | "miss" | "hit";
};
const measurements = new AsyncLocalStorage<Measurements>();
let observed = false;
const rounded = (value: number) => Math.round(value * 100) / 100;

// Only allowlisted durations/counts/model IDs are collected: never input,
// identity, evidence, credentials, upstream errors or database identifiers.
export function withSupportMeasurements<T>(work: () => Promise<T>): Promise<T> {
  const invocation = observed ? "reused" : "first_observed";
  observed = true;
  return measurements.run({ startedAt: performance.now(), invocation, stages: {}, modelCalls: [], answerCache: "not_applicable" }, work);
}
export function startSupportStage(stage: SupportStage): () => void {
  const current = measurements.getStore();
  const start = performance.now();
  let finished = false;
  return () => {
    if (!current || finished) return;
    finished = true;
    current.stages[stage] = (current.stages[stage] ?? 0) + performance.now() - start;
  };
}
export async function measureSupportStage<T>(stage: SupportStage, work: () => Promise<T>): Promise<T> {
  const finish = startSupportStage(stage);
  try { return await work(); } finally { finish(); }
}
export function measureSupportSync<T>(stage: SupportStage, work: () => T): T {
  const finish = startSupportStage(stage);
  try { return work(); } finally { finish(); }
}
export function recordModelMeasurement(value: ModelMeasurement) {
  measurements.getStore()?.modelCalls.push(value);
}
export function recordAnswerCache(value: Measurements["answerCache"]) {
  const current = measurements.getStore();
  if (current) current.answerCache = value;
}
export function supportMeasurements() {
  const current = measurements.getStore();
  if (!current) return undefined;
  return {
    version: 1,
    totalMs: rounded(performance.now() - current.startedAt),
    processInvocation: current.invocation,
    // A first observed invocation is not proof of a Vercel cold start.
    coldStart: "unknown" as const,
    answerCache: current.answerCache,
    stagesMs: Object.fromEntries(Object.entries(current.stages).map(([key, value]) => [key, rounded(value)])),
    modelCalls: current.modelCalls.map(value => ({ ...value, latencyMs: rounded(value.latencyMs) })),
  };
}
