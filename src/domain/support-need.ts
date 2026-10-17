import type { SupportRequest, SentimentAssessment } from "./contracts";
import { explicitFeedbackChoice, isFeedbackComment } from "./feedback";
import { normalize } from "./text";
import { declinesHumanSupport, expressesFrustration, reportsUnresolvedHelp } from "./interaction-feedback";
import { supportInteractionPolicy } from "./policy-source";

export type SupportNeed = {
  basis: "EXPLICIT_HANDOFF" | "REPORTED_DIFFICULTY" | "AFFECT_ONLY" | "CONTENT";
  reportedFailedRounds: number;
  emotionObserved: boolean;
  priorityChanged: false;
  handoffRecommended: boolean;
  note: string;
};
/** Count distinct reports after actual assistant answers; self-reported attempts are not verified actions. */
export function assessSupportNeed(request: SupportRequest, text: string, sentiment?: SentimentAssessment): SupportNeed {
  const choice = explicitFeedbackChoice(text);
  const reports = new Set<string>();
  const rounds = new Set<number>();
  for (const [index, feedback] of request.feedback.entries()) {
    if (!feedback.assistanceRound || feedback.supportIntent !== request.canonical?.intentLabel) continue;
    if (feedback.choice !== "STILL_BROKEN" || feedback.replyText && !reportsUnresolvedHelp(feedback.replyText)) continue;
    const report = normalize(feedback.replyText || `button ${index}`).replace(/[.!? ]+$/g, "");
    if (reports.has(report)) continue;
    reports.add(report);
    rounds.add(feedback.assistanceRound);
  }
  const report = normalize(text).replace(/[.!? ]+$/g, "");
  if (reportsUnresolvedHelp(text) && !reports.has(report)) rounds.add(request.assistance.length);
  const failedRounds = rounds.size;
  const frustrated = expressesFrustration(text);
  const handoffRecommended = !declinesHumanSupport(text) &&
    (reportsUnresolvedHelp(text) || isFeedbackComment(text)) &&
    (failedRounds >= supportInteractionPolicy.failedRoundsWithoutFrustration ||
      frustrated && failedRounds >= supportInteractionPolicy.failedRoundsWithFrustration);
  const basis = choice === "ADMIN" ? "EXPLICIT_HANDOFF" :
    reportsUnresolvedHelp(text) ? "REPORTED_DIFFICULTY" :
    isFeedbackComment(text) ? "AFFECT_ONLY" : "CONTENT";
  return { basis, reportedFailedRounds: failedRounds, emotionObserved: sentiment?.sentiment === "negative",
    priorityChanged: false, handoffRecommended,
    note: handoffRecommended ? "Các lượt hỗ trợ đã ghi nhận chưa giúp giải quyết; chuyển người cùng lịch sử. Không suy đoán cảm xúc thật/giả hoặc tăng ưu tiên." :
      basis === "EXPLICIT_HANDOFF" ? "Người gửi yêu cầu chuyển người; sentiment không cấp quyền hoặc tăng ưu tiên." :
      basis === "REPORTED_DIFFICULTY" ? "Người gửi báo còn vướng. Số lượt là phản hồi đã ghi, không xác minh thao tác thực tế." :
      basis === "AFFECT_ONLY" ? "Ghi nhận cảm xúc, giữ trạng thái. Người gửi có thể nêu bước đang vướng hoặc chọn nhân viên hỗ trợ." :
      "Kiểm tra nội dung và policy riêng; không dùng cảm xúc làm điều kiện chuyển người.",
  };
}

export function interactionHandoffDecision(request: SupportRequest, need: SupportNeed) {
  const decision = request.decision;
  if (!need.handoffRecommended || request.status !== "AUTO_APPROVED" || !decision ||
      decision.bucket !== "ROUTINE" || request.canonical?.workEvidence || request.assistance.length < 2) return null;
  return {
    ...decision, action: "ESCALATE" as const, handlingMode: "HUMAN_REVIEW" as const,
    bucket: "BEYOND_AUTHORITY" as const, uncertaintyClass: "AUTHORITY_REQUIRED" as const,
    assignedTeam: request.canonical?.conversation ? "Support reviewer" : decision.assignedTeam,
    ruleIds: [...new Set([...decision.ruleIds, supportInteractionPolicy.ruleId])],
    userReason: "Các lượt hướng dẫn vừa rồi chưa giúp bạn giải quyết được vấn đề. Mình đã chuyển yêu cầu cùng lịch sử cho nhân viên hỗ trợ.",
    adminReason: `${supportInteractionPolicy.ruleId}: ${need.reportedFailedRounds} lượt báo còn vướng sau hướng dẫn; không dùng nhãn sentiment làm quyền quyết định.`,
    nextStep: "Nhân viên hỗ trợ sẽ xem các bước đã thử và trao đổi tiếp tại yêu cầu này.",
  };
}
export function repeatedAffect(request: SupportRequest, text: string): boolean {
  const previous = request.feedback.at(-1);
  return isFeedbackComment(text) && previous?.choice === "COMMENT" &&
    normalize(previous.replyText || "").replace(/[.! ]+$/g, "") === normalize(text).replace(/[.! ]+$/g, "");
}
