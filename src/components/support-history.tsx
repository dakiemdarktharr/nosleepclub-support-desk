import { displayId, statusLabels } from "@/domain/presentation";
import { labelForField } from "@/domain/catalog";
import type { SupportRequest, AuditEvent } from "@/domain/contracts";
import { AnswerBubble } from "./answer-bubble";

export function AssistanceHistory({
  items,
  audience = "employee",
}: {
  items: SupportRequest["assistance"];
  audience?: "employee" | "reviewer";
}) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <AnswerBubble
          item={item}
          audience={audience}
          key={`${item.timestamp}-${index}`}
        >
          <h2 className="text-lg font-bold">{item.summary}</h2>
          {audience === "reviewer" && (
            <p className="my-2 text-xs text-slate-500">
              {item.source === "cache" || item.answer?.cacheHit
                ? "Câu trả lời từ bộ nhớ đệm, đã kiểm tra lại"
                : item.source === "mock"
                  ? "Hướng dẫn mẫu"
                  : item.source === "openai"
                    ? "Trợ lý giải thích theo tình huống; bước thao tác đã kiểm duyệt"
                    : "Hướng dẫn an toàn"}{" "}
              · {new Date(item.timestamp).toLocaleString("vi-VN")}
            </p>
          )}
          {item.diagnosis && (
            <section
              className="support-diagnosis"
              aria-label="Chẩn đoán khả dĩ"
            >
              <h3>Chẩn đoán khả dĩ</h3>
              <p>{item.diagnosis}</p>
            </section>
          )}
          <h3 className="mt-4 text-base font-bold">
            {item.potentialFixes
              ? "Cách khắc phục có thể thử"
              : "Các bước hỗ trợ"}
          </h3>
          <ol className="ml-5 list-decimal space-y-3">
            {(item.potentialFixes ?? item.stepByStepInstructions).map(
              (step, stepIndex) => (
                <li key={step}>
                  {step}
                  {item.stepExplanations?.[stepIndex] && (
                    <p className="mt-1 text-sm text-slate-600">
                      {item.stepExplanations[stepIndex]}
                    </p>
                  )}
                </li>
              ),
            )}
          </ol>
          {audience === "reviewer" && (
            <p className="mt-4 text-sm text-amber-800">{item.warning}</p>
          )}
          {audience === "reviewer" && (
            <p className="mt-2 text-sm">
              Kết quả mong đợi: {item.expectedResult}
            </p>
          )}
          <p className="mt-2 font-semibold">{item.nextQuestion}</p>
        </AnswerBubble>
      ))}
    </div>
  );
}
const progressLabels: Record<string, string> = {
  RECEIVED: "Đã tiếp nhận yêu cầu",
  DECISION: "Đã kiểm tra yêu cầu",
  ANSWER: "Đã gửi câu trả lời",
  CLARIFICATION: "Đã cập nhật thông tin bổ sung",
  CONVERSATION: "Đã cập nhật cuộc trò chuyện",
  FEEDBACK: "Đã ghi nhận phản hồi",
  HANDOFF: "Đã chuyển nhân viên hỗ trợ",
  REVIEW: "Nhân viên đã cập nhật yêu cầu",
  STOP: "Đã dừng xử lý",
};

export function RequestProgress({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="support-timeline space-y-4" aria-label="Tiến trình hỗ trợ">
      {events.map((event) => (
        <li key={event.id} className="border-l-2 border-line pl-3 text-sm">
          <p className="font-semibold">
            {progressLabels[event.action] ?? "Đã cập nhật yêu cầu"}
          </p>
          <time dateTime={event.timestamp} className="text-slate-600">
            {new Date(event.timestamp).toLocaleString("vi-VN")}
          </time>
          <p>{statusLabels[event.afterStatus]}</p>
        </li>
      ))}
    </ol>
  );
}

// Staff surfaces only. The sender uses RequestProgress above.
export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="support-timeline space-y-4">
      {events.map((event) => (
        <li
          key={event.id}
          className="break-words border-l-2 border-line pl-3 text-sm"
        >
          <p className="font-semibold">
            {event.action} · {event.actor}
          </p>
          <time>{new Date(event.timestamp).toLocaleString("vi-VN")}</time>
          <p>
            {event.beforeStatus ? statusLabels[event.beforeStatus] : "—"} →{" "}
            {statusLabels[event.afterStatus]}
          </p>
          <p>{event.explanation}</p>
          <details className="mt-2">
            <summary className="cursor-pointer">
              Rule, evidence và thông tin còn thiếu
            </summary>
            <p>Mã yêu cầu: {displayId(event.requestId)}</p>
            <p>
              {event.requestKind} · {event.riskLevel} · {event.bucket}
            </p>
            <p>Rules: {event.ruleIds.join(", ") || "Chờ đánh giá"}</p>
            <p>
              Thiếu:{" "}
              {event.missingFields.map(labelForField).join(", ") || "Không"}
            </p>
            <p>Policy: {event.policyVersion}</p>
            <p>
              Approval: {event.approvalStatus}
              {event.approvalReference ? ` · ${event.approvalReference}` : ""}
            </p>
            <p>
              Redaction markers:{" "}
              {(event.redactions ?? []).join(", ") || "Không"}
            </p>
            <p>Next step: {event.nextStep}</p>
            {(event.questions ?? []).map((question) => (
              <p key={question}>Câu hỏi: {question}</p>
            ))}

            {event.safeEvidence.map((evidence, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {evidence}
              </p>
            ))}
          </details>
        </li>
      ))}
    </ol>
  );
}
