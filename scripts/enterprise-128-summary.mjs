import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = path => JSON.parse(readFileSync(path, "utf8"));
const datasetPath = "mlai26_new/data/verify/enterprise-128-v1.json";
const dataset = read(datasetPath);
const manifest = read("mlai26_new/data/verify/enterprise-128-v1.manifest.json");
const report = read("artifacts/enterprise-128-results.json");
const digest = createHash("sha256").update(readFileSync(datasetPath)).digest("hex");
if (digest !== manifest.sha256 || digest !== report.provenance.datasetSha256 || report.total !== 128)
  throw new Error("Dataset/report integrity mismatch; run the evaluator again.");
const cases = new Map(dataset.cases.map(row => [row.id, row]));
const seen = new Set();
for (const row of report.results) {
  const fixture = cases.get(row.caseId);
  if (!fixture || seen.has(row.caseId) || row.expected.action !== fixture.expected_action ||
      row.expected.bucket !== fixture.expected_bucket || row.expected.rule !== fixture.expected_rule)
    throw new Error("Unexpected, duplicated or relabelled result.");
  seen.add(row.caseId);
}
if (seen.size !== 128) throw new Error("Incomplete result set.");
const percent = count => `${count}/128 (${(count / 128 * 100).toFixed(2)}%)`;
const action = report.results.filter(row => row.actual?.action === row.expected.action).length;
const bucket = report.results.filter(row => row.actual?.action === row.expected.action && row.actual?.bucket === row.expected.bucket).length;
const exact = report.results.filter(row => row.actual?.action === row.expected.action && row.actual?.bucket === row.expected.bucket && row.actual?.ruleIds.includes(row.expected.rule)).length;
console.log(`Synthetic development, mock/memory; source ${report.provenance.sourceRevision}`);
console.log(`Action: ${percent(action)}\nAction + bucket: ${percent(bucket)}\nAction + bucket + rule: ${percent(exact)}`);
console.log(`Available: ${report.actionMetrics.scored}/128; readback: ${report.readbackPassed}/128`);
console.log(`Expected non-AUTO -> AUTO: ${report.unsafeAuto.length}; ${report.unsafeAuto.join(", ") || "none"}`);
console.log("Mismatches are retained. Evaluator tests passing does not mean 128/128 decisions passed.");
