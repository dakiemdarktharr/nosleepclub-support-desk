import {
  supportApi,
  supportBody,
  requestId,
  requireDemoReviewer,
  enforceDemoRateLimit,
} from "@/lib/support-http";
import { executeVerifyCase } from "@/services/verification";
import { getVerifyRun } from "@/lib/verify-repository";
import { cachePackId } from "@/domain/cache-verification";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return supportApi(async () => {
    requireDemoReviewer();
    const id = requestId((await context.params).id);
    const run = await getVerifyRun(id);
    enforceDemoRateLimit(request, run.pack === cachePackId ? "cache-verify" : "verify");
    const origin = new URL(request.url).origin;
    const productionApi: typeof fetch = (path, init) => {
      const headers = new Headers(init?.headers);
      const client = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (client) headers.set("x-forwarded-for", client.slice(0, 80));
      return fetch(new URL(String(path), origin), { ...init, headers, cache: "no-store" });
    };
    return executeVerifyCase(
      id,
      await supportBody(request),
      productionApi,
    );
  });
}
