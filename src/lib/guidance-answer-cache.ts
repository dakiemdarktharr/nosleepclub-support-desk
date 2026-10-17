import { createHash } from "node:crypto";
import { z } from "zod";
import type { Assistance, CanonicalRequest, Decision, SupportInput } from "@/domain/contracts";
import { guidanceTemplate } from "@/domain/guidance";
import { guidanceCacheContext } from "@/domain/guidance-cache-context";
import { POLICY_VERSION } from "@/domain/policy-source";
import { FAQ_TTL_MS } from "@/domain/shared-support";
import { INTAKE_REVISION, detectedRisks, normalize, asserted } from "@/domain/text";
import { redact } from "@/domain/redaction";
import { readAnswerCache, withAnswerCache } from "./answer-cache";
import { recordAnswerCache } from "./support-telemetry";

const prose = z.string().trim().min(1).max(700);
const storedAnswerSchema = z.object({
  summary: prose, diagnosis: prose.optional(), potentialFixes: z.array(prose).max(6).optional(),
  stepByStepInstructions: z.array(prose).min(2).max(6), stepExplanations: z.array(prose).min(2).max(6).optional(),
  options: z.array(prose).length(4), expectedResult: prose, warning: prose,
  nextQuestion: prose, canPassToAdmin: z.literal(true),
}).strict();
type StoredAnswer = z.infer<typeof storedAnswerSchema>;

function cachePlan(input: SupportInput, canonical: CanonicalRequest, decision: Decision) {
  const context = guidanceCacheContext(input.rawText);
  if (!context || input.mode !== "freeform" || input.verifyRunId || canonical.conversation ||
      canonical.model.failure || canonical.model.fallbackReason || canonical.redactions.length ||
      canonical.subrequests.length || canonical.ambiguities.length || canonical.riskSignals.length ||
      canonical.intentLabel !== context.intent || !["GUIDANCE", "SAFE_DIAGNOSTIC"].includes(canonical.requestKind) ||
      !["guidance", "diagnose"].includes(canonical.requestedAction) ||
      decision.action !== "AUTO_APPROVE" || !["GUIDE", "LLM_ASSIST"].includes(decision.handlingMode) ||
      decision.missingFields.length ||
      Object.keys(input.fields).some(field => !["employeeId", "department"].includes(field)) ||
      process.env.AI_PROVIDER !== "openai" || !process.env.OPENAI_API_KEY) return null;
  const template = guidanceTemplate(canonical);
  const model = process.env.AI_MODEL || "";
  const key = createHash("sha256").update(JSON.stringify([
    "guidance-answer-v1", context, template, POLICY_VERSION, INTAKE_REVISION, process.env.AI_PROVIDER, model,
  ])).digest("hex");
  return { key, context, template, model };
}
type Plan = NonNullable<ReturnType<typeof cachePlan>>;

/** The signature proves original validation; these checks also reject changed
 * schemas, unsafe prose or steps that no longer belong to the current guide. */
function validateStoredAnswer(value: unknown, plan: Plan): StoredAnswer {
  const answer = storedAnswerSchema.parse(value);
  const { template } = plan;
  const text = [answer.summary, ...(answer.stepExplanations ?? []), answer.expectedResult, answer.nextQuestion].join(" ");
  if (answer.stepByStepInstructions.some(step => !template.stepByStepInstructions.includes(step)) ||
      new Set(answer.stepByStepInstructions).size !== answer.stepByStepInstructions.length ||
      answer.stepExplanations && answer.stepExplanations.length !== answer.stepByStepInstructions.length ||
      JSON.stringify(answer.options) !== JSON.stringify(template.options) ||
      answer.warning !== template.warning || answer.diagnosis !== template.diagnosis ||
      JSON.stringify(answer.potentialFixes) !== JSON.stringify(template.potentialFixes ? answer.stepByStepInstructions : undefined) ||
      redact(text).markers.length || detectedRisks(text).length ||
      /https?:|www\.|<|```|\b(?:sudo|powershell|cmd\.exe|curl|wget|kubectl|chmod|regedit|netsh)\b/.test(normalize(text)) ||
      asserted(normalize(text), /\b(?:approved|da duyet|guaranteed|chac chan|xoa|delete|wipe|format|factory reset)\b/)) {
    throw new Error("UNCACHEABLE_GUIDANCE");
  }
  return answer;
}

function cachedAnswer(value: StoredAnswer, generatedAt: string, plan: Plan): Assistance {
  return {
    ...value, source: "cache", timestamp: new Date().toISOString(),
    cache: { kind: "GUIDANCE", createdAt: generatedAt,
      expiresAt: new Date(Date.parse(generatedAt) + FAQ_TTL_MS).toISOString(),
      matchedBy: "intent-symptom", topic: plan.context.topic,
      originalSource: "openai", originalModel: plan.model },
  };
}

export async function readGuidanceAnswer(input: SupportInput, canonical: CanonicalRequest, decision: Decision) {
  const plan = cachePlan(input, canonical, decision);
  if (!plan) return null;
  const cached = await readAnswerCache(plan.key, value => validateStoredAnswer(value, plan), "guidance");
  recordAnswerCache(cached ? "hit" : "miss");
  return cached ? cachedAnswer(cached.value, cached.generatedAt, plan) : null;
}

// A fallback remains a valid reply but must not become a successful cached model answer.
class UncacheableAnswer extends Error {
  constructor(readonly assistance: Assistance) { super("UNCACHEABLE_GUIDANCE"); }
}
export async function withGuidanceAnswerCache(
  input: SupportInput, canonical: CanonicalRequest, decision: Decision,
  generate: () => Promise<Assistance>,
): Promise<Assistance> {
  const plan = cachePlan(input, canonical, decision);
  if (!plan) return generate();
  let generated: Assistance | undefined;
  try {
    const result = await withAnswerCache(plan.key, async () => {
      generated = await generate();
      if (generated.source !== "openai" || generated.fallbackReason || generated.model?.failure)
        throw new UncacheableAnswer(generated);
      // No original user's evidence, identity, trace, timestamp or status enters the shared body.
      const { summary, diagnosis, potentialFixes, stepByStepInstructions, stepExplanations,
        options, expectedResult, warning, nextQuestion, canPassToAdmin } = generated;
      const body = { summary, diagnosis, potentialFixes, stepByStepInstructions, stepExplanations,
        options, expectedResult, warning, nextQuestion, canPassToAdmin };
      try { return validateStoredAnswer(body, plan); }
      catch { throw new UncacheableAnswer(generated); }
    }, value => validateStoredAnswer(value, plan), "guidance");
    recordAnswerCache(result.cacheHit ? "hit" : "miss");
    if (result.cacheHit) return cachedAnswer(result.value, result.generatedAt, plan);
    return generated ?? cachedAnswer(result.value, result.generatedAt, plan);
  } catch (error) {
    if (error instanceof UncacheableAnswer) return { ...error.assistance, timestamp: new Date().toISOString() };
    throw error;
  }
}
