import {
  knowledgeSeed,
  supersededKnowledgeIds,
  type KnowledgeArticle,
} from "@/domain/knowledge";
import { conversationLabels, type ConversationLabel } from "@/domain/conversation";
import { z } from "zod";
import { searchKnowledge } from "@/domain/knowledge-search";
import { supportDatabase } from "./support-repository";
import { startSupportStage } from "./support-telemetry";

// Mongo's generic type does not validate stored documents at runtime.
// Strip unused fields, then require exact content equality with a reviewed revision.
const knowledgeArticleSchema = z.object({
  _id: z.string(),
  label: z.enum(conversationLabels),
  keywords: z.array(z.string()),
  title: z.string(),
  answer: z.string(),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string().url(),
    scope: z.enum(["public", "project"]),
    checkedAt: z.string(),
  })),
  reviewedAt: z.string(),
  expiresAt: z.string(),
  version: z.number().int().positive(),
});

// Database documents are untrusted. A known ID alone is not proof of review.
function articleContent(row: KnowledgeArticle) {
  return JSON.stringify([
    row._id,
    row.label,
    row.title,
    row.keywords,
    row.answer,
    row.sources?.map((source) => [
      source.title,
      source.url,
      source.scope,
      source.checkedAt,
    ]),
    row.version,
    row.reviewedAt,
    row.expiresAt,
  ]);
}
export function rankKnowledge(
  rows: readonly unknown[],
  question: string,
  label: ConversationLabel,
  now = Date.now(),
) {
  const reviewed = new Map(
    knowledgeSeed.map((row) => [row._id, articleContent(row)]),
  );
  const valid: KnowledgeArticle[] = [];
  for (const candidate of rows) {
    const parsed = knowledgeArticleSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const row = parsed.data;
    if (
      !supersededKnowledgeIds.includes(row._id) &&
      Date.parse(row.expiresAt) > now &&
      Date.parse(row.reviewedAt) <= now &&
      reviewed.get(row._id) === articleContent(row)
    ) valid.push(row);
  }
  return searchKnowledge(valid, question, label);
}
let seeded: Promise<void> | undefined;
export async function retrieveKnowledge(
  question: string,
  label: ConversationLabel,
) {
  const finish = startSupportStage("retrieval");
  try {
  const db = supportDatabase();
  if (!db)
    return {
      articles: rankKnowledge(knowledgeSeed, question, label),
      storage: "memory" as const,
    };
  const collection = db.collection<KnowledgeArticle>("v3_support_knowledge");
  // Immutable, reviewed seed versions only. Never turn user/model/web text into approved knowledge.
  seeded ??= (async () => {
    await collection.createIndex({ label: 1, expiresAt: 1 });
    await collection.bulkWrite(
      knowledgeSeed.map((article) => ({
        updateOne: {
          filter: { _id: article._id },
          update: { $setOnInsert: article },
          upsert: true,
        },
      })),
    );
  })().catch((error) => {
    seeded = undefined;
    throw error;
  });
  await seeded;
  const rows = await collection
    .find({
      _id: { $in: knowledgeSeed.map((article) => article._id) },
      expiresAt: { $gt: new Date().toISOString() },
    })
    .limit(knowledgeSeed.length)
    .toArray();
  return {
    articles: rankKnowledge(rows, question, label),
    storage: "mongodb" as const,
  };
  } finally { finish(); }
}
