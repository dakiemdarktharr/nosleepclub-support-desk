import { z } from "zod";
import { errorResponse, successResponse } from "./api-response";
import { SupportError } from "./support-repository";
import { supportInputSchema } from "@/domain/input";
import { employeeIdentityError } from "@/domain/employee-identity";
import { safeInput } from "@/domain/text";
import { validateVerificationInput } from "@/services/verification";

type RateWindow = { startedAt: number; count: number };
type SupportHttpRuntime = { supportRateLimits?: Map<string, RateWindow> };
const httpRuntime = globalThis as typeof globalThis & SupportHttpRuntime;

export async function supportApi(work: () => Promise<unknown>, status = 200) {
  try {
    return successResponse(await work(), { status });
  } catch (error) {
    if (error instanceof SupportError)
      return errorResponse(error.code, error.message, error.status);
    if (error instanceof z.ZodError)
      return errorResponse(
        "VALIDATION_ERROR",
        "Dữ liệu không hợp lệ.",
        422,
        error.issues.map((issue) => ({
          // Record keys can contain private input; expose only the schema root.
          field: String(issue.path[0] ?? "input"),
          code: issue.code,
        })),
      );
    // Never log database/provider exception bodies, prompts or credentials.
    return errorResponse(
      "SERVER_ERROR",
      "Không thể hoàn tất. Kiểm tra cấu hình hoặc thử lại sau.",
      503,
    );
  }
}
export async function supportBody(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const parsed = URL.parse(origin),
      target = new URL(request.url);
    if (
      !parsed ||
      parsed.origin !== origin ||
      (origin !== target.origin &&
        !(
          parsed.host === request.headers.get("host") &&
          parsed.protocol === target.protocol
        ))
    )
      throw new SupportError("INVALID_ORIGIN", "Origin không hợp lệ.", 403);
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new SupportError("CONTENT_TYPE", "Cần JSON body.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new SupportError("VALIDATION_ERROR", "Thiếu body.", 422);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 64000) {
        await reader.cancel();
        throw new SupportError("TOO_LARGE", "Nội dung quá dài.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new SupportError("VALIDATION_ERROR", "JSON không hợp lệ.", 422);
  }
}
export function requireDemoReviewer() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SUPPORT_ACCESS_MODE !== "public-demo"
  )
    throw new SupportError(
      "REVIEW_NOT_ENABLED",
      "Reviewer công khai chỉ dùng cho demo đã bật rõ ràng.",
      403,
    );
  return "public-demo-reviewer";
}
export async function requireEmployeeIdentity(value: unknown) {
  const input = supportInputSchema.parse(value);
  // Only an exact fixture in a server-created Verify run can use the synthetic path.
  // Validate here too: preview does not go through submitSupport's Verify guard.
  if (input.verifyRunId) {
    await validateVerificationInput(safeInput(input).input);
    return input;
  }
  const identityError = employeeIdentityError(input.fields);
  if (identityError)
    throw new SupportError(
      "IDENTITY_REQUIRED",
      identityError,
      422,
    );
  return input;
}
export function enforceDemoRateLimit(
  request: Request,
  scope: "intake" | "mutation",
) {
  if (process.env.NODE_ENV !== "production") return;
  const now = Date.now();
  const windowMs = 60_000;
  const limit = scope === "intake" ? 30 : 15;
  const client =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous";
  const key = `${scope}:${client}`;
  const limits = (httpRuntime.supportRateLimits ??= new Map());
  const current = limits.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    limits.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= limit)
    throw new SupportError(
      "RATE_LIMITED",
      "Quá nhiều yêu cầu demo. Thử lại sau một phút.",
      429,
    );
  current.count += 1;
}
export const requestId = (id: string) => z.string().uuid().parse(id);
export function verifyModelOptions(request: Request) {
  const fault = request.headers.get("x-support-model-simulation");
  if (!fault) return {};
  if (
    process.env.SUPPORT_VERIFY_FAULTS !== "true" &&
    process.env.NODE_ENV === "production"
  )
    throw new SupportError(
      "SIMULATION_DISABLED",
      "Fault simulation chưa bật ở môi trường này.",
      403,
    );
  return { fault: z.enum(["unavailable", "invalid"]).parse(fault) };
}
