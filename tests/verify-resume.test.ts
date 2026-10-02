import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { changeVerifyRun, createVerifyRun, executeVerifyCase } from "@/services/verification";
import { getVerifyRun } from "@/lib/verify-repository";
import { resetSupportTestStore } from "@/lib/support-repository";
import { POST, GET as list } from "@/app/api/support/requests/route";
import { GET as detail } from "@/app/api/support/requests/[id]/route";
import { GET as events } from "@/app/api/support/events/route";
import { GET as metrics } from "@/app/api/support/metrics/route";

beforeEach(() => { vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("AI_MAX_ATTEMPTS", "0"); resetSupportTestStore(); });
afterEach(() => vi.unstubAllEnvs());
const api: typeof fetch = async (url, init) => {
  const request = new Request(`http://localhost${url}`, init);
  if (init?.method === "POST") return POST(request);
  if (String(url).startsWith("/api/support/events?")) return events(request);
  if (String(url) === "/api/support/metrics") return metrics();
  if (String(url).startsWith("/api/support/requests?")) return list(request);
  return detail(request, { params: Promise.resolve({ id: String(url).split("/").at(-1)! }) });
};
it.each(["json-503", "html-502", "rate-limit", "network", "processing", "readback"])("keeps %s retryable without consuming a case result or changing request ID", async (failure) => {
  const run = await createVerifyRun({ pack: "de-a-v3" });
  const entry = run.cases[0];
  const broken: typeof fetch = async (url, init) => {
    if (failure === "network") throw new Error("synthetic network outage");
    if (failure === "html-502") return new Response("<html>gateway unavailable</html>", { status: 502 });
    if (failure === "readback" && init?.method === "POST") return api(url, init);
    const status = failure === "rate-limit" ? 429 : failure === "processing" ? 409 : 503;
    return Response.json({ success: false, error: { code: failure === "processing" ? "REQUEST_PROCESSING" : "SERVER_ERROR", message: "synthetic unavailable" } }, { status });
  };
  await expect(executeVerifyCase(run.id, { caseId: entry.caseId }, broken)).rejects.toMatchObject({ code: failure === "rate-limit" ? "RATE_LIMITED" : "VERIFY_RETRYABLE" });
  expect((await getVerifyRun(run.id)).results).toHaveLength(0);
  const completed = await executeVerifyCase(run.id, { caseId: entry.caseId }, api);
  expect(completed.results[0]).toMatchObject({ requestId: entry.requestId, pass: true });
});
it("retains deterministic validation failures and does not silently retry them", async () => {
  const run = await createVerifyRun({ pack: "de-a-v3" });
  const invalid: typeof fetch = async () => Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "synthetic invalid fixture" } }, { status: 422 });
  const result = await executeVerifyCase(run.id, { caseId: run.cases[0].caseId }, invalid);
  expect(result.results[0]).toMatchObject({ pass: false, httpStatus: 422 });
  const never = vi.fn();
  await executeVerifyCase(run.id, { caseId: run.cases[0].caseId }, never);
  expect(never).not.toHaveBeenCalled();
});
it("runs the submission four-case pack through the decision API and resumes without duplicate requests", async () => {
  const run = await createVerifyRun({ pack: "submission-4" });
  expect(run.cases).toHaveLength(4);
  expect(new Set(run.cases.map((entry) => entry.caseId)).size).toBe(4);

  await changeVerifyRun(run.id, { action: "stop" });
  const calls = vi.fn(api);
  await expect(
    executeVerifyCase(run.id, { caseId: run.cases[0].caseId }, calls),
  ).rejects.toMatchObject({ code: "RUN_NOT_ACTIVE" });
  expect(calls).not.toHaveBeenCalled();

  await changeVerifyRun(run.id, { action: "resume" });
  const first = await executeVerifyCase(
    run.id,
    { caseId: run.cases[0].caseId },
    calls,
  );
  expect(first.results[0]).toMatchObject({
    caseId: run.cases[0].caseId,
    requestId: run.cases[0].requestId,
    pass: true,
    persistence: {
      pass: true,
      checks: ["detail:pass", "audit:pass", "queue:pass", "metrics:pass"],
    },
  });
  expect(Date.parse(first.results[0].timestamp)).not.toBeNaN();
  const callsAfterFirst = calls.mock.calls.length;
  const duplicate = await executeVerifyCase(
    run.id,
    { caseId: run.cases[0].caseId },
    calls,
  );
  expect(duplicate.results).toHaveLength(1);
  expect(calls).toHaveBeenCalledTimes(callsAfterFirst);

  await changeVerifyRun(run.id, { action: "stop" });
  await expect(
    executeVerifyCase(run.id, { caseId: run.cases[1].caseId }, calls),
  ).rejects.toMatchObject({ code: "RUN_NOT_ACTIVE" });
  expect(calls).toHaveBeenCalledTimes(callsAfterFirst);

  await changeVerifyRun(run.id, { action: "resume" });
  let completed = duplicate;
  for (const entry of run.cases.slice(1)) {
    completed = await executeVerifyCase(
      run.id,
      { caseId: entry.caseId },
      calls,
    );
  }
  expect(completed.status).toBe("COMPLETE");
  expect(completed.results).toHaveLength(4);
  expect(completed.results.every((result) => result.pass)).toBe(true);
  expect(completed.results.map((result) => result.requestId)).toEqual(
    run.cases.map((entry) => entry.requestId),
  );
  expect(completed.results.every((result) => result.timestamp)).toBe(true);
});
