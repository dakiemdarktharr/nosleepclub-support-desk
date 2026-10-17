"use client";

import Link from "next/link";
import { IncidentUpdates } from "./incident-panel";
import { ReviewDrafts } from "./review-drafts";
import { ReviewSummary } from "./review-summary";
import { ServiceLevelPanel } from "./service-level-panel";
import { REVIEW_MESSAGE_MAX_LENGTH } from "@/domain/reviewer-messages";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { browserApi } from "@/lib/browser-api";
import type { InformationDraft } from "@/services/review-information";
import {
  ArrowLeft,
  Check,
  CircleHelp,
  Clock3,
  FileText,
  ShieldAlert,
  X,
  OctagonPause,
  RefreshCw,
  Send,
} from "lucide-react";
import type { RequestStatus, SupportRequest } from "@/domain/contracts";
import { canReview, type ReviewAction } from "@/domain/transitions";
import {
  displayId,
  statusLabels,
  optionName,
  intentName,
} from "@/domain/presentation";
import { catalog, labelForField } from "@/domain/catalog";
import { Badge, Button, Textarea } from "./ui";
import { SentimentPreview } from "./sentiment-preview";
import { SupportResult } from "./support-result";
import { AssistanceHistory, AuditTimeline } from "./support-history";

const tabs = [
  { id: "evidence", label: "Thông tin & bằng chứng", icon: FileText },
  { id: "assistance", label: "Hướng dẫn đã gửi", icon: CircleHelp },
  { id: "history", label: "Lịch sử xử lý", icon: Clock3 },
] as const;
type Tab = (typeof tabs)[number]["id"];
const labels: Record<ReviewAction, string> = {
  SEND_MESSAGE: "Gửi cho người gửi",
  APPROVE: "Duyệt yêu cầu",
  REJECT: "Từ chối",
  REQUEST_INFORMATION: "Hỏi thêm thông tin",
  STOP: "Dừng xử lý",
  OVERRIDE: "Điều chỉnh quyết định",
  FULFILL: "Hoàn tất mô phỏng",
};

// Presentation of existing guards only. The API remains the authority for transitions.
function blockedReason(
  request: SupportRequest,
  action: ReviewAction,
  target: RequestStatus,
) {
  if (!canReview(request.status, action))
    return "Thao tác không áp dụng cho trạng thái hiện tại.";
  if (action === "APPROVE") return "";
  const approval =
    action === "FULFILL" ||
    (action === "OVERRIDE" && target === "APPROVED_BY_HUMAN");
  if (approval && request.decision?.bucket === "SECURITY_RISK")
    return "Yêu cầu có rủi ro bảo mật. Chọn hỏi thêm, từ chối hoặc dừng xử lý.";
  if (approval && request.decision?.ruleIds.includes("FAIL-003"))
    return "Chưa thể duyệt vì bằng chứng hoặc phạm vi AI trích xuất chưa được xác minh. Cần bổ sung thông tin để kiểm tra lại.";
  if (
    action === "FULFILL" &&
    (request.status === "NEEDS_INFORMATION" ||
      request.decision?.action === "NEEDS_INFORMATION" ||
      request.decision?.missingFields.length)
  )
    return "Cần bổ sung đủ thông tin trước khi duyệt hoặc hoàn tất.";
  if (
    action === "FULFILL" &&
    request.status === "AUTO_APPROVED" &&
    request.decision?.handlingMode !== "SIMULATED_WORKFLOW"
  )
    return "Hướng dẫn cần phản hồi của người dùng để hoàn tất.";
  return "";
}

