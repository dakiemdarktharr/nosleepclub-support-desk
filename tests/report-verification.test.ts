import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  createVerifyRun,
  executeVerifyCase,
  changeVerifyRun,
} from "@/services/verification";
import { getVerifyRun } from "@/lib/verify-repository";
import {
  resetSupportTestStore,
  getSupportRequest,
} from "@/lib/support-repository";
import {
  supportPage,
  auditPage,
  supportMetrics,
  parseSupportQuery,
} from "@/lib/support-query";
import { submitSupport } from "@/services/support";
import { POST, GET as list } from "@/app/api/support/requests/route";
import { GET as detail } from "@/app/api/support/requests/[id]/route";
import { GET as events } from "@/app/api/support/events/route";
import { GET as metrics } from "@/app/api/support/metrics/route";
beforeEach(() => {
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("AI_PROVIDER", "mock");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const productionApi: typeof fetch = async (url, init) => {
  const r = new Request(`http://localhost${url}`, init);
  if (init?.method === "POST") return POST(r);
  if (String(url).startsWith("/api/support/events?")) return events(r);
  if (String(url) === "/api/support/metrics") return metrics();
  if (String(url).startsWith("/api/support/requests?")) return list(r);
  return detail(r, {
    params: Promise.resolve({ id: String(url).split("/").at(-1)! }),
  });
};
it("E03/E04/E17 persists the five judge results through the production API and reloads them", async () => {
  let run = await createVerifyRun({ pack: "de-a-v3" });
  expect(run.cases).toHaveLength(5);
  for (const entry of run.cases)
    run = await executeVerifyCase(
      run.id,
      { caseId: entry.caseId },
      productionApi,
    );
  expect(run.status).toBe("COMPLETE");
  expect(run.completedAt).toBeTruthy();
  expect(
    run.results.every((r) => r.pass),
    JSON.stringify(run.results),
  ).toBe(true);
  expect(run.results.some((r) => r.actual?.action === "ESCALATE")).toBe(true);
  expect(await getVerifyRun(run.id)).toEqual(run);
  const replay = await executeVerifyCase(
    run.id,
    { caseId: run.cases[0].caseId },
    vi.fn(),
  );
  expect(replay.results).toHaveLength(5);
  const support = await supportPage(
    parseSupportQuery("http://local?origin=support"),
  );
  const verify = await supportPage(
    parseSupportQuery("http://local?origin=verify"),
  );
  expect(support.total).toBe(0);
  expect(verify.total).toBe(5);
  const request = await getSupportRequest(run.cases[0].requestId);
  expect(request?.input.verifyRunId).toBe(run.id);
});
it("Verify can stop/resume without rerunning completed cases", async () => {
  let run = await createVerifyRun({ pack: "de-a-v3" });
  run = await executeVerifyCase(
    run.id,
    { caseId: run.cases[0].caseId },
    productionApi,
  );
  await changeVerifyRun(run.id, { action: "stop" });
  await expect(
    executeVerifyCase(run.id, { caseId: run.cases[1].caseId }, productionApi),
  ).rejects.toMatchObject({ code: "RUN_NOT_ACTIVE" });
  await changeVerifyRun(run.id, { action: "resume" });
  run = await executeVerifyCase(
    run.id,
    { caseId: run.cases[1].caseId },
    productionApi,
  );
  expect(run.results).toHaveLength(2);
});
it("Verify provenance cannot hide arbitrary requests or accept forged expected outcomes", async () => {
  const run = await createVerifyRun({ pack: "de-a-v3" });
  await expect(
    submitSupport({
      rawText: "Grant production admin",
      fields: { department: "engineering", employeeId: "EMP-TEST-01" },
      confirmed: true,
      idempotencyKey: run.cases[0].requestId,
      verifyRunId: run.id,
      verifyCaseId: run.cases[0].caseId,
    }),
  ).rejects.toMatchObject({ code: "VERIFY_INPUT_MISMATCH" });
  await expect(
    executeVerifyCase(
      run.id,
      { caseId: run.cases[0].caseId, expected_action: "AUTO_APPROVE" },
      productionApi,
    ),
  ).rejects.toThrow();
});
it("E18 pagination/search/audit and metrics include records older than the summary list limit", async () => {
  for (let i = 0; i < 205; i++)
    await submitSupport({
      rawText: `Restart my laptop. Reference ${i === 0 ? "old-record-target" : i}`,
      fields: { department: "engineering", employeeId: "EMP-TEST-01" },
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
  const q = parseSupportQuery("http://local?limit=100");
  const first = await supportPage(q);
  const second = await supportPage({ ...q, cursor: Number(first.nextCursor) });
  const third = await supportPage({ ...q, cursor: Number(second.nextCursor) });
  expect(
    new Set([...first.items, ...second.items, ...third.items].map((r) => r.id))
      .size,
  ).toBe(205);
  expect(third.nextCursor).toBeNull();
  const search = await supportPage({ ...q, q: "old-record-target" });
  expect(search.total).toBe(1);
  const audit = await auditPage({ ...q, q: "old-record-target" });
  expect(audit.total).toBe(2);
  expect((await supportMetrics()).total).toBe(205);
  expect((await supportPage({ ...q, q: ".*" })).total).toBe(0);
});
it("paged query validates limits instead of issuing unbounded queries", () => {
  expect(() => parseSupportQuery("http://local?limit=100000")).toThrow();
  expect(() => parseSupportQuery("http://local?cursor=-1")).toThrow();
});
