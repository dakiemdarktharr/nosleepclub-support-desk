import { incidentView } from "@/lib/support-incidents";
import { sharedRepliesForRequest } from "@/lib/support-groups";
import {
  supportApi,
  requestId,
  requireDemoReviewer,
} from "@/lib/support-http";
import { getSupportRequest, SupportError } from "@/lib/support-repository";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return supportApi(async () => {
    requireDemoReviewer();
    const row = await getSupportRequest(requestId((await context.params).id));
    if (!row)
      throw new SupportError("NOT_FOUND", "Không tìm thấy yêu cầu.", 404);
    const sharedReplies = await sharedRepliesForRequest(row.id);
    return { ...row, ...(sharedReplies.length ? { sharedReplies } : {}),
      ...(row.incidentId ? { incident: await incidentView(row.incidentId) } : {}) };
  });
}
