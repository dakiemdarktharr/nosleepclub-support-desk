import { cacheVerificationCases } from "./cache-verification";
import type { VerifyRun } from "./verification";
import type { VerifyResult } from "@/lib/support-verify";

type CacheResultItem = {
  caseId: string;
  text: string;
  expected?: string;
  result?: VerifyResult;
};
export type CacheResultGroup = {
  key: string;
  label: string;
  topic: string | null;
  kind: "similar" | "controls" | "unknown";
  items: CacheResultItem[];
  completed: number;
  passed: number;
  failed: number;
  recognized: number;
  hits: number;
  misses: number;
  bypasses: number;
  unavailable: number;
};

/** Group the cases of this saved run, including cases not yet executed.
 * Membership comes from the dataset; recognition and outcomes come only from
 * saved results. Seed requests are setup, never extra requests in the counts.
 */
export function groupCacheResults(run: Pick<VerifyRun, "cases" | "results">): CacheResultGroup[] {
  const fixtures = new Map(cacheVerificationCases.map(item => [item.id, item]));
  const results = new Map(run.results.map(result => [result.caseId, result]));
  const groups = new Map<string, CacheResultGroup>();
  for (const caseId of new Set(run.cases.map(item => item.caseId))) {
    const fixture = fixtures.get(caseId);
    const result = results.get(caseId);
    const key = fixture?.topic ?? (fixture ? "controls" : "unknown");
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: fixture?.topic ? fixture.group : fixture ? "Yêu cầu đối chứng" : "Yêu cầu chưa phân nhóm",
        topic: fixture?.topic ?? null,
        kind: fixture?.topic ? "similar" : fixture ? "controls" : "unknown",
        items: [], completed: 0, passed: 0, failed: 0, recognized: 0,
        hits: 0, misses: 0, bypasses: 0, unavailable: 0,
      };
      groups.set(key, group);
    }
    group.items.push({ caseId, text: fixture?.rawText ?? `Yêu cầu không còn trong bộ hiện tại: ${caseId}`,
      expected: result?.expected.action ?? fixture?.expected, result });
    if (!result) continue;
    group.completed++;
    if (result.pass) group.passed++;
    else group.failed++;
    if (group.topic && result.cache?.topic === group.topic) group.recognized++;
    if (result.cache?.actual === "HIT") group.hits++;
    else if (result.cache?.actual === "MISS") group.misses++;
    else if (result.cache?.actual === "BYPASS") group.bypasses++;
    else group.unavailable++;
  }
  return [...groups.values()];
}
