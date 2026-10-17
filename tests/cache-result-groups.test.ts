import { expect, it } from "vitest";
import { groupCacheResults } from "@/domain/cache-result-groups";
import { cacheVerificationCases } from "@/domain/cache-verification";
import { runCacheVerificationCase } from "@/services/cache-verification";
import type { VerifyResult } from "@/lib/support-verify";

const cases = cacheVerificationCases.map(item => ({ caseId: item.id, requestId: item.id }));

it("reports four groups of seven similar requests and keeps fourteen controls separate", async () => {
  const results = await Promise.all(cases.map(item => runCacheVerificationCase(item.caseId)));
  const groups = groupCacheResults({ cases, results });
  expect(groups).toHaveLength(5);
  for (const group of groups.filter(item => item.kind === "similar")) {
    expect(group.items).toHaveLength(7);
    expect(group).toMatchObject({ completed: 7, passed: 7, failed: 0, recognized: 7,
      hits: 6, misses: 1, bypasses: 0, unavailable: 0 });
  }
  const controls = groups.find(group => group.kind === "controls")!;
  expect(controls.items).toHaveLength(14);
  expect(controls).toMatchObject({ topic: null, completed: 14, passed: 14,
    recognized: 0, hits: 0, misses: 0, bypasses: 14 });
  // The cache setup seeds must never inflate the number of submitted cases.
  expect(groups.reduce((sum, group) => sum + group.items.length, 0)).toBe(42);
});

it("counts only completed results in a partial run, preserving every unrun request", async () => {
  const result = await runCacheVerificationCase(cases[0].caseId);
  const groups = groupCacheResults({ cases, results: [result] });
  expect(groups[0]).toMatchObject({ completed: 1, passed: 1, recognized: 1, misses: 1, hits: 0 });
  expect(groups[0].items).toHaveLength(7);
  expect(groups[0].items.filter(item => !item.result)).toHaveLength(6);
  expect(groups.slice(1).every(group => group.completed === 0 && group.passed === 0)).toBe(true);
});

it("shows wrong-group matches and missing cache metadata as failures, not recognized requests", async () => {
  const first = await runCacheVerificationCase(cases[0].caseId);
  const wrong = await runCacheVerificationCase(cases[1].caseId);
  wrong.pass = false;
  wrong.cache = { ...wrong.cache!, pass: false, topic: "printer:offline", checks: ["topic:fail"] };
  const error: VerifyResult = { caseId: cases[2].caseId, timestamp: first.timestamp,
    expected: { action: "HIT", bucket: "FAQ_CACHE" }, pass: false, error: "Không đọc được cache." };
  const group = groupCacheResults({ cases, results: [first, wrong, error] })[0];
  expect(group).toMatchObject({ completed: 3, passed: 1, failed: 2, recognized: 1, hits: 1, misses: 1, unavailable: 1 });
  expect(group.items[1].result?.cache?.checks).toContain("topic:fail");
  expect(group.items[2].result?.error).toBe("Không đọc được cache.");
});

it("counts unique cases in this run and uses the last saved result without including another run", async () => {
  const result = await runCacheVerificationCase(cases[0].caseId);
  const other = await runCacheVerificationCase(cases[1].caseId);
  const groups = groupCacheResults({ cases: [cases[0], cases[0]],
    results: [{ ...result, pass: false }, result, other] });
  expect(groups).toHaveLength(1);
  expect(groups[0].items).toHaveLength(1);
  expect(groups[0]).toMatchObject({ completed: 1, passed: 1, failed: 0 });
});

it("retains an older unmapped case and its saved expectation instead of dropping it", () => {
  const result: VerifyResult = { caseId: "retired-case", timestamp: "2026-01-01T00:00:00Z",
    expected: { action: "MISS", bucket: "FAQ_CACHE" }, pass: false, error: "Historical result" };
  const groups = groupCacheResults({ cases: [{ caseId: result.caseId, requestId: "unused" }], results: [result] });
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ kind: "unknown", completed: 1, failed: 1, unavailable: 1 });
  expect(groups[0].items[0]).toMatchObject({ caseId: "retired-case", expected: "MISS", result });
});
