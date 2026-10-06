import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeDevelopment } from "./development-report.mjs";
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
test("empty denominators are unknown, duplicates rejected, expected rule included in exact match", () => {
  assert.equal(summarizeDevelopment({ results: [] }).coverage, null);
  assert.throws(() => summarizeDevelopment({ results: [row("a", "AUTO_APPROVE", null), row("a", "AUTO_APPROVE", null)] }));
  const entry = row("x", "AUTO_APPROVE", "AUTO_APPROVE");
  entry.expected.rule = "OTHER";
  assert.equal(summarizeDevelopment({ results: [entry] }).exactMatch.count, 0);
});
