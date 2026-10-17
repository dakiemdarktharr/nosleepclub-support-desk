import { supportApi, requestId, requireDemoReviewer } from "@/lib/support-http";
import { requestServiceLevels } from "@/services/service-level";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return supportApi(async () => {
    requireDemoReviewer();
    return requestServiceLevels(requestId((await context.params).id));
  });
}
