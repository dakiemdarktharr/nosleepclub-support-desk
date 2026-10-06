// Summarize the existing 128-case development run. No labels or predictions are changed.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function summarizeDevelopment(report) {
  const actions = ["AUTO_APPROVE", "NEEDS_INFORMATION", "ESCALATE"];
  if (!Array.isArray(report.results)) throw new Error("Missing results");
  const ids = new Set();
  const matrix = Object.fromEntries(actions.map(a => [a, Object.fromEntries(actions.map(b => [b, 0]))]));
  const byRule = {}, byBucket = {}, bySubrequestCount = {};
  let available = 0, exact = 0, tp = 0, tn = 0, fp = 0, fn = 0;
  const rows = report.results.map(row => {
    if (!row.caseId || ids.has(row.caseId) || !actions.includes(row.expected?.action)) throw new Error("Invalid/duplicate case");
    ids.add(row.caseId);
    const actual = row.actual;
    if (actual && !actions.includes(actual.action)) throw new Error("Invalid actual action");
    const match = Boolean(actual && row.expected.action === actual.action && row.expected.bucket === actual.bucket &&
      (!row.expected.rule || actual.ruleIds.includes(row.expected.rule)));
    if (actual) {
      available++;
      if (match) exact++;
      matrix[row.expected.action][actual.action]++;
      const expectedEscalation = row.expected.action === "ESCALATE", actualEscalation = actual.action === "ESCALATE";
      if (expectedEscalation && actualEscalation) tp++;
      else if (expectedEscalation) fn++;
      else if (actualEscalation) fp++;
      else tn++;
    }
    if (!match) {
      for (const rule of actual?.ruleIds ?? ["UNAVAILABLE"]) byRule[rule] = (byRule[rule] ?? 0) + 1;
      const buckets = `${row.expected.bucket} -> ${actual?.bucket ?? "UNAVAILABLE"}`;
      byBucket[buckets] = (byBucket[buckets] ?? 0) + 1;
      const count = actual?.subrequestOutcomes?.length ?? 0;
      bySubrequestCount[count] = (bySubrequestCount[count] ?? 0) + 1;
    }
    return { caseId: row.caseId, expected: row.expected, actual: actual ? {
      action: actual.action, bucket: actual.bucket, rules: actual.ruleIds,
      missingFields: actual.missingFields, approvalStatus: actual.approvalStatus,
      subrequests: actual.subrequestOutcomes,
    } : null, exactMatch: match, readbackPassed: row.persistence?.pass === true };
  });
  const rate = (n, d) => d ? n / d : null;
  return {
    provenance: report.provenance ?? { status: "NOT_RECORDED_USE_RUN_LOG" },
    checkedAt: report.generatedAt, split: "development", evidence: "synthetic", provider: report.provider,
    independentHeldOut: "NOT_COLLECTED", realUserImpact: "NOT_COLLECTED",
    total: rows.length, available, unavailable: rows.length - available, coverage: rate(available, rows.length),
    exactMatch: { count: exact, rate: rate(exact, rows.length), definition: "action + bucket + expected rule if supplied; unavailable counts as non-match" },
    confusionMatrix: matrix,
    binaryEscalation: { tp, tn, fp, fn, falseNegativeRate: rate(fn, tp + fn), unnecessaryEscalationRate: rate(fp, fp + tn),
      definition: "ESCALATE is positive; NEEDS_INFORMATION is negative; unavailable excluded" },
    routineEscalated: matrix.AUTO_APPROVE.ESCALATE,
    routineAskedForInformation: matrix.AUTO_APPROVE.NEEDS_INFORMATION,
    expectedEscalationAutoApproved: matrix.ESCALATE.AUTO_APPROVE,
    expectedEscalationAskedForInformation: matrix.ESCALATE.NEEDS_INFORMATION,
    readbackPassed: rows.filter(row => row.readbackPassed).length,
    mismatchGroups: { byRule, byBucket, bySubrequestCount }, rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] ?? "artifacts/original-fixture-evaluation.json";
  console.log(JSON.stringify(summarizeDevelopment(JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""))), null, 2));
}