export function ReviewDetail({
  request,
  reason,
  setReason,
  target,
  setTarget,
  pending,
  onAct,
  onReload,
}: {
  request: SupportRequest;
  reason: string;
  setReason: (value: string) => void;
  target: RequestStatus;
  setTarget: (value: RequestStatus) => void;
  pending: boolean;
  onAct: (action: ReviewAction) => Promise<boolean>;
  onReload: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("evidence");
  const [savedAction, setSavedAction] = useState<ReviewAction | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [information, setInformation] = useState<InformationDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");
  const draftSequence = useRef(0);
  useEffect(() => {
    setInformation(null); setDrafting(false); setDraftError("");
    const sequence = draftSequence;
    return () => { sequence.current++; };
  }, [request.id, request.version]);
  const decision = request.decision;
  const canonical = request.canonical;
  const approveBlock = blockedReason(request, "APPROVE", target);
  async function askForInformation() {
    if (drafting) return;
    const current = ++draftSequence.current;
    setDrafting(true); setDraftError("");
    try {
      const draft = await browserApi<InformationDraft>(`/api/review/${request.id}/information`, { version: request.version });
      if (current !== draftSequence.current) return;
      setReason(draft.text); setInformation(draft);
    } catch (cause) {
      if (current === draftSequence.current) setDraftError((cause as Error).message);
    } finally { if (current === draftSequence.current) setDrafting(false); }
  }
  async function act(action: ReviewAction) {
    setSavedAction(null);
    if (await onAct(action)) {
      setSavedAction(action);
      setTab("history");
    }
  }
  function selectTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`it-tab-${tabs[next].id}`)?.focus();
  }
  function actionButton(
    action: ReviewAction,
    variant: "primary" | "secondary" | "danger" = "secondary",
  ) {
    const block = blockedReason(request, action, target);
    const composeInformation = action === "REQUEST_INFORMATION" && !information;
    const needsReason = action !== "APPROVE" && !composeInformation;
    const reasonReady = reason.trim().length >= (action === "SEND_MESSAGE" ? 1 : 8);
    const Icon = {
      SEND_MESSAGE: Send,
      APPROVE: Check,
      REQUEST_INFORMATION: CircleHelp,
      REJECT: X,
      STOP: OctagonPause,
      OVERRIDE: RefreshCw,
      FULFILL: Check,
    }[action];
    return (
      <Button
        variant={variant}
        disabled={
          pending || (drafting && action !== "APPROVE") || (needsReason && !reasonReady) || Boolean(block)
        }
        title={
          block ||
          (needsReason && !reasonReady
            ? action === "SEND_MESSAGE"
              ? "Nhập tin nhắn trước khi gửi."
              : "Nhập lý do tối thiểu 8 ký tự để thực hiện."
            : labels[action])
        }
        onClick={() => void (composeInformation ? askForInformation() : act(action))}
      >
        <Icon size={16} />
        {action === "REQUEST_INFORMATION" && information ? "Gửi yêu cầu bổ sung" : labels[action]}
      </Button>
    );
  }
  return (
    <>
      <header className="it-detail-heading">
        <Link href="/review" className="it-back">
          <ArrowLeft size={16} />
          <span>← Danh sách yêu cầu</span>
        </Link>
        <div className="it-detail-title">
          <div>
            <h1>{displayId(request.id)}</h1>
            <p>
              {canonical
                ? catalog[canonical.serviceGroup].label
                : "Yêu cầu hỗ trợ"}
            </p>
          </div>
          <div role="status" className="it-current-status">
            <Badge
              tone={
                request.status === "ESCALATED"
                  ? "warning"
                  : request.status === "COMPLETED"
                    ? "success"
                    : "neutral"
              }
            >
              {statusLabels[request.status]}
            </Badge>
            {savedAction && <small>{savedAction === "SEND_MESSAGE"
              ? "Đã gửi tin nhắn vào hồ sơ người gửi. Trạng thái yêu cầu được giữ nguyên."
              : "Đã lưu quyết định và gửi tin nhắn vào hồ sơ người gửi"}</small>}
          </div>
        </div>
      </header>
      <div className="it-detail-grid">
        <div className="it-request-content">
          <section className="it-surface it-intake" aria-labelledby="it-intake-heading">
            <div className="it-section-heading">
              <h2 id="it-intake-heading" data-guide="reviewer-evidence">Yêu cầu nguyên văn</h2>
              <small>Đã che thông tin nhạy cảm</small>
            </div>
            <p className="it-request-text whitespace-pre-wrap">{request.originalQuestion || request.input.rawText || "Người gửi chọn yêu cầu theo danh mục."}</p>
            {!request.originalQuestion && !request.input.rawText && <dl className="it-request-fields">{Object.entries(request.input.fields).filter(([key]) => !["employeeId", "department"].includes(key)).map(([key, value]) => <div key={key}><dt>{labelForField(key)}</dt><dd>{optionName(value)}</dd></div>)}</dl>}
          </section>
          <ReviewSummary key={request.id} id={request.id} version={request.version} />
          <ServiceLevelPanel id={request.id} version={request.version} />
          {!!request.sharedReplies?.length && <section className="it-surface it-intake" aria-label="Phản hồi chung">
            <h2>Phản hồi chung</h2>
            <ol className="reviewer-messages">{request.sharedReplies.map(reply => <li key={reply.id}>
              <time dateTime={reply.timestamp}>{new Date(reply.timestamp).toLocaleString("vi-VN")}</time>
              <p className="whitespace-pre-wrap">{reply.text}</p>
            </li>)}</ol>
          </section>}
          <ReviewDrafts key={`${request.id}:${request.version}`} id={request.id} version={request.version} disabled={pending || drafting} onChoose={text => { setReason(text); setInformation(null); }} />
        </div>
        <aside
          className="it-action-panel it-surface"
          id="review-actions"
          aria-label="Thao tác xử lý"
        >
          <fieldset disabled={pending}>
            <legend>Thao tác xử lý</legend>
            {approveBlock && (
              <div className="it-block-notice">
                <ShieldAlert size={17} />
                <span>{approveBlock}{canReview(request.status, "SEND_MESSAGE") && " Bạn vẫn có thể gửi tin nhắn cho người gửi bên dưới."}</span>
              </div>
            )}
            <label className="it-reason">
              Tin nhắn cho người gửi
              <Textarea
                disabled={drafting}
                rows={reason.length > 300 ? 8 : 3}
                maxLength={REVIEW_MESSAGE_MAX_LENGTH}
                value={reason}
                data-guide="reviewer-reason"
                placeholder="Chọn gợi ý hoặc nhập tin nhắn…"
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {drafting && <p role="status">Đang soạn tin nhắn hỏi thông tin còn thiếu…</p>}
            {draftError && <p role="alert">{draftError}</p>}
            {information && <p role="status" className="it-field-hint">{information.source === "openai" ? `Bản nháp từ ${information.model || "AI"}` : information.source === "mock" ? "Bản nháp mô phỏng" : "Mẫu hỏi bổ sung dự phòng"}. Bạn có thể sửa trước khi gửi.</p>}
            <div data-guide="reviewer-actions">
              <div className="it-primary-actions">
                {actionButton("SEND_MESSAGE", "primary")}
                <p className="it-field-hint">Tin nhắn hiện trên trang theo dõi của người gửi; gửi tin nhắn không thay đổi trạng thái yêu cầu.</p>
                {actionButton("APPROVE")}
                {actionButton("REQUEST_INFORMATION")}
              </div>
              {canReview(request.status, "FULFILL") && (
                <div className="it-fulfill">
                  {actionButton("FULFILL", "primary")}
                </div>
              )}
              <div className="it-stop-actions">
                {actionButton("REJECT", "danger")}
                {actionButton("STOP", "danger")}
              </div>
              <div className="it-override">
                <label>
                  Trạng thái sau điều chỉnh
                  <select
                    disabled={drafting}
                    value={target}
                    onChange={(event) =>
                      setTarget(event.target.value as RequestStatus)
                    }
                  >
                    <option value="NEEDS_INFORMATION">
                      Cần bổ sung thông tin
                    </option>
                    <option value="REJECTED">Từ chối</option>
                    <option value="APPROVED_BY_HUMAN">Đã duyệt</option>
                  </select>
                </label>
                {actionButton("OVERRIDE")}
                {blockedReason(request, "OVERRIDE", target) && (
                  <p className="it-field-hint">
                    {blockedReason(request, "OVERRIDE", target)}
                  </p>
                )}
              </div>
            </div>
          </fieldset>
          <Button variant="quiet" data-guide="reviewer-history" aria-expanded={recordOpen} aria-controls="review-full-record" onClick={() => setRecordOpen(value => !value)}>
            {recordOpen ? "Ẩn hồ sơ chi tiết" : "Xem lịch sử & bằng chứng"}
          </Button>
          <Button
            className="it-reload"
            variant="quiet"
            disabled={pending}
            onClick={() => void onReload()}
          >
            <RefreshCw size={14} />
            Tải lại hồ sơ
          </Button>
        </aside>
        <section id="review-full-record" hidden={!recordOpen} className="it-record it-surface" aria-label="Hồ sơ xử lý">
          <div role="tablist" aria-label="Thông tin hồ sơ" className="it-tabs">
            {tabs.map((item, index) => (
              <button
                key={item.id}
                id={`it-tab-${item.id}`}
                role="tab"
                aria-selected={tab === item.id}
                aria-controls={`it-panel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => selectTab(event, index)}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
                {item.id === "history" && (
                  <small>{request.events.length}</small>
                )}
              </button>
            ))}
          </div>
          <div
            id="it-panel-evidence"
            role="tabpanel"
            aria-labelledby="it-tab-evidence"
            hidden={tab !== "evidence"}
            tabIndex={0}
            className="it-tab-content"
          >
            <h2>Thông tin đối chiếu</h2>
            <IncidentUpdates incident={request.incident} />
            {request.supportNeed && <p className="it-field-hint">{request.supportNeed.note} Lượt báo còn vướng: {request.supportNeed.reportedFailedRounds}. Không tự tăng ưu tiên.</p>}
            <dl className="it-request-fields">
              {request.input.requesterMode === "guest" && request.input.guestDepartment && <div><dt>Phòng ban giả lập (phiên khách)</dt><dd>{optionName(request.input.guestDepartment)} · Không xác minh danh tính</dd></div>}
              {Object.entries(request.input.fields).map(([key, value]) => (
                <div key={key}>
                  <dt>{labelForField(key)}</dt>
                  <dd>{optionName(value)}</dd>
                </div>
              ))}
              <div>
                <dt>Tiếp nhận lúc</dt>
                <dd>
                  {new Date(request.createdAt).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </dd>
              </div>
            </dl>
            {decision && canonical && <SupportResult decision={decision} canonical={canonical} audience="reviewer" compact />}
            {request.knowledgeCandidate && (
              <section
                className="it-knowledge-candidate"
                aria-label="Gợi ý tri thức chờ rà soát"
              >
                <h3>Gợi ý tri thức · chờ rà soát</h3>
                <p>
                  <strong>Vấn đề:</strong> {request.knowledgeCandidate.symptom}
                </p>
                <p>
                  <strong>Phản hồi:</strong>{" "}
                  {request.knowledgeCandidate.employeeFeedback}
                </p>
                <p>{request.knowledgeCandidate.answerSummary}</p>
                {!!request.knowledgeCandidate.steps.length && (
                  <ol className="list-decimal pl-5">
                    {request.knowledgeCandidate.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                )}
                <p className="it-field-hint">
                  Đề xuất này chưa được thêm vào kho tri thức. Người phụ trách
                  cần kiểm tra nguồn và biên tập thành revision được duyệt theo
                  hướng dẫn quản trị knowledge.
                </p>
              </section>
            )}
            {decision && canonical ? (
              <>
                <dl className="it-evidence-grid">
                  <div>
                    <dt>Nhu cầu đã hiểu</dt>
                    <dd>{intentName(canonical.intentLabel)}</dd>
                  </div>
                  <div>
                    <dt>Nhóm tiếp nhận</dt>
                    <dd>{decision.assignedTeam}</dd>
                  </div>
                  <div>
                    <dt>Quy tắc áp dụng</dt>
                    <dd>{decision.ruleIds.join(", ") || "Chưa có"}</dd>
                  </div>
                  <div>
                    <dt>Thông tin còn thiếu</dt>
                    <dd>
                      {decision.missingFields.map(labelForField).join(", ") ||
                        "Không"}
                    </dd>
                  </div>
                  <div>
                    <dt>Mức rủi ro / nhóm</dt>
                    <dd>
                      {decision.riskLevel} / {decision.bucket}
                    </dd>
                  </div>
                  <div>
                    <dt>Dấu hiệu rủi ro</dt>
                    <dd>
                      {canonical.riskSignals.join(", ") || "Không phát hiện"}
                    </dd>
                  </div>
                </dl>
                {canonical.evidence.length > 0 && (
                  <div className="it-evidence-quotes">
                    <h3>Bằng chứng từ yêu cầu</h3>
                    {canonical.evidence.map((item, index) => (
                      <blockquote key={index}>
                        <strong>{labelForField(item.field)}</strong>
                        <p>{item.quote}</p>
                      </blockquote>
                    ))}
                  </div>
                )}
                <p className="it-policy-version">
                  Phiên bản chính sách: {decision.policyVersion}
                </p>
              </>
            ) : (
              <p>
                Chưa có kết quả đánh giá. Tải lại hồ sơ để kiểm tra cập nhật.
              </p>
            )}
            <section className="space-y-4" aria-label="Chẩn đoán nội bộ">
              <h3>Phân tích dành cho nhân viên hỗ trợ</h3>
              {request.intakeSentiment ? (
                <SentimentPreview assessment={request.intakeSentiment} />
              ) : (
                <p className="text-sm text-slate-600">
                  Hồ sơ này chưa lưu phân tích cảm xúc khi tiếp nhận.
                </p>
              )}
              {request.feedback
                .filter((item) => item.sentimentAssessment)
                .map((item, index) => (
                  <div key={`${item.timestamp}-${index}`}>
                    <p className="text-sm text-slate-600">
                      Phản hồi lúc{" "}
                      {new Date(item.timestamp).toLocaleString("vi-VN")}
                    </p>
                    <SentimentPreview assessment={item.sentimentAssessment!} />
                  </div>
                ))}
            </section>
            <details className="it-reference">
              <summary>Mã đối chiếu kỹ thuật</summary>
              <p>
                {displayId(request.id)} · phiên bản {request.version}
              </p>
            </details>
          </div>
          <div
            id="it-panel-assistance"
            role="tabpanel"
            aria-labelledby="it-tab-assistance"
            hidden={tab !== "assistance"}
            tabIndex={0}
            className="it-tab-content"
          >
            <h2>Hướng dẫn đã gửi</h2>
            {!request.assistance.length && (
              <p>Chưa gửi hướng dẫn tự thực hiện cho yêu cầu này.</p>
            )}
            <AssistanceHistory items={request.assistance} audience="reviewer" />
            {request.stepExplanations?.map((item, index) => (
              <div className="it-step-explanation" key={index}>
                <h3>Giải thích bước {item.step + 1}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
          <div
            id="it-panel-history"
            role="tabpanel"
            aria-labelledby="it-tab-history"
            hidden={tab !== "history"}
            tabIndex={0}
            className="it-tab-content"
          >
            <div id="request-audit">
              <h2>Lịch sử xử lý</h2>
              <AuditTimeline events={request.events} />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
