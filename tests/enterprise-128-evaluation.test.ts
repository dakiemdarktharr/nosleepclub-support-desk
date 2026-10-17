import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import candidate from "../mlai26_new/data/verify/enterprise-128-v1.json";
import manifest from "../mlai26_new/data/verify/enterprise-128-v1.manifest.json";
import { evaluateBatch, evaluationActions } from "@/domain/evaluation";
import { POLICY_VERSION } from "@/domain/policy-source";
import { runSupportCase, supportVerifyCases, type VerifyResult } from "@/lib/support-verify";
import { resetSupportTestStore } from "@/lib/support-repository";
import { POST, GET as queue } from "@/app/api/support/requests/route";
import { GET as detail } from "@/app/api/support/requests/[id]/route";
import { GET as events } from "@/app/api/support/events/route";
import { GET as metrics } from "@/app/api/support/metrics/route";

const groups = [
  "device_guidance", "network_account_guidance", "missing_facts", "security_controls",
  "secrets_and_exposure", "authority", "injection_and_mixed", "evidence_and_faults",
] as const;
const caseSchema = z.object({
  id: z.string().regex(/^e128-[a-z0-9-]+$/),
  pack: z.literal("enterprise-128-v1"),
  group: z.enum(groups),
  rawText: z.string().min(1).max(6000),
  expected_action: z.enum(evaluationActions),
  expected_bucket: z.enum(["ROUTINE", "MISSING_INFO", "BEYOND_AUTHORITY", "SECURITY_RISK"]),
  expected_rule: z.string().min(1),
  fault: z.enum(["invalid", "unavailable"]).optional(),
  rationale: z.string().min(20),
}).strict();
const cases = z.array(caseSchema).length(128).parse(candidate.cases);
const datasetPath = "mlai26_new/data/verify/enterprise-128-v1.json";
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const normalizeText = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("AI_TEST_MAX_ATTEMPTS", "0");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("IDENTITY_MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());

// The same route handlers and readback contracts as the application are used.
// No mock decision, direct policy call or expected-result dispatch is supplied.
const applicationApi: typeof fetch = async (url, init) => {
  const request = new Request(`http://localhost${url}`, init);
  if (init?.method === "POST") return POST(request);
  if (String(url).startsWith("/api/support/events?")) return events(request);
  if (String(url) === "/api/support/metrics") return metrics();
  if (String(url).startsWith("/api/support/requests?")) return queue(request);
  return detail(request, { params: Promise.resolve({ id: String(url).split("/").at(-1)! }) });
};

it("freezes 128 distinct candidate labels before evaluation and preserves the legacy corpora", () => {
  // This corpus is frozen against its original policy. Evaluate its unchanged
  // labels against the current policy below; never rewrite historical provenance.
  expect(candidate.policyVersion).toBe("support-guidance-v5.20");
  expect(candidate.source).toBe("synthetic");
  expect(candidate.split).toBe("development");
  expect(candidate.labelStatus).toBe("ai-authored-before-first-run-not-independently-reviewed");
  expect(sha256(readFileSync(datasetPath))).toBe(manifest.sha256);
  expect(new Set(cases.map(row => row.id)).size).toBe(128);
  expect(new Set(cases.map(row => normalizeText(row.rawText))).size).toBe(128);
  const originalText = new Set(supportVerifyCases.map(row => normalizeText(row.rawText)));
  expect(cases.every(row => !originalText.has(normalizeText(row.rawText)))).toBe(true);
  for (const group of groups) expect(cases.filter(row => row.group === group)).toHaveLength(16);
  for (const action of evaluationActions)
    expect(cases.filter(row => row.expected_action === action)).toHaveLength(manifest.expectedActions[action]);
  expect(cases.filter(row => row.fault)).toHaveLength(8);
});

const exactDecision = (result: VerifyResult) => Boolean(result.actual &&
  result.actual.action === result.expected.action && result.actual.bucket === result.expected.bucket &&
  (!result.expected.rule || result.actual.ruleIds.includes(result.expected.rule)));

it("reports every candidate outcome through the decision API without relabelling or an invented accuracy gate", async () => {
  // Freeze/integrity guard runs here too: evaluating this test in isolation must
  // never bypass the pre-run manifest check.
  expect(sha256(readFileSync(datasetPath))).toBe(manifest.sha256);
  const results: VerifyResult[] = [];
  for (const item of cases) results.push(await runSupportCase(item, applicationApi));
  const sourceRevision = git("rev-parse", "HEAD");
  const actionMetrics = evaluateBatch({
    datasetId: candidate.datasetId, split: "development", evidence: "synthetic",
    policyVersion: POLICY_VERSION, sourceRevision,
    developmentCaseIds: cases.map(row => row.id),
    rows: results.map(row => ({
      caseId: row.caseId, expectedAction: row.expected.action,
      actualAction: row.actual?.action ?? null, observedAt: row.timestamp,
      review: { reviewerId: "ai-dataset-author", labelledBeforeRun: true },
    })),
  });
  const groupMetrics = groups.map(group => {
    const ids = new Set(cases.filter(row => row.group === group).map(row => row.id));
    const rows = results.filter(row => ids.has(row.caseId));
    return {
      group, total: rows.length,
      available: rows.filter(row => row.actual).length,
      actionCorrect: rows.filter(row => row.actual?.action === row.expected.action).length,
      exactCorrect: rows.filter(exactDecision).length,
      endToEndPassed: rows.filter(row => row.pass).length,
    };
  });
  const exactCorrect = results.filter(exactDecision).length;
  const actionCorrect = results.filter(row => row.actual?.action === row.expected.action).length;
  const report = {
    generatedAt: new Date().toISOString(), datasetId: candidate.datasetId,
    provenance: {
      sourceRevision, applicationSourceChanged: Boolean(git("diff", "HEAD", "--", "src")),
      runtimeDigest: sha256(git("ls-files", "-z", "src", "package-lock.json").split("\0").filter(Boolean).sort()
        .map(path => `${path}\0${sha256(readFileSync(path))}`).join("\n")),
      evaluatorDigest: sha256(readFileSync("tests/enterprise-128-evaluation.test.ts")),
      datasetSha256: manifest.sha256, policy: POLICY_VERSION, node: process.version,
      provider: "mock-no-api-call", storage: "memory-demo", transport: "in-process-application-route-handlers",
      labelStatus: candidate.labelStatus, independentHeldOut: "NOT_COLLECTED",
    },
    total: results.length, actionCorrect, actionRateAllCases: actionCorrect / cases.length,
    exactCorrect, exactRateAllCases: exactCorrect / cases.length,
    endToEndPassed: results.filter(row => row.pass).length,
    readbackPassed: results.filter(row => row.persistence?.pass).length,
    unsafeAuto: results.filter(row => row.expected.action !== "AUTO_APPROVE" && row.actual?.action === "AUTO_APPROVE").map(row => row.caseId),
    actionMetrics, groups: groupMetrics,
    limitations: [
      "AI-authored synthetic development labels, frozen before the first run; no independent adjudication or held-out claim.",
      "Case families include related paraphrases; 128 cases are not 128 independent security proofs.",
      "Mock extraction/fault simulation and memory readback do not establish live LLM quality, Mongo durability, identity assurance or sandbox isolation.",
      "A new dataset cannot establish improvement over the legacy dataset. Keep both results and every mismatch.",
      "This test validates the evaluator and reports accuracy; it is not a production release accuracy gate.",
    ],
    results: results.map((row, index) => ({ ...row, group: cases[index].group, rawText: cases[index].rawText,
      rationale: cases[index].rationale, fault: cases[index].fault })),
  };
  writeFileSync("artifacts/enterprise-128-results.json", JSON.stringify(report, null, 2) + "\n");
  console.info(JSON.stringify({ total: report.total, actionCorrect, exactCorrect,
    available: actionMetrics.scored, readbackPassed: report.readbackPassed, unsafeAuto: report.unsafeAuto, groups: groupMetrics }));
  // A missing prediction/readback is a harness/integration failure. A policy
  // mismatch stays visible in the report; it is never rewritten into a pass.
  expect(actionMetrics.scored).toBe(128);
  expect(report.readbackPassed).toBe(128);
  expect(sha256(readFileSync(datasetPath))).toBe(manifest.sha256);
});
