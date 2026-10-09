import { z } from "zod";
import {
  getSupportRequest,
  SupportError,
  updateSupportRequest,
} from "@/lib/support-repository";
import { auditEvent, completeAnalysis, prepareInput } from "./support";
import { employeeIdentityOnly } from "@/domain/employee-identity";
import { explicitFeedbackChoice, isFeedbackComment, isContinuationOnly, requiresFeedbackAnalysis } from "@/domain/feedback";
import { redact } from "@/domain/redaction";
import { extractIntake } from "@/domain/text";
import { analyzeSupportSentiment } from "@/lib/feedback-model";
import { feedbackSupport } from "./review";
const schema = z
  .object({
    version: z.number().int().nonnegative(),
    question: z.string().trim().min(2).max(2000),
  })
  .strict();
export async function continueConversation(id: string, value: unknown) {
  const input = schema.parse(value);
  const current = await getSupportRequest(id);
  if (!current)
    throw new SupportError("NOT_FOUND", "Không tìm thấy cuộc trò chuyện.", 404);
  if (
    current.version !== input.version ||
    current.status !== "AUTO_APPROVED"
  )
    throw new SupportError(
      "INVALID_TRANSITION",
      "Cuộc trò chuyện đã thay đổi hoặc kết thúc. Vui lòng tải lại.",
      409,
    );
  const safeReply = redact(input.question).text;
  const reply = prepareInput({ rawText: input.question, idempotencyKey: id });
  const baseline = extractIntake(reply.input, reply.markers);
  const risky = requiresFeedbackAnalysis(baseline);
  const assessment = risky ? undefined : await analyzeSupportSentiment(safeReply, "post-answer");
  const sentiment = assessment?.sentiment ?? "neutral";
  const choice = risky ? null : explicitFeedbackChoice(safeReply);
  if (choice)
    return feedbackSupport(id, {
      version: input.version,
      choice,
      replyText: safeReply,
    }, assessment);
  if (!risky && isFeedbackComment(safeReply))
    return updateSupportRequest(id, input.version, (request) => {
      request.feedback.push({ choice: "COMMENT", sentiment, sentimentAssessment: assessment, replyText: safeReply, timestamp: new Date().toISOString() });
      request.events.push(auditEvent(request, request.status, "FEEDBACK", "employee-demo",
        `Ghi nhận cảm xúc ${sentiment}; chưa có xác nhận giải quyết hoặc yêu cầu chuyển người. Không đổi trạng thái.`));
    });
  if (!risky && isContinuationOnly(safeReply))
    return feedbackSupport(
      id,
      { version: input.version, choice: "STILL_BROKEN", replyText: safeReply },
      assessment,
    );
  const safe = prepareInput({
    ...current.input,
    previewId: undefined,
    // Keep context for safe chat, but never let an earlier negation cancel
    // an independently detected risk or operational request in the new turn.
    rawText: current.canonical?.conversation && !risky
      ? `${current.input.rawText.slice(-3900)} ${input.question}`
      : input.question,
    fields: employeeIdentityOnly(current.input.fields),
  });
  const result = await completeAnalysis(safe.input, safe.markers);
  return updateSupportRequest(id, input.version, (request) => {
    request.feedback.push({
      choice: "STILL_BROKEN",
      timestamp: new Date().toISOString(),
      sentiment,
      ...(assessment ? { sentimentAssessment: assessment } : {}),
      replyText: safeReply,
    });
    request.input = safe.input;
    request.canonical = result.canonical;
    request.decision = result.decision;
    request.status =
      result.decision.action === "ESCALATE"
        ? "ESCALATED"
        : result.decision.action === "NEEDS_INFORMATION"
          ? "NEEDS_INFORMATION"
          : "AUTO_APPROVED";
    if (result.assistance) request.assistance.push(result.assistance);
    request.events.push(
      auditEvent(
        request,
        current.status,
        "CONVERSATION",
        "employee-demo",
        `Phản hồi sentiment ${sentiment}; quyết định từ policy, không từ cảm xúc. ${result.decision.adminReason}`,
      ),
    );
    if (result.assistance?.answer)
      request.events.push(
        auditEvent(
          request,
          request.status,
          "ANSWER",
          result.assistance.source,
          JSON.stringify(result.assistance.answer),
        ),
      );
  });
}
