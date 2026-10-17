import { supportApi, requireDemoReviewer } from "@/lib/support-http";
import { serviceLevelReport } from "@/services/service-level";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return supportApi(async () => {
    requireDemoReviewer();
    const params = new URL(request.url).searchParams;
    return serviceLevelReport({ from: params.get("from"), to: params.get("to") });
  });
}
