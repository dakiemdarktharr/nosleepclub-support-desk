import { ReviewConsole } from "@/components/review-console";
import { ReviewGroup } from "@/components/review-group";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string | string[]; groupId?: string | string[]; verifyRunId?: string | string[] }>;
}) {
  const { requestId, groupId, verifyRunId } = await searchParams;
  if (typeof groupId === "string") return <ReviewGroup key={groupId} id={groupId} />;
  const id = typeof requestId === "string" ? requestId : undefined;
  const runId = typeof verifyRunId === "string" ? verifyRunId : undefined;
  return <ReviewConsole key={id ?? runId ?? "queue"} requestId={id} initialVerifyRunId={runId} />;
}
