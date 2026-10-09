import { asserted, normalize } from "./text";
import type { CanonicalRequest } from "./contracts";

export type FeedbackSentiment = "positive" | "neutral" | "negative";

/** Explicit user intent, independent of a model's emotional-tone prediction. */
export function explicitFeedbackChoice(text: string): "RESOLVED" | "ADMIN" | null {
  const normalized = normalize(text);
  if (asserted(normalized, /(?:chuyen|noi|ket noi|transfer|connect).{0,35}\b(?:nhan vien|nguoi ho tro|admin|it support|human|agent|support|staff member)\b|need a human|speak to support/))
    return "ADMIN";
  // Questions, reported/conditional statements and unresolved clauses do not
  // confirm completion. A frustrated user may still explicitly report success.
  const unresolved = normalized.replace(/\bkhong con bi loi\b/g, "resolved");
  if (/[?？]|\b(?:neu|if|khi nao|when|ban noi|you said|van loi|van con|van vuong|chua|still|next step|buoc tiep theo)\b|\bkhong.{0,25}(?:duoc|ket noi|hoat dong)|\b(?:not|never).{0,20}(?:fixed|solved|work)/.test(unresolved))
    return null;
  return resolvedPatterns.some((pattern) => asserted(normalized, pattern)) ? "RESOLVED" : null;
}

/** Only whole courtesy/affect statements; never swallow a new task or question. */
export function isFeedbackComment(text: string) {
  return /^(?:(?:toi|minh)\s+)?(?:(?:rat |that su )?(?:hai long|buc minh|that vong)|cam on(?: ban| nhe)?|thanks|thank you)[.! ]*$/.test(normalize(text));
}

export function requiresFeedbackAnalysis(request: CanonicalRequest) {
  // USER_HANDOFF is a policy rule too: emotional tone cannot cancel it.
  return [request, ...request.subrequests].some((part) =>
    part.riskSignals.length > 0 ||
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

/** Legacy development-corpus heuristic; never use its label as workflow authority. */
export function classifyPostAnswerFeedback(text: string): FeedbackSentiment {
  const normalized = normalize(text);
  if (negativePatterns.some((pattern) => asserted(normalized, pattern)))
    return "negative";
  // A still-broken clause or a next-step request wins over gratitude/resolution.
  // Exclude the explicit "no longer failing" resolution from that check.
  const continuation = normalized.replace(/\bkhong con bi loi\b/g, "resolved");
  if (continuationPatterns.some((pattern) => pattern.test(continuation)))
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
