import type { SupportRequest, SentimentAssessment } from "./contracts";
import { explicitFeedbackChoice, isContinuationOnly, isFeedbackComment } from "./feedback";
import { normalize } from "./text";

export type SupportNeed = {
  basis: "EXPLICIT_HANDOFF" | "REPORTED_DIFFICULTY" | "AFFECT_ONLY" | "CONTENT";
  reportedFailedRounds: number;
  emotionObserved: boolean;
  priorityChanged: false;
  note: string;
};
/** Observations, not a sincerity detector. Never returns an approval, priority or routing decision. */
export function assessSupportNeed(request: SupportRequest, text: string, sentiment?: SentimentAssessment): SupportNeed {
  const choice = explicitFeedbackChoice(text);
  const failedRounds = request.feedback
    .filter(f => f.choice === "STILL_BROKEN" && (!f.replyText || isContinuationOnly(f.replyText))).length +
    (isContinuationOnly(text) ? 1 : 0);
  const basis = choice === "ADMIN" ? "EXPLICIT_HANDOFF" :
    isContinuationOnly(text) ? "REPORTED_DIFFICULTY" :
    isFeedbackComment(text) ? "AFFECT_ONLY" : "CONTENT";
  return { basis, reportedFailedRounds: failedRounds, emotionObserved: sentiment?.sentiment === "negative",
    priorityChanged: false,
    note: basis === "EXPLICIT_HANDOFF" ? "Người gửi yêu cầu chuyển người; sentiment không cấp quyền hoặc tăng ưu tiên." :
      basis === "REPORTED_DIFFICULTY" ? "Người gửi báo còn vướng. Số lượt là phản hồi đã ghi, không xác minh thao tác thực tế." :
      basis === "AFFECT_ONLY" ? "Ghi nhận cảm xúc, giữ trạng thái. Người gửi có thể nêu bước đang vướng hoặc chọn nhân viên hỗ trợ." :
      "Kiểm tra nội dung và policy riêng; không dùng cảm xúc làm điều kiện chuyển người.",
  };
}
export function repeatedAffect(request: SupportRequest, text: string): boolean {
  const previous = request.feedback.at(-1);
  return isFeedbackComment(text) && previous?.choice === "COMMENT" &&
    normalize(previous.replyText || "").replace(/[.! ]+$/g, "") === normalize(text).replace(/[.! ]+$/g, "");
}
