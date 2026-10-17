import { z } from "zod";
import { supportApi, supportBody, requireDemoReviewer, enforceDemoRateLimit } from "@/lib/support-http";
import { incidentQueue, publishIncident } from "@/lib/support-incidents";
export const dynamic = "force-dynamic";
export async function GET() {
  return supportApi(async () => { requireDemoReviewer(); return incidentQueue(); });
}
export async function POST(request: Request) {
  return supportApi(async () => {
    enforceDemoRateLimit(request, "mutation");
    const actor = requireDemoReviewer();
    const body = z.object({ id: z.string().uuid(), version: z.number(), state: z.string(), updateId: z.string().uuid() }).strict().parse(await supportBody(request));
    const { id, ...input } = body;
    return publishIncident(id, input, actor);
  });
}
