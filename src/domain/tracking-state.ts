import type { SupportRequest } from "./contracts";

/** A delayed group poll must never undo a newer reply/action in this tab. */
export function mergeTrackedRequest(previous: SupportRequest | null, latest: SupportRequest) {
  if (!previous || latest.id !== previous.id || latest.version < previous.version) return previous;
  const replies = new Map([...(previous.sharedReplies ?? []), ...(latest.sharedReplies ?? [])].map(reply => [reply.id, reply]));
  const changed = replies.size !== (previous.sharedReplies?.length ?? 0);
  const updated = latest.version > previous.version || latest.incident?.version !== previous.incident?.version ||
    latest.incident?.expired !== previous.incident?.expired || changed;
  if (!updated) return previous;
  if (replies.size > (latest.sharedReplies?.length ?? 0)) return { ...latest, sharedReplies: [...replies.values()] };
  return latest;
}
