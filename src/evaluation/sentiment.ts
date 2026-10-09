import { z } from "zod";

export const sentimentLabels = ["positive", "neutral", "negative"] as const;
const label = z.enum(sentimentLabels);
const exampleSchema = z.object({
  id: z.string().regex(/^syn-[0-9]{2,4}$/),
  text: z.string().trim().min(1).max(2000),
  label: z.enum([...sentimentLabels, "ambiguous"]),
  evidence: z.string().trim().min(1).max(300),
  rationale: z.string().trim().min(1).max(500),
  confidence: z.enum(["low", "medium", "high"]),
  adjudicator: z.null(),
  satisfaction: z.enum(["satisfied", "dissatisfied", "mixed", "unknown"]),
  resolution: z.enum(["resolved", "unresolved", "unknown"]),
  fictionalStars: z.union([z.literal(3), z.literal(4), z.null()]),
}).strict().refine((row) => row.text.includes(row.evidence), "Evidence must quote the synthetic text");

// This import boundary accepts original drafts only. It cannot certify external
// review rights or promote developer-visible examples to independent held-out.
export const sentimentDatasetSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.literal("helpdesk-affect-synthetic"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  split: z.literal("development"),
  source: z.object({
    kind: z.literal("original-synthetic"),
    rights: z.literal("no-third-party-content"),
    author: z.string().min(1),
    humanReview: z.literal("NOT_COLLECTED"),
  }).strict(),
  examples: z.array(exampleSchema).min(1).max(1000),
}).strict().refine((data) => new Set(data.examples.map((row) => row.id)).size === data.examples.length, "Duplicate case ID");

export type SentimentDataset = z.infer<typeof sentimentDatasetSchema>;
const predictionSchema = z.object({
  id: z.string(),
  actual: label.nullable(),
  source: z.enum(["rule-based", "model", "not-assessed", "unavailable"]),
  evidence: z.string(),
}).strict();
export type SentimentPrediction = z.infer<typeof predictionSchema>;
const ratio = (n: number, d: number) => d ? n / d : null;

export function evaluateSentiment(dataset: SentimentDataset, predictions: SentimentPrediction[]) {
  sentimentDatasetSchema.parse(dataset);
  const parsed = z.array(predictionSchema).parse(predictions);
  const byId = new Map(parsed.map((row) => [row.id, row]));
  if (byId.size !== parsed.length || parsed.some((row) => !dataset.examples.some((item) => item.id === row.id)))
    throw new Error("Duplicate or unknown prediction ID");
  const cases = dataset.examples.map((row) => {
    const prediction = byId.get(row.id);
    return {
      id: row.id, expected: row.label, actual: prediction?.actual ?? null,
      source: prediction?.source ?? "unavailable",
      expectedEvidence: row.evidence, actualEvidence: prediction?.evidence ?? "",
      rationale: row.rationale,
      correct: row.label === "ambiguous" ? null : prediction?.actual === row.label,
    };
  });
  const scored = cases.filter((row) => row.expected !== "ambiguous");
  const confusionMatrix = Object.fromEntries(sentimentLabels.map((expected) => [expected,
    Object.fromEntries([...sentimentLabels, "unavailable"].map((actual) => [actual,
      scored.filter((row) => row.expected === expected && (row.actual ?? "unavailable") === actual).length,
    ])),
  ]));
  const perLabel = Object.fromEntries(sentimentLabels.map((current) => {
    const tp = scored.filter((row) => row.expected === current && row.actual === current).length;
    const fp = scored.filter((row) => row.expected !== current && row.actual === current).length;
    // Unavailable predictions remain false negatives, never silently dropped.
    const fn = scored.filter((row) => row.expected === current && row.actual !== current).length;
    return [current, { support: tp + fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: ratio(2 * tp, 2 * tp + fp + fn) }];
  }));
  return {
    total: cases.length, scored: scored.length, correct: scored.filter((row) => row.correct).length,
    accuracy: ratio(scored.filter((row) => row.correct).length, scored.length),
    coverage: ratio(cases.filter((row) => row.actual !== null).length, cases.length),
    ambiguousCount: cases.length - scored.length,
    ambiguousRate: ratio(cases.length - scored.length, cases.length),
    confusionMatrix, perLabel, cases,
    mismatches: scored.filter((row) => !row.correct),
    adjudicationQueue: cases.filter((row) => row.expected === "ambiguous"),
  };
}
