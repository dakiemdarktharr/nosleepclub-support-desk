import { asserted, normalize } from "./text";
import type { CanonicalRequest } from "./contracts";

export type FeedbackSentiment = "positive" | "neutral" | "negative";

export function requiresFeedbackAnalysis(request: CanonicalRequest) {
  return [request, ...request.subrequests].some((part) =>
    part.riskSignals.some((risk) => risk !== "USER_HANDOFF") ||
    ["ACCESS_REQUEST", "CONFIGURATION_CHANGE", "ROUTINE_WORKFLOW", "INCIDENT"].includes(part.requestKind),
  );
}

// Terse replies refer to the last answer, not a fresh ticket with missing facts.
export function isContinuationOnly(text: string) {
  return /^(?:(?:toi|minh)\s+)?(?:van\s+)?(?:chua duoc|chua lam duoc|van con vuong|con vuong|tiep tuc|buoc tiep theo(?: la gi)?|xong buoc nay|what next|next step|still stuck|still not working)[.!? ]*$/.test(normalize(text));
}

const negativePatterns = [
  /\b(?:ban ngu|ngu phet|khong hieu toi noi gi|bat luc|that vong|qua buc minh|vo ich|khong giai quyet duoc)\b/,
  /\b(?:chuyen|noi|ket noi|transfer|connect).{0,35}\b(?:nhan vien|nguoi ho tro|it support|human|agent|support|employee|staff member)\b/,
  /\b(?:need a human|speak to support|you do not understand me|are you even listening|useless|frustrated|helpless)\b/,
  /\b(?:khong giup duoc gi|van khong hieu|vo dung|khong nghe dieu toi noi|buc minh)\b/,
  /\b(?:noi|chuyen|noi chuyen|ket noi).{0,40}\b(?:nhan vien|bo phan ho tro|it)\b/,
];

const resolvedPatterns = [
  /\b(?:da lam duoc|khong con bi loi|vao duoc|da dang nhap duoc|da on|da hoat dong|fixed|it works|working now|solved|works now)\b/,
  /\b(?:dang nhap thanh cong|mo duoc roi|dung duoc roi|loi da het|da ket noi.{0,15}duoc roi|hieu qua roi|da xu ly xong|can log in now)\b/,
];

const gratitudePatterns = [
  /\b(?:cam on|thank you|thanks)\b/,
];

const continuationPatterns = [
  /[?？]|\b(?:giai thich|noi ro hon|huong dan them)\b/,
  /\b(?:buoc tiep theo|lam the nao|lam cai nay nhu nao|how do i|what next|next step|can you explain|help me|van con|van vuong|chua duoc|still need|still stuck|but|nhung)\b/,
  /\b(?:khong|chua).{0,35}(?:duoc|thanh cong|hoat dong)|\b(?:not|never).{0,20}(?:fixed|solved|work)|\b(?:tiep theo|van loi|still broken|still failing)\b/,
];

export function hasContinuationFeedbackSignal(text: string) {
  const normalized = normalize(text).replace(/\bkhong con bi loi\b/g, "resolved");
  return continuationPatterns.some((pattern) => pattern.test(normalized));
}

/** Classifies feedback about the latest support answer, not the original ticket. */
export function classifyPostAnswerFeedback(text: string): FeedbackSentiment {
  const normalized = normalize(text);
  if (negativePatterns.some((pattern) => asserted(normalized, pattern)))
    return "negative";
  // A still-broken clause or a next-step request wins over gratitude/resolution.
  // Exclude the explicit "no longer failing" resolution from that check.
  if (hasContinuationFeedbackSignal(normalized))
    return "neutral";
  if (resolvedPatterns.some((pattern) => asserted(normalized.replace(/\bchua\b/g, "khong"), pattern)))
    return "positive";
  if (
    gratitudePatterns.some((pattern) => pattern.test(normalized)) &&
    !continuationPatterns.some((pattern) => pattern.test(normalized))
  )
    return "positive";
  return "neutral";
}
