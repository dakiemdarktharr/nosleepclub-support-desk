import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalize } from "@/domain/text";
import { knowledgeSeed } from "@/domain/knowledge";
import { POLICY_VERSION } from "@/domain/policy-source";
import type { ConversationContext } from "@/domain/conversation";
import { supportDatabase } from "./support-repository";
const ttlMs = 60 * 60_000;
const schema = z.object({
  value: z.unknown(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});
type Row = z.infer<typeof schema>;
const memory = new Map<string, Row>();
const pending = new Map<string, Promise<Row>>();
// Only closed, public questions. Personal names, numbers, account details and follow-ups never enter shared cache.
export function answerCacheKey(context: ConversationContext, model: string) {
  const text = normalize(context.question);
  const publicQuestion =
    /^(?:xin chao|chao ban|hello|hi|ban ten gi|ban la ai|what is your name|who are you|ban co the xu ly cac request gi|ban co the ho tro gi|what can you do|lam sao khoi phuc tai khoan google|how can i recover my gmail account)[?!. ]*$/;
  if (context.ignoredOverride || !publicQuestion.test(text)) return null;
  return createHash("sha256")
    .update(
      JSON.stringify([
        "answer-v4-evidence-workflow-response-style",
        text,
        context.label,
        model,
        POLICY_VERSION,
        knowledgeSeed,
      ]),
    )
    .digest("hex");
}
function sign(key: string, row: Omit<Row, "signature">) {
  return createHmac("sha256", process.env.OPENAI_API_KEY || "")
    .update(JSON.stringify([key, row.value, row.createdAt, row.expiresAt]))
    .digest("hex");
}
function trusted(key: string, candidate: unknown): Row | null {
  const parsed = schema.safeParse(candidate);
  if (
    !parsed.success ||
    Date.parse(parsed.data.expiresAt) <= Date.now() ||
    Date.parse(parsed.data.createdAt) > Date.now()
  )
    return null;
  const row = parsed.data;
  const expected = Buffer.from(sign(key, row), "hex"),
    actual = Buffer.from(row.signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? row
    : null;
}
export async function withAnswerCache<T>(
  key: string | null,
  generate: () => Promise<T>,
  validate: (value: unknown) => T,
): Promise<{ value: T; cacheHit: boolean; generatedAt: string }> {
  if (
    !key ||
    process.env.AI_PROVIDER !== "openai" ||
    !process.env.OPENAI_API_KEY
  )
    return {
      value: await generate(),
      cacheHit: false,
      generatedAt: new Date().toISOString(),
    };
  // Cache is optional; an outage must not turn a safe conversation into a reviewer task.
  let collection;
  try {
    collection = supportDatabase()?.collection<Row & { _id: string }>(
      "v3_support_answer_cache",
    );
  } catch {
    /* local fallback */
  }
  let stored: unknown;
  try {
    stored = collection
      ? await collection.findOne({ _id: key })
      : memory.get(key);
  } catch {
    /* cache miss */
  }
  const row = trusted(key, stored);
  if (row) {
    try {
      return {
        value: validate(row.value),
        cacheHit: true,
        generatedAt: row.createdAt,
      };
    } catch {
      /* revalidate on every hit */
    }
  }
  const shared = pending.get(key);
  if (shared) {
    const result = await shared;
    return {
      value: validate(result.value),
      cacheHit: true,
      generatedAt: result.createdAt,
    };
  }
  const work = (async () => {
    const value = await generate();
    const raw = {
      value,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    const saved = { ...raw, signature: sign(key, raw) };
    try {
      if (collection) {
        // Mongo TTL requires a Date, kept separately from signed ISO strings.
        await collection.createIndex(
          { deleteAt: 1 },
          { expireAfterSeconds: 0 },
        );
        await collection.updateOne(
          { _id: key },
          { $set: { ...saved, deleteAt: new Date(raw.expiresAt) } },
          { upsert: true },
        );
      } else {
        if (memory.size >= 100) memory.delete(memory.keys().next().value!);
        memory.set(key, saved);
      }
    } catch {
      /* A cache write failure does not invalidate a verified answer. */
    }
    return saved;
  })();
  pending.set(key, work);
  try {
    const result = await work;
    return {
      value: validate(result.value),
      cacheHit: false,
      generatedAt: result.createdAt,
    };
  } finally {
    pending.delete(key);
  }
}
export function resetAnswerCacheForTest() {
  if (process.env.NODE_ENV !== "test") throw Error("TEST_ONLY");
  memory.clear();
  pending.clear();
}
