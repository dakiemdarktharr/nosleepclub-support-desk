import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { judgePackIds, supportVerifyCases } from "@/lib/support-verify";
import { createVerifyRun, changeVerifyRun, executeVerifyCase, validateVerificationInput } from "@/services/verification";
import { insertVerifyRun } from "@/lib/verify-repository";
import { submitSupport } from "@/services/support";
import { resetSupportTestStore } from "@/lib/support-repository";
import { supportInputSchema } from "@/domain/input";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("AI_MAX_ATTEMPTS", "0");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());

it("offers the four, five, and fifteen case judge packs with distinct case IDs", async () => {
  expect(judgePackIds).toEqual(["de-a-v3", "submission-4", "judge-15"]);
  for (const [pack, count] of [["de-a-v3", 5], ["submission-4", 4], ["judge-15", 15]] as const) {
    const run = await createVerifyRun({ pack });
    expect(run.cases).toHaveLength(count);
    expect(new Set(run.cases.map(row => row.caseId)).size).toBe(count);
  }
  const submission = supportVerifyCases.filter(row => row.pack === "submission-4");
  expect(submission.filter(row => row.expected_action === "AUTO_APPROVE")).toHaveLength(2);
  expect(submission.filter(row => row.expected_action === "NEEDS_INFORMATION")).toHaveLength(1);
  expect(submission.filter(row => row.expected_action === "ESCALATE")).toHaveLength(1);
  expect(submission.some(row => row.expected_bucket === "SECURITY_RISK")).toBe(true);
  const cases = supportVerifyCases.filter(row => row.pack === "judge-15");
  expect(cases.some(row => row.expected_bucket === "MISSING_INFO")).toBe(true);
  expect(cases.some(row => row.expected_bucket === "SECURITY_RISK")).toBe(true);
  expect(cases.some(row => row.expected_bucket === "BEYOND_AUTHORITY")).toBe(true);
  expect(cases.every(row => !row.fault)).toBe(true);
});

it.each(supportVerifyCases.filter(row => row.pack === "judge-15"))("$id follows the documented policy without a special judge decision path", async (item) => {
  const row = await submitSupport({ rawText: item.rawText, fields: { department: "engineering", employeeId: "VERIFY-EMP-42", ...item.fields }, confirmed: true, idempotencyKey: crypto.randomUUID() });
  expect(row.decision).toMatchObject({action:item.expected_action, bucket:item.expected_bucket});
  expect(row.decision?.ruleIds).toContain(item.expected_rule);
  if (item.expected_action !== "AUTO_APPROVE") {
    expect((row.decision?.questions?.length ?? 0) + (row.decision?.reviewerQuestions?.length ?? 0)).toBeGreaterThan(0);
  }
});

it.each(["all", "extended-v3", "official-original", "ground-truth-original"])("rejects new or resumed runs for retired pack %s", async (pack) => {
  await expect(createVerifyRun({ pack })).rejects.toMatchObject({code:"UNKNOWN_PACK"});
  const now = new Date().toISOString();
  const row = await insertVerifyRun({id:crypto.randomUUID(),version:0,pack,createdAt:now,updatedAt:now,status:"STOPPED",cases:[],results:[]});
  await expect(changeVerifyRun(row.id,{action:"resume"})).rejects.toMatchObject({code:"UNKNOWN_PACK"});
  await expect(executeVerifyCase(row.id,{caseId:"old-case"},vi.fn())).rejects.toMatchObject({code:"UNKNOWN_PACK"});
  const input = supportInputSchema.parse({rawText:"Restart laptop",confirmed:true,idempotencyKey:crypto.randomUUID(),verifyRunId:row.id,verifyCaseId:"old-case"});
  await expect(validateVerificationInput(input)).rejects.toMatchObject({code:"UNKNOWN_PACK"});
});
