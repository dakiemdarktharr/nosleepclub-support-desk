import type { AuditEvent } from "./contracts";
import type { SharedReply } from "./request-groups";
export const REVIEW_MESSAGE_MAX_LENGTH = 2000;

const reviewActions = new Set(["SEND_MESSAGE", "APPROVE", "REJECT", "REQUEST_INFORMATION", "STOP", "OVERRIDE", "FULFILL"]);

/** Include older reviewer replies without relying on the last audit event. */
export function reviewerMessages(events: AuditEvent[], sharedReplies: SharedReply[] = []) {
  const individual = events.flatMap(event => {
    const text = event.senderMessage ?? (
      reviewActions.has(event.action) && event.actor.includes("reviewer")
        ? event.explanation : undefined
    );
    return text ? [{ id: event.id, timestamp: event.timestamp, text }] : [];
  });
  return [...individual, ...sharedReplies].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}
