import {
  employeeIdSuggestions,
  parseEmployeeSuggestionPrefix,
  supportPage,
  parseSupportQuery,
} from "@/lib/support-query";
import {
  supportApi,
  supportBody,
  enforceDemoRateLimit,
  requireEmployeeIdentity,
  requireDemoReviewer,
  verifyModelOptions,
} from "@/lib/support-http";
import {
  listSupportRequests,
  listSupportSummaries,
} from "@/lib/support-repository";
import { submitSupport } from "@/services/support";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return supportApi(async () => {
    enforceDemoRateLimit(request, "intake");
    const body = await requireEmployeeIdentity(await supportBody(request));
    return submitSupport(body, verifyModelOptions(request));
  }, 201);
}
export async function GET(request: Request) {
  return supportApi(async () => {
    requireDemoReviewer();
    const view = new URL(request.url).searchParams.get("view");
    if (view === "employee-suggestions")
      return employeeIdSuggestions(parseEmployeeSuggestionPrefix(request.url));
    if (view === "page")
      return supportPage(parseSupportQuery(request.url));
    return request &&
      new URL(request.url).searchParams.get("view") === "summary"
      ? listSupportSummaries()
      : listSupportRequests();
  });
}
