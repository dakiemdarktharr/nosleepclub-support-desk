import {
  enforceDemoRateLimit,
  requireEmployeeIdentity,
  supportApi,
  supportBody,
} from "@/lib/support-http";
import { previewSupport } from "@/services/support";
export async function POST(request: Request) {
  return supportApi(async () => {
    enforceDemoRateLimit(request, "intake");
    const body = await requireEmployeeIdentity(await supportBody(request), request);
    return previewSupport(body);
  });
}
