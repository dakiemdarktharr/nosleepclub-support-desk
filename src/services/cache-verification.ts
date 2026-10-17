import type { Assistance } from "@/domain/contracts";
import { supportInputSchema } from "@/domain/input";
import { extractIntake, safeInput } from "@/domain/text";
import { evaluatePolicy } from "@/domain/policy";
import { guidanceTemplate } from "@/domain/guidance";
import { faqTopic } from "@/domain/faq-intent";
import { cacheVerificationCases, type CacheOutcome } from "@/domain/cache-verification";
import { reviewedGuideAnswers } from "@/lib/reviewed-guidance";
import { createIsolatedFaqCache, sharedFaqAnswer } from "@/lib/shared-faq-cache";
import type { VerifyResult } from "@/lib/support-verify";

/** Exercise production extraction, policy, reviewed templates and cache matching
 * with synthetic inputs and an isolated in-memory store. No model call/ticket.
 * This is functional evidence, not a Mongo persistence or live AI benchmark.
 */
export async function runCacheVerificationCase(caseId: string): Promise<VerifyResult> {
  const fixture = cacheVerificationCases.find(row => row.id === caseId);
  if (!fixture) throw new Error("Unknown cache verification case");
  const store = createIsolatedFaqCache();
  const evaluate = async (text: string) => {
    const { input, markers } = safeInput(supportInputSchema.parse({
      requesterMode: "guest", rawText: text, idempotencyKey: crypto.randomUUID(),
    }));
    const canonical = extractIntake(input, markers);
    const decision = evaluatePolicy(canonical);
    const template: Assistance = {
      ...guidanceTemplate(canonical), source: "deterministic", timestamp: new Date().toISOString(),
      ...(reviewedGuideAnswers(input, canonical) ? { generationReason: "REVIEWED_TEMPLATE_SUFFICIENT" as const } : {}),
    };
    const answer = await sharedFaqAnswer(input, canonical, decision, template, "write", store);
    return { canonical, decision, template, answer };
  };
  const seeds = [];
  for (const text of fixture.seeds) seeds.push(await evaluate(text));
  const sizeBefore = store.size;
  const result = await evaluate(fixture.rawText);
  const topic = faqTopic(fixture.rawText);
  const outcome: CacheOutcome = result.answer.source === "cache" ? "HIT" : topic ? "MISS" : "BYPASS";
  const checks: string[] = [];
  const check = (name: string, pass: boolean) => checks.push(`${name}:${pass ? "pass" : "fail"}`);
  check("seed-misses", seeds.every(seed => seed.answer.source !== "cache"));
  check("seed-storage", sizeBefore === fixture.seeds.length);
  check("topic", topic === fixture.topic);
  check("cache-outcome", outcome === fixture.expected);
  check("storage-isolation", store.size === sizeBefore + (fixture.expected === "MISS" ? 1 : 0));
  check("current-reviewed-answer", JSON.stringify({ ...result.answer, source: undefined, cache: undefined }) === JSON.stringify({ ...result.template, source: undefined, cache: undefined }));
  if (fixture.topic) {
    check("policy", result.decision.action === "AUTO_APPROVE" && !result.canonical.riskSignals.length && !result.decision.missingFields.length);
    check("reviewed-template", result.template.generationReason === "REVIEWED_TEMPLATE_SUFFICIENT");
  }
  const pass = checks.every(value => value.endsWith(":pass"));
  return {
    caseId, timestamp: new Date().toISOString(), expected: { action: fixture.expected, bucket: "FAQ_CACHE" },
    actual: result.decision, pass,
    cache: { group: fixture.group, expected: fixture.expected, actual: outcome, topic, seeds: fixture.seeds.length,
      lexicalSimilarity: result.answer.cache?.similarity, checks, pass },
  };
}
