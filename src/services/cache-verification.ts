import { createHash } from "node:crypto";
import type { Assistance, SupportRequest } from "@/domain/contracts";
import { getSupportRequest, insertSupportRequest, SupportError } from "@/lib/support-repository";
import { auditEvent } from "./support";
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
 * with synthetic inputs and an isolated in-memory cache. No model call.
 * A persisted Verify run also saves each evaluated input as a support record.
 * This is functional evidence, not a Mongo persistence or live AI benchmark.
 */
export async function runCacheVerificationCase(caseId: string, provenance?: { runId: string; requestId: string }): Promise<VerifyResult> {
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
    return { input, canonical, decision, template, answer };
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
  check("current-reviewed-answer", Object.entries(result.template).filter(([field]) => field !== "source")
    .every(([field, value]) => JSON.stringify(result.answer[field as keyof Assistance]) === JSON.stringify(value)));
  check("stored-answer-body", [...store.values()].every(entry =>
    entry.answer.stepByStepInstructions.length > 0 && entry.answer.summary.length > 0));
  if (fixture.topic) {
    check("policy", result.decision.action === "AUTO_APPROVE" && !result.canonical.riskSignals.length && !result.decision.missingFields.length);
    check("reviewed-template", result.template.generationReason === "REVIEWED_TEMPLATE_SUFFICIENT");
  }
  const pass = checks.every(value => value.endsWith(":pass"));
  const requestId = provenance ? await saveCacheRequest(caseId, provenance, result) : undefined;
  return {
    ...(requestId ? { requestId } : {}),
    caseId, timestamp: new Date().toISOString(), expected: { action: fixture.expected, bucket: "FAQ_CACHE" },
    actual: result.decision, pass,
    cache: { group: fixture.group, expected: fixture.expected, actual: outcome, topic, seeds: fixture.seeds.length,
      lexicalSimilarity: result.answer.cache?.similarity, checks, pass },
  };
}

async function saveCacheRequest(
  caseId: string,
  provenance: { runId: string; requestId: string },
  evaluated: { input: SupportRequest["input"]; canonical: NonNullable<SupportRequest["canonical"]>; decision: NonNullable<SupportRequest["decision"]>; answer: Assistance },
) {
  const input = supportInputSchema.parse({ ...evaluated.input, requesterMode: undefined, confirmed: true,
    idempotencyKey: provenance.requestId, verifyRunId: provenance.runId, verifyCaseId: caseId,
    fields: { department: "engineering", employeeId: `verify-cache-${caseId.replace(/^cache-/, "").slice(0, 19)}` },
  });
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const readExisting = async () => {
    const existing = await getSupportRequest(provenance.requestId);
    if (existing && existing.fingerprint !== fingerprint)
      throw new SupportError("IDEMPOTENCY_CONFLICT", "Mã hồ sơ đã được dùng cho nội dung khác.", 409);
    return existing;
  };
  if (await readExisting()) return provenance.requestId;
  const now = new Date().toISOString();
  const request: SupportRequest = {
    id: provenance.requestId, version: 1, fingerprint, createdAt: now, updatedAt: now,
    status: "RECEIVED", input, originalQuestion: input.rawText,
    canonical: evaluated.canonical, decision: evaluated.decision,
    assistance: evaluated.decision.action === "AUTO_APPROVE" ? [evaluated.answer] : [],
    feedback: [], events: [],
  };
  request.events.push(auditEvent(request, null, "RECEIVED", "cache-verification",
    "Hồ sơ mô phỏng từ bộ test cache. Extraction và policy được đánh giá khi tạo hồ sơ, không gọi model."));
  request.status = evaluated.decision.action === "AUTO_APPROVE" ? "AUTO_APPROVED"
    : evaluated.decision.action === "ESCALATE" ? "ESCALATED" : "NEEDS_INFORMATION";
  request.events.push(auditEvent(request, "RECEIVED", "DECISION", "deterministic-policy", evaluated.decision.adminReason));
  if (!(await insertSupportRequest(request)) && !(await readExisting()))
    throw new SupportError("STORAGE_UNAVAILABLE", "Chưa lưu được hồ sơ kiểm thử. Vui lòng thử lại.", 503);
  return request.id;
}
