import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeDevelopment, compareDevelopment } from "./development-report.mjs";
const row = (caseId, expected, actual) => ({ caseId, expected: { action: expected, bucket: "TEST" },
  actual: actual ? { action: actual, bucket: "TEST", ruleIds: ["TEST"], subrequestOutcomes: [] } : undefined });
test("counts missing predictions, unnecessary review and missed escalation separately", () => {
  const report = summarizeDevelopment({ results: [row("a", "AUTO_APPROVE", "ESCALATE"), row("b", "ESCALATE", "NEEDS_INFORMATION"), row("c", "ESCALATE", null), row("d", "AUTO_APPROVE", "AUTO_APPROVE")] });
  assert.equal(report.coverage, 0.75);
  assert.equal(report.exactMatch.count, 1);
  assert.equal(report.binaryEscalation.fn, 1);
  assert.equal(report.binaryEscalation.falseNegativeRate, 1);
  assert.equal(report.expectedEscalationAutoApproved, 0);
  assert.equal(report.expectedEscalationAskedForInformation, 1);
  assert.equal(report.binaryEscalation.unnecessaryEscalationRate, 0.5);
  assert.equal(report.independentHeldOut, "NOT_COLLECTED");
});

test("case report includes evidence and diagnostic leads without adjudicating labels", () => {
  const entry = row("synthetic", "AUTO_APPROVE", "ESCALATE");
  Object.assign(entry.actual, { ruleIds: ["AUTH-007"], safeEvidence: ["Synthetic scope"], adminReason: "Scope mismatch", policyVersion: "test" });
  const result = summarizeDevelopment({ results: [entry] }).rows[0];
  assert.deepEqual(result.mismatchFields, ["action"]);
  assert.deepEqual(result.actual.evidence, ["Synthetic scope"]);
  assert.equal(result.actual.reason, "Scope mismatch");
  assert.equal(result.reviewStatus, "requires-expert-adjudication");
  assert.ok(result.diagnosticSignals.includes("APPROVAL_VERIFICATION_FAILED"));
});

test("comparison rejects relabels/input changes and reports regressions explicitly", () => {
  const before = { results: [row("x", "AUTO_APPROVE", "AUTO_APPROVE")] };
  const after = { results: [row("x", "AUTO_APPROVE", "ESCALATE")] };
  assert.deepEqual(compareDevelopment(before, after).comparison.regressedExactPass, ["x"]);
  assert.equal(compareDevelopment(before, after).comparison.changedCases.length, 1);
  assert.throws(() => compareDevelopment(before, { results: [row("x", "ESCALATE", "ESCALATE")] }));
  before.results[0].datasetCase = { sha256: "old" };
  after.results[0].datasetCase = { sha256: "new" };
  assert.throws(() => compareDevelopment(before, after));
});
test("empty denominators are unknown, duplicates rejected, expected rule included in exact match", () => {
  assert.equal(summarizeDevelopment({ results: [] }).coverage, null);
  assert.throws(() => summarizeDevelopment({ results: [row("a", "AUTO_APPROVE", null), row("a", "AUTO_APPROVE", null)] }));
  const entry = row("x", "AUTO_APPROVE", "AUTO_APPROVE");
  entry.expected.rule = "OTHER";
  assert.equal(summarizeDevelopment({ results: [entry] }).exactMatch.count, 0);
});
