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
import { groupedSupportPage } from "@/lib/support-groups";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return supportApi(async () => {
    enforceDemoRateLimit(request, "ingress");
    const body = await requireEmployeeIdentity(await supportBody(request), request);
    // Only the server-validated exact fixture may use the verification allowance.
    enforceDemoRateLimit(request, body.verifyRunId ? "verify" : "intake");
    return submitSupport(body, verifyModelOptions(request));
  }, 201);
}
export async function GET(request: Request) {
  return supportApi(async () => {
    requireDemoReviewer();
    const view = new URL(request.url).searchParams.get("view");
    if (view === "grouped") return groupedSupportPage(parseSupportQuery(request.url));
    if (view === "employee-suggestions")
      return employeeIdSuggestions(parseEmployeeSuggestionPrefix(request.url), parseSupportQuery(request.url).division);
    if (view === "page")
      return supportPage(parseSupportQuery(request.url));
    return request &&
      new URL(request.url).searchParams.get("view") === "summary"
      ? listSupportSummaries()
      : listSupportRequests();
  });
}
