import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { supportVerifyCases, runSupportCase } from "@/lib/support-verify";
import { GET as detail } from "@/app/api/support/requests/[id]/route";
import { GET as events } from "@/app/api/support/events/route";
import { GET as metrics } from "@/app/api/support/metrics/route";
import { POST, GET as list } from "@/app/api/support/requests/route";
import { resetSupportTestStore } from "@/lib/support-repository";
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const productionApi: typeof fetch = async (url, init) => {
  const request = new Request(`http://localhost${url}`, init);
  if (init?.method === "POST") return POST(request);
  if (String(url).startsWith("/api/support/events?")) return events(request);
  if (String(url) === "/api/support/metrics") return metrics();
  if (String(url).startsWith("/api/support/requests?")) return list(request);
  return detail(request, {
    params: Promise.resolve({ id: String(url).split("/").at(-1)! }),
  });
};
const employeeFixture = (item: Parameters<typeof runSupportCase>[0]) => ({
  ...item,
  fields: {
    ...item.fields,
    department: item.fields?.department || "engineering",
    employeeId: item.fields?.employeeId?.trim() || "VERIFY-EMP-42",
  },
});
it("the new Đề A pack has exactly three auto and two escalation cases", () => {
  const rows = supportVerifyCases.filter((item) => item.pack === "de-a-v3");
  expect(
    rows.filter((row) => row.expected_action === "AUTO_APPROVE"),
  ).toHaveLength(3);
  expect(rows.filter((row) => row.expected_action === "ESCALATE")).toHaveLength(
    2,
  );
});
it.each(supportVerifyCases.filter((item) => item.pack.endsWith("v3")))(
  "$id verifies against the production route",
  async (item) => {
    const result = await runSupportCase(employeeFixture(item), productionApi);
    expect(result.actual, result.error).toBeDefined();
    expect(result.pass, JSON.stringify(result)).toBe(true);
    expect(result.requestId).toBeTruthy();
  },
);
it.each(supportVerifyCases.filter((item) => item.pack === "submission-4"))(
  "$id verifies the submission case through the decision API and persistence readback",
  async (item) => {
    const result = await runSupportCase(employeeFixture(item), productionApi);
    expect(result.pass, JSON.stringify(result)).toBe(true);
    expect(result.actual).toMatchObject({
      action: item.expected_action,
      bucket: item.expected_bucket,
    });
    expect(result.actual?.ruleIds).toContain(item.expected_rule);
    expect(result.timestamp).toBeTruthy();
    expect(result.requestId).toBeTruthy();
    expect(result.persistence).toMatchObject({
      pass: true,
      checks: ["detail:pass", "audit:pass", "queue:pass", "metrics:pass"],
    });
    if (item.expected_action !== "AUTO_APPROVE") {
      expect(
        (result.actual?.questions?.length ?? 0) +
          (result.actual?.reviewerQuestions?.length ?? 0),
      ).toBeGreaterThan(0);
    }
  },
);
it("original fixtures and policy sources match their pre-migration hashes", () => {
  const manifest = JSON.parse(
    readFileSync("artifacts/migration-baseline-manifest.json", "utf8").replace(
      /^\uFEFF/,
      "",
    ),
  ) as Array<{ path: string; sha256: string }>;
  const originals = manifest.filter((item) =>
    item.path.startsWith("mlai26_new/data/"),
  );
  expect(originals.length).toBeGreaterThan(5);
  for (const item of originals)
    expect(
      createHash("sha256")
        .update(readFileSync(item.path))
        .digest("hex")
        .toUpperCase(),
      item.path,
    ).toBe(item.sha256);
});
it("reports original expectations without rewriting them or hiding mismatches", async () => {
  const original = supportVerifyCases.filter((item) =>
    item.pack.endsWith("original"),
  );
  expect(original).toHaveLength(128);
  const results = [];
  for (const item of original)
    results.push(await runSupportCase(employeeFixture(item), productionApi));
  expect(
    results.every(
      (result) => result.actual && result.requestId && result.timestamp,
    ),
  ).toBe(true);
  expect(results.some((result) => !result.pass)).toBe(true);
  expect(
    results
      .filter(
        (result) =>
          result.expected.action === "ESCALATE" &&
          ["SECURITY_RISK", "BEYOND_AUTHORITY"].includes(
            result.expected.bucket,
          ),
      )
      .every((result) => result.actual?.action !== "AUTO_APPROVE"),
  ).toBe(true);
  writeFileSync(
    "artifacts/original-fixture-evaluation.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        provider: "mock",
        route: "/api/support/requests",
        total: results.length,
        passed: results.filter((row) => row.pass).length,
        results,
      },
      null,
      2,
    ),
  );
});
