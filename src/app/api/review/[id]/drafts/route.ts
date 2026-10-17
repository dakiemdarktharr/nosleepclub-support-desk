import { supportApi, supportBody, requestId, requireDemoReviewer, enforceDemoRateLimit } from "@/lib/support-http";
import { draftReviewReasons } from "@/services/review-drafts";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return supportApi(async () => {
    enforceDemoRateLimit(request, "mutation");
    requireDemoReviewer();
    return draftReviewReasons(requestId((await context.params).id), await supportBody(request));
  });
}
