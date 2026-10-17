import type { RequestStatus } from "./contracts";
export type ReviewAction =
  | "SEND_MESSAGE"
  | "APPROVE"
  | "REJECT"
  | "REQUEST_INFORMATION"
  | "STOP"
  | "OVERRIDE"
  | "FULFILL";
const decided: RequestStatus[] = [
  "AUTO_APPROVED",
  "NEEDS_INFORMATION",
  "ESCALATED",
  "APPROVED_BY_HUMAN",
];
export function canReview(status: RequestStatus, action: ReviewAction) {
  if (action === "STOP")
    return !["COMPLETED", "STOPPED", "REJECTED"].includes(status);
  if (action === "FULFILL")
    return status === "AUTO_APPROVED" || status === "APPROVED_BY_HUMAN";
  if (action === "OVERRIDE") return [...decided, "REJECTED"].includes(status);
  if (action === "APPROVE")
    return status === "ESCALATED" || status === "NEEDS_INFORMATION";
  return decided.includes(status);
}
