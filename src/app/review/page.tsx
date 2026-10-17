import { ReviewConsole } from "@/components/review-console";
import { ReviewGroup } from "@/components/review-group";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string | string[]; groupId?: string | string[] }>;
}) {
  const { requestId, groupId } = await searchParams;
  if (typeof groupId === "string") return <ReviewGroup key={groupId} id={groupId} />;
  const id = typeof requestId === "string" ? requestId : undefined;
  return <ReviewConsole key={id ?? "queue"} requestId={id} />;
}
