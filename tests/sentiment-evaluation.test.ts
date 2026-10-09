import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import rawDataset from "../data/sentiment/helpdesk-affect-v1.json";
import { evaluateSentiment, sentimentDatasetSchema } from "@/evaluation/sentiment";
import { supportRequestSentimentFallback } from "@/lib/feedback-model";
import { redact } from "@/domain/redaction";
import { POLICY_VERSION } from "@/domain/policy-source";

const dataset = sentimentDatasetSchema.parse(rawDataset);
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

it("imports only bounded original synthetic development drafts with exact evidence and unique IDs", () => {
  expect(dataset.examples).toHaveLength(16);
  for (const mutate of [
    (value: typeof rawDataset) => { value.split = "held-out"; },
    (value: typeof rawDataset) => { value.source.kind = "google-maps"; },
    (value: typeof rawDataset) => { value.examples.push(value.examples[0]); },
    (value: typeof rawDataset) => { value.examples[0].evidence = "unquoted"; },
  ]) {
    const invalid = structuredClone(rawDataset);
    mutate(invalid);
    expect(sentimentDatasetSchema.safeParse(invalid).success).toBe(false);
  }
  expect(dataset.examples.every((row) => redact(row.text).markers.length === 0)).toBe(true);
});

it("computes metrics without treating stars as labels or hiding absent predictions", () => {
  const small = { ...dataset, examples: dataset.examples.slice(0, 4) };
  const report = evaluateSentiment(small, [
    { id: "syn-01", actual: "negative", source: "rule-based", evidence: "" },
    { id: "syn-02", actual: "negative", source: "rule-based", evidence: "" },
    { id: "syn-03", actual: "negative", source: "rule-based", evidence: "" },
  ]);
  expect(report).toMatchObject({ total: 4, scored: 3, correct: 1, accuracy: 1 / 3, coverage: .75, ambiguousRate: .25 });
  expect(report.perLabel.negative).toEqual({ support: 1, precision: .5, recall: 1, f1: 2 / 3 });
  expect(report.perLabel.positive.precision).toBeNull();
  expect(report.confusionMatrix.neutral.unavailable).toBe(1);
  expect(report.mismatches.map((row) => row.id)).toEqual(["syn-02", "syn-04"]);
  expect(() => evaluateSentiment(small, [{ id: "missing", actual: "positive", source: "model", evidence: "" }])).toThrow();
});

it("evaluates the shipped fallback separately from model quality and policy decisions", () => {
  const predictions = dataset.examples.map((row) => {
    const result = supportRequestSentimentFallback(row.text);
    return { id: row.id, actual: result.sentiment, source: result.source, evidence: result.evidence };
  });
  const metrics = evaluateSentiment(dataset, predictions);
  expect(metrics.coverage).toBe(1);
  // No accuracy pass threshold on developer-authored, unadjudicated labels.
  if (process.env.SENTIMENT_REPORT_OUT) {
    const runtimeFiles = ["src/lib/feedback-model.ts", "src/domain/feedback.ts", "src/domain/text.ts", "src/domain/redaction.ts"];
    const report = {
      metadata: {
        commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        runtimeDirty: Boolean(execFileSync("git", ["diff", "HEAD", "--", ...runtimeFiles], { encoding: "utf8" }).trim()),
        runtimeSha256: hash(runtimeFiles.map((file) => file + "\n" + readFileSync(file, "utf8")).join("\n")),
        evaluatorSha256: hash(readFileSync("src/evaluation/sentiment.ts")),
        datasetSha256: hash(JSON.stringify(dataset)),
        datasetId: dataset.id, version: dataset.version, split: dataset.split, provenance: dataset.source,
        policyVersion: POLICY_VERSION, context: "support-request",
        node: process.version, provider: "none", model: "none", mode: "local-rule-fallback",
        storage: "none", liveInference: "NOT_PERFORMED", policyEvaluation: "NOT_PERFORMED",
      },
      ...metrics,
    };
    writeFileSync(process.env.SENTIMENT_REPORT_OUT, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.info(JSON.stringify({ correct: report.correct, scored: report.scored, ambiguous: report.ambiguousCount }));
  }
});
