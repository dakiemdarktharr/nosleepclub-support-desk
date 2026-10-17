import { supportApi, supportBody, requestId, requireDemoReviewer, enforceDemoRateLimit } from "@/lib/support-http";
import { draftReviewInformation } from "@/services/review-information";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return supportApi(async () => {
    enforceDemoRateLimit(request, "mutation");
    requireDemoReviewer();
    return draftReviewInformation(requestId((await context.params).id), await supportBody(request));
  });
}
