import { createHash } from "node:crypto";
import type { Assistance, CanonicalRequest, Decision, SupportInput } from "@/domain/contracts";
import { FAQ_TTL_MS, lexicalSimilarity, publicFaqTopic } from "@/domain/shared-support";
import { POLICY_VERSION } from "@/domain/policy-source";
import { faqIntents, faqTopic } from "@/domain/faq-intent";
import { supportDatabase } from "./support-repository";
import { recordAnswerCache } from "./support-telemetry";
import { z } from "zod";
import { INTAKE_REVISION } from "@/domain/text";
const answerSchema = z.object({
  summary: z.string(), diagnosis: z.string().optional(), potentialFixes: z.array(z.string()).optional(),
  stepByStepInstructions: z.array(z.string()), options: z.array(z.string()),
  expectedResult: z.string(), warning: z.string(), nextQuestion: z.string(), canPassToAdmin: z.literal(true),
  generationReason: z.literal("REVIEWED_TEMPLATE_SUFFICIENT"),
}).strict();
type Entry = { _id: string; topic: string; query: string; templateHash: string;
  answer: z.infer<typeof answerSchema>; createdAt: Date; expiresAt: Date };
const memory = new Map<string, Entry>();
// A fresh cache for each verification case; never reads/writes the live FAQ store.
export const createIsolatedFaqCache = () => new Map<string, Entry>();
const hash = (s: unknown) => createHash("sha256").update(JSON.stringify(s)).digest("hex");

/** Persist the answer itself. Its complete body must still equal the current
 * reviewed template, so a modified stored answer never becomes trusted prose. */
export async function sharedFaqAnswer(input: SupportInput, canonical: CanonicalRequest, decision: Decision,
  template: Assistance, mode: "read" | "write" = "write",
  isolatedMemory?: ReturnType<typeof createIsolatedFaqCache>): Promise<Assistance> {
  const topic = faqTopic(input.rawText);
  if (!topic || input.verifyRunId || canonical.redactions.length || canonical.subrequests.length > 1 ||
      canonical.riskSignals.length || canonical.ambiguities.length || canonical.model.failure ||
      canonical.intentLabel !== faqIntents[topic] ||
      decision.action !== "AUTO_APPROVE" || decision.missingFields.length ||
      template.generationReason !== "REVIEWED_TEMPLATE_SUFFICIENT" || template.fallbackReason ||
      Object.keys(input.fields).some(k => !["employeeId", "department"].includes(k))) return template;
  // Hash every answer field except timestamp/model telemetry. Invalidation is automatic
  // when any reviewed text/policy changes; no caller/private content is persisted.
  const body = { ...template };
  delete (body as Partial<Assistance>).timestamp; delete body.model;
  delete (body as Partial<Assistance>).source;
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) return template;
  const templateHash = hash(parsed.data), prefix = hash(["faq-v3-stored-answer", POLICY_VERSION, INTAKE_REVISION, topic, templateHash]);
  const now = new Date();
  const entries = isolatedMemory ?? memory;
  try {
    const collection = isolatedMemory ? undefined : supportDatabase()?.collection<Entry>("v3_support_shared_faq");
    const rows = collection ? await collection.find({ topic: prefix, expiresAt: { $gt: now } }).limit(30).toArray() :
      [...entries.values()].filter(r => r.topic === prefix && r.expiresAt > now);
    const hit = rows.find(r => r.templateHash === templateHash && publicFaqTopic(r.query) === topic &&
      r.createdAt instanceof Date && r.expiresAt instanceof Date && +r.createdAt <= +now &&
      +r.expiresAt > +now && +r.expiresAt <= +r.createdAt + FAQ_TTL_MS &&
      answerSchema.safeParse(r.answer).success && hash(answerSchema.parse(r.answer)) === templateHash);
    if (!isolatedMemory) recordAnswerCache(hit ? "hit" : "miss");
    if (hit) return { ...structuredClone(hit.answer), timestamp: template.timestamp, source: "cache", cache: { kind: "FAQ", createdAt: hit.createdAt.toISOString(), expiresAt: hit.expiresAt.toISOString(), similarity: lexicalSimilarity(input.rawText, hit.query), matchedBy: "intent-symptom", topic, originalSource: "deterministic" } };
    if (mode === "read") return template;
    const key = hash([prefix, input.rawText]);
    const row: Entry = { _id: key, topic: prefix, query: input.rawText, templateHash, answer: parsed.data, createdAt: now, expiresAt: new Date(+now + FAQ_TTL_MS) };
    if (collection) {
      await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await collection.createIndex({ topic: 1, expiresAt: 1 });
      await collection.updateOne({ _id: key }, { $set: row }, { upsert: true });
    } else {
      if (entries.size >= 100) entries.delete(entries.keys().next().value!);
      entries.set(key, row);
    }
  } catch { if (!isolatedMemory) recordAnswerCache("miss"); /* Optional cache: no new fallback store on Mongo failure. */ }
  return template;
}
export function resetSharedFaqForTest() { if (process.env.NODE_ENV !== "test") throw Error("TEST_ONLY"); memory.clear(); }
