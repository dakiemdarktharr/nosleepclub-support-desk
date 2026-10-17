import dataset from "../../data/cache-system.json";

export const cachePackId = "test-cache-system";
export const cachePackName = dataset.name;
export type CacheOutcome = "HIT" | "MISS" | "BYPASS";
export type CacheCase = {
  id: string;
  group: string;
  rawText: string;
  expected: CacheOutcome;
  topic: string | null;
  seeds: string[];
  reason: string;
};
export const cacheVerificationCases: CacheCase[] = [
  ...dataset.groups.flatMap(group => group.requests.map((rawText, index) => ({
    id: `cache-${group.id}-${index + 1}`,
    group: group.label,
    rawText,
    expected: index === 0 ? "MISS" as const : "HIT" as const,
    topic: group.topic,
    // Independent cases replay their seeds, so resume/retry and another worker
    // cannot turn a cold-cache expectation into a hit by accident.
    seeds: dataset.groups.filter(other => other.id !== group.id || index > 0).map(other => other.requests[0]),
    reason: index === 0 ? "Nhóm mới phải miss dù các nhóm khác đã có cache." : "Cùng vấn đề với câu đầu nhóm dù đổi cách diễn đạt.",
  }))),
  ...dataset.controls.map(row => ({
    id: `cache-${row.id}`, group: "Đối chứng: không dùng chung", rawText: row.text,
    expected: "BYPASS" as const, topic: null, seeds: dataset.groups.map(group => group.requests[0]), reason: row.reason,
  })),
];
export type CacheCheck = {
  group: string;
  expected: CacheOutcome;
  actual: CacheOutcome;
  topic: string | null;
  seeds: number;
  lexicalSimilarity?: number;
  checks: string[];
  pass: boolean;
};
