import { safeInput } from "@/domain/text";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupportInput } from "@/domain/contracts";
import { supportVerifyCases, runSupportCase, judgePackIds } from "@/lib/support-verify";
import {
  insertVerifyRun,
  getVerifyRun,
  updateVerifyRun,
} from "@/lib/verify-repository";
import { SupportError } from "@/lib/support-repository";
import { supportInputSchema } from "@/domain/input";

export async function createVerifyRun(value: unknown) {
  const { pack } = z
    .object({ pack: z.string().max(100) })
    .strict()
    .parse(value);
  requireJudgePack(pack);
  const cases = supportVerifyCases.filter((item) => item.pack === pack);
  if (!cases.length)
    throw new SupportError("UNKNOWN_PACK", "Bộ kiểm thử không tồn tại.", 422);
  const now = new Date().toISOString();
  return insertVerifyRun({
    id: randomUUID(),
    version: 0,
    pack,
    createdAt: now,
    updatedAt: now,
    status: "RUNNING",
    results: [],
    cases: cases.map((item) => ({ caseId: item.id, requestId: randomUUID() })),
  });
}
function requireJudgePack(pack: string) {
  if (!judgePackIds.includes(pack))
    throw new SupportError("UNKNOWN_PACK", "Chỉ chạy bộ chung 4 trường hợp, bộ Đề A 5 trường hợp hoặc bộ 15 tình huống. Kết quả cũ chỉ dùng để đối chiếu lịch sử.", 422);
}
export async function validateVerificationInput(input: SupportInput) {
  if (!input.verifyRunId) return;
  const run = await getVerifyRun(input.verifyRunId);
  requireJudgePack(run.pack);
  const entry = run.cases.find((item) => item.caseId === input.verifyCaseId);
  const fixture = supportVerifyCases.find(
    (item) => item.id === input.verifyCaseId,
  );
  const expected =
    fixture &&
    supportInputSchema.parse({
      rawText: fixture.rawText,
      fields: {
        department: "engineering",
        employeeId: "verify-emp-42",
        ...fixture.fields,
      },
      confirmed: true,
      idempotencyKey: entry?.requestId,
      verifyRunId: run.id,
      verifyCaseId: fixture.id,
    });
  if (
    !entry ||
    !expected ||
    JSON.stringify(input) !== JSON.stringify(safeInput(expected).input)
  )
    throw new SupportError(
      "VERIFY_INPUT_MISMATCH",
      "Nội dung không khớp case của lần kiểm thử. Dùng ô nhập mới để thử yêu cầu riêng.",
      409,
    );
}
export async function executeVerifyCase(
  id: string,
  value: unknown,
  fetcher: typeof fetch,
) {
  const { caseId } = z
    .object({ caseId: z.string().max(150) })
    .strict()
    .parse(value);
  const run = await getVerifyRun(id);
  requireJudgePack(run.pack);
  const existing = run.results.find((item) => item.caseId === caseId);
  if (existing) return run;
  if (run.status !== "RUNNING")
    throw new SupportError(
      "RUN_NOT_ACTIVE",
      "Lần kiểm thử đã dừng hoặc kết thúc.",
      409,
    );
  const entry = run.cases.find((item) => item.caseId === caseId),
    fixture = supportVerifyCases.find((item) => item.id === caseId);
  if (!entry || !fixture)
    throw new SupportError(
      "UNKNOWN_CASE",
      "Case không thuộc lần kiểm thử.",
      422,
    );
  const result = await runSupportCase(fixture, fetcher, {
    runId: id,
    requestId: entry.requestId,
  });
  // Throttling is resumable: do not record a rate limit as a policy failure.
  if (result.httpStatus === 429)
    throw new SupportError(
      "RATE_LIMITED",
      "Tạm dừng một phút trước khi tiếp tục lần kiểm thử này.",
      429,
    );
  if (result.retryable)
    throw new SupportError(
      "VERIFY_RETRYABLE",
      "Chưa có kết quả kiểm chứng do API hoặc đọc lại tạm lỗi. Bấm Tiếp tục để thử lại cùng case; chưa ghi FAIL.",
      503,
    );
  return updateVerifyRun(id, (draft) => {
    if (!draft.results.some((item) => item.caseId === caseId))
      draft.results.push(result);
    if (draft.results.length === draft.cases.length) {
      draft.status = "COMPLETE";
      draft.completedAt = new Date().toISOString();
    }
  });
}
export async function changeVerifyRun(id: string, value: unknown) {
  const { action } = z
    .object({ action: z.enum(["stop", "resume"]) })
    .strict()
    .parse(value);
  return updateVerifyRun(id, (run) => {
    if (action === "resume") requireJudgePack(run.pack);
    if (run.status === "COMPLETE") return;
    run.status = action === "stop" ? "STOPPED" : "RUNNING";
  });
}
