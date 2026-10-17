import type { AuditEvent } from "./contracts";
export const REVIEW_MESSAGE_MAX_LENGTH = 2000;

const reviewActions = new Set(["SEND_MESSAGE", "APPROVE", "REJECT", "REQUEST_INFORMATION", "STOP", "OVERRIDE", "FULFILL"]);

/** Include older reviewer replies without relying on the last audit event. */
export function reviewerMessages(events: AuditEvent[]) {
  return events.flatMap(event => {
    const text = event.senderMessage ?? (
      reviewActions.has(event.action) && event.actor.includes("reviewer")
        ? event.explanation : undefined
    );
    return text ? [{ id: event.id, timestamp: event.timestamp, text }] : [];
  });
}
