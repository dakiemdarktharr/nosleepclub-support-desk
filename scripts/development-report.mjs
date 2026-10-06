// Summarize the existing 128-case development run. No labels or predictions are changed.
import { readFileSync, writeFileSync } from "node:fs";
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
    const mismatchFields = !actual ? ["unavailable"] : [
      ...(row.expected.action !== actual.action ? ["action"] : []),
      ...(row.expected.bucket !== actual.bucket ? ["bucket"] : []),
      ...(row.expected.rule && !actual.ruleIds.includes(row.expected.rule) ? ["rule"] : []),
    ];
    // Trace signals are investigative leads, not new labels or expert adjudication.
    const signals = [];
    if (actual?.missingFields?.length) signals.push("MISSING_FACTS_REPORTED");
    if (actual?.ruleIds.includes("AUTH-007")) signals.push("APPROVAL_VERIFICATION_FAILED");
    if (actual?.ruleIds.includes("INFO-005")) signals.push("VERIFIED_APPROVAL_MISSING");
    if (actual?.ruleIds.includes("AUTH-005")) signals.push("UNMAPPED_REQUEST_OR_FRAGMENT");
    if (actual?.ruleIds.some(rule => /^(SEC-|AUTH-00[1-4689]|AUTH-QUOTA)/.test(rule))) signals.push("POLICY_RISK_OR_AUTHORITY_GATE");
    if (row.expected.action === "ESCALATE" && actual?.action === "NEEDS_INFORMATION") signals.push("ASK_VS_ESCALATE_CONTRACT_REVIEW");
    return { caseId: row.caseId, datasetCase: row.datasetCase, expected: row.expected, actual: actual ? {
      action: actual.action, bucket: actual.bucket, rules: actual.ruleIds,
      missingFields: actual.missingFields, approvalStatus: actual.approvalStatus,
      policyVersion: actual.policyVersion, evidence: actual.safeEvidence,
      reason: actual.adminReason, userReason: actual.userReason,
      questions: actual.questions, reviewerQuestions: actual.reviewerQuestions,
      subrequests: actual.subrequestOutcomes,
    } : null, exactMatch: match, mismatchFields, diagnosticSignals: signals,
      reviewStatus: match ? "development-label-match-only" : "requires-expert-adjudication",
      readbackPassed: row.persistence?.pass === true };
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

export function compareDevelopment(baseline, current) {
  const before = summarizeDevelopment(baseline), after = summarizeDevelopment(current);
  if (before.total !== after.total) throw new Error("Cannot compare different case sets");
  const old = new Map(before.rows.map(row => [row.caseId, row]));
  const changedCases = [];
  for (const row of after.rows) {
    const previous = old.get(row.caseId);
    if (!previous || JSON.stringify(previous.expected) !== JSON.stringify(row.expected))
      throw new Error("Case IDs/expected labels changed; refusing a misleading comparison");
    if (previous.datasetCase?.sha256 && row.datasetCase?.sha256 && previous.datasetCase.sha256 !== row.datasetCase.sha256)
      throw new Error("Case input/version changed; refusing comparison");
    const outcome = r => ({ action: r.actual?.action, bucket: r.actual?.bucket,
      rules: r.actual?.rules, missingFields: r.actual?.missingFields, subrequests: r.actual?.subrequests });
    if (JSON.stringify(outcome(previous)) !== JSON.stringify(outcome(row)))
      changedCases.push({ caseId: row.caseId, before: outcome(previous), after: outcome(row),
        beforeExact: previous.exactMatch, afterExact: row.exactMatch, diagnosticSignals: row.diagnosticSignals });
  }
  const baseHash = before.provenance.dataset?.sha256, currentHash = after.provenance.dataset?.sha256;
  if (baseHash && currentHash && baseHash !== currentHash) throw new Error("Dataset digest changed");
  return { ...after, comparison: {
    baselineProvenance: before.provenance,
    datasetIdentity: baseHash && currentHash ? "digest-verified" : "legacy-baseline-digest-unavailable-labels-only",
    before: { exactMatch: before.exactMatch, binaryEscalation: before.binaryEscalation, coverage: before.coverage },
    after: { exactMatch: after.exactMatch, binaryEscalation: after.binaryEscalation, coverage: after.coverage },
    regressedExactPass: after.rows.filter(row => old.get(row.caseId).exactMatch && !row.exactMatch).map(row => row.caseId),
    changedCases,
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] ?? "artifacts/original-fixture-evaluation.json";
  const args = process.argv.slice(3);
  const options = {};
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (!["--baseline", "--out"].includes(flag) || !value || value.startsWith("--") || options[flag]) throw new Error("Use [input.json] [--baseline base.json] [--out new-report.json]");
    options[flag] = value;
  }
  const read = file => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  const current = read(path);
  const report = options["--baseline"] ? compareDevelopment(read(options["--baseline"]), current) : summarizeDevelopment(current);
  const json = JSON.stringify(report, null, 2) + "\n";
  // Never silently replace a captured baseline or an existing report.
  if (options["--out"]) writeFileSync(options["--out"], json, { flag: "wx" });
  else process.stdout.write(json);
}
