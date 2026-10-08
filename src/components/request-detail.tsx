"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { SupportRequest } from "@/domain/contracts";
import { allFields } from "@/domain/catalog";
import { displayId, statusLabels } from "@/domain/presentation";
import { browserApi } from "@/lib/browser-api";
import { Alert, Button, Card, Textarea } from "./ui";
import { SupportResult } from "./support-result";
import { SupportField } from "./support-field";
import { AssistanceHistory, AuditTimeline } from "./support-history";
export function RequestDetail({ id }: { id: string }) {
  const [request, setRequest] = useState<SupportRequest | null>(null),
    [error, setError] = useState("");
  const [pending, setPending] = useState(false),
    [clarification, setClarification] = useState(""),
    [followup, setFollowup] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({}),
    [step, setStep] = useState(0),
    [copied, setCopied] = useState(false);
  async function refresh() {
    try {
      setRequest(
        await browserApi<SupportRequest>(`/api/support/requests/${id}`),
      );
      setError("");
    } catch {
      setError("Không thể tải yêu cầu. Thử tải lại.");
    }
  }
  useEffect(() => {
    void browserApi<SupportRequest>(`/api/support/requests/${id}`)
      .then(setRequest)
      .catch(() => setError("Không thể tải yêu cầu. Thử tải lại."));
  }, [id]);
  async function update(path: string, body: object) {
    if (!request) return;
    setPending(true);
    setError("");
    try {
      setRequest(
        await browserApi<SupportRequest>(
          `/api/support/requests/${id}/${path}`,
          { ...body, version: request.version },
        ),
      );
      setClarification("");
      setFollowup("");
      setFields({});
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Không thể cập nhật. Thông tin bạn vừa nhập vẫn được giữ lại.",
      );
    } finally {
      setPending(false);
    }
  }
  const active =
    request &&
    !["RECEIVED", "PROCESSING", "COMPLETED", "STOPPED", "REJECTED"].includes(
      request.status,
    );
  const latest = request?.assistance.at(-1);
  const canGuide = request?.status === "AUTO_APPROVED" && !!latest;
  const currentNote =
    request?.status === "REJECTED"
      ? "Yêu cầu đã bị từ chối. Xem lý do bên dưới hoặc tạo yêu cầu mới nếu tình huống thay đổi."
      : request?.status === "STOPPED"
        ? "Yêu cầu đã dừng. Các hướng dẫn trước đây chỉ còn trong lịch sử."
        : request?.status === "COMPLETED"
          ? "Yêu cầu đã hoàn tất. Cảm ơn bạn đã cập nhật kết quả."
          : request?.status === "APPROVED_BY_HUMAN"
            ? "Nhân viên đã duyệt; đang chờ hoàn tất xử lý mô phỏng."
            : "";
  return (
    <main className="page page-narrow space-y-6" data-guide-stage={request?.input.requesterMode === "guest" ? undefined : "sender-result"}>
      <div>
        <p className="eyebrow">THEO DÕI HỖ TRỢ</p>
        <h1>Yêu cầu {displayId(id)}</h1>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {!request && !error && <p role="status">Đang tải…</p>}
      {request && (
        <>
          <Card className="request-status" data-guide="sender-result">
            <p role="status">
              Trạng thái: <strong>{statusLabels[request.status]}</strong>
            </p>
            <p className="text-sm text-slate-600">
              Cập nhật lúc {new Date(request.updatedAt).toLocaleString("vi-VN")}
            </p>
            <p>
              {currentNote ||
                (request.status === "ESCALATED"
                  ? "Nhân viên hỗ trợ sẽ xem xét yêu cầu. Dùng liên kết này để theo dõi cập nhật."
                  : request.status === "NEEDS_INFORMATION"
                    ? "Điền các thông tin bạn biết bên dưới để chúng tôi hỗ trợ đúng hơn."
                    : "Làm theo hướng dẫn rồi cho chúng tôi biết kết quả.")}
            </p>
            {request.status === "COMPLETED" && (
              <Image
                className="completion-mascot"
                src="/illustrations/vng-support-mascot.png"
                width={100}
                height={100}
                alt="Nhân vật đồng hành mỉm cười"
              />
            )}
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard
                  .writeText(window.location.href)
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError(
                      "Không thể sao chép. Bạn có thể sao chép địa chỉ trang trên trình duyệt.",
                    ),
                  );
              }}
            >
              {copied ? "Đã sao chép liên kết" : "Sao chép liên kết theo dõi"}
            </Button>
            <details>
              <summary>Mã đầy đủ</summary>
              <p className="break-all">{id}</p>
            </details>
          </Card>
          <Card>
            <h2>Vấn đề bạn đã gửi</h2>
            <blockquote className="original-question">
              {request.originalQuestion ||
                request.input.rawText ||
                "Yêu cầu theo danh mục"}
            </blockquote>
          </Card>
          {request.events.at(-1)?.actor.includes("reviewer") && (
            <Card>
              <h2>Phản hồi của nhân viên</h2>
              <p>{request.events.at(-1)?.explanation}</p>
            </Card>
          )}
          {active &&
            request.decision &&
            request.canonical &&
            !latest?.answer && (
              <SupportResult
                decision={request.decision}
                canonical={request.canonical}
              />
            )}
          {active && latest && <AssistanceHistory items={[latest]} />}
          {request.knowledgeCandidate && (
            <Card>
              <h2>Gợi ý tri thức đã gửi rà soát</h2>
              <p className="text-sm text-slate-600">
                Người phụ trách sẽ kiểm tra và biên tập trước khi hướng dẫn có
                thể được đưa vào kho tri thức.
              </p>
            </Card>
          )}
          {request.stepExplanations?.map((item, index) => (
            <Card key={index}>
              <h2>Giải thích bước {item.step + 1}</h2>
              <p>{item.text}</p>
            </Card>
          ))}
          {canGuide && (
            <Card className="followup-card">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void update("conversation", { question: followup });
                }}
              >
                <fieldset disabled={pending} className="space-y-4">
                  <div>
                    <h2>Hỏi tiếp về phản hồi này</h2>
                    <p className="text-sm text-slate-600">
                      Hệ thống nhận diện câu đã giải quyết, câu hỏi cần hỗ trợ
                      tiếp hoặc yêu cầu gặp nhân viên. Câu hỏi tiếp theo vẫn
                      được kiểm tra lại trước khi trả lời.
                    </p>
                  </div>
                  <label>
                      Phản hồi về hướng dẫn
                    <Textarea
                      aria-label="Hỏi tiếp"
                      data-guide="sender-followup"
                      placeholder="Ví dụ: Tôi đã vào được rồi; hoặc bước tiếp theo là gì?"
                      value={followup}
                      onChange={(event) => setFollowup(event.target.value)}
                      required
                      minLength={2}
                      maxLength={2000}
                    />
                  </label>
                  <Button type="submit" data-guide="sender-followup-send">Gửi câu hỏi</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      void update("feedback", { choice: "RESOLVED" })
                    }
                  >
                    Tôi đã hiểu
                  </Button>
                </fieldset>
              </form>
            </Card>
          )}
          {active && (
            <fieldset disabled={pending} className="space-y-4" data-guide={canGuide && !latest?.answer ? "sender-feedback" : undefined}>
              {canGuide && !latest?.answer && (
                <>
                  <div className="support-actions">
                    <Button
                      onClick={() =>
                        void update("feedback", { choice: "RESOLVED" })
                      }
                    >
                      A. Tôi đã làm được
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void update("feedback", { choice: "STILL_BROKEN" })
                      }
                    >
                      B. Vẫn còn lỗi
                    </Button>
                  </div>
                  <div className="explain-controls">
                    <label>
                      Bước cần giải thích
                      <select
                        value={step}
                        onChange={(event) =>
                          setStep(Number(event.target.value))
                        }
                      >
                        {latest!.stepByStepInstructions.map((_, index) => (
                          <option key={index} value={index}>
                            Bước {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void update("feedback", { choice: "EXPLAIN", step })
                      }
                    >
                      C. Giải thích bước này
                    </Button>
                  </div>
                </>
              )}
              {request.status !== "ESCALATED" &&
                !request.canonical?.workEvidence &&
                request.status !== "APPROVED_BY_HUMAN" && (
                  <Button
                    variant="secondary"
                    onClick={() => void update("feedback", { choice: "ADMIN" })}
                  >
                    {canGuide
                      ? "D. Chuyển cho nhân viên hỗ trợ"
                      : "Tôi vẫn cần hỗ trợ — Chuyển cho nhân viên"}
                  </Button>
                )}
            </fieldset>
          )}
          {request.status === "NEEDS_INFORMATION" && (
            <Card>
              <h2>Bổ sung thông tin</h2>
              <p>
                Trả lời những mục bạn biết. Bạn có thể điền ô bên dưới mà không
                cần viết lại mô tả.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void update("clarification", {
                    rawText: clarification,
                    fields,
                  });
                }}
              >
                <fieldset disabled={pending} className="space-y-4">
                  {(
                    request.decision?.clarificationFields ??
                    request.decision?.missingFields?.slice(0, 3) ??
                    []
                  )
                    .slice(0, 3)
                    .map((field) =>
                      field === "verifiedApproval"
                        ? "approvalReference"
                        : field,
                    )
                    .filter((field) => allFields.has(field))
                    .map((field) => (
                      <SupportField
                        key={field}
                        field={field}
                        value={fields[field] ?? ""}
                        onChange={(value) =>
                          setFields((current) => ({
                            ...current,
                            [field]: value,
                          }))
                        }
                      />
                    ))}
                  <label>
                    Thông tin làm rõ (không bắt buộc)
                    <Textarea
                      aria-label="Thông tin làm rõ"
                      data-guide="sender-followup"
                      value={clarification}
                      onChange={(event) => setClarification(event.target.value)}
                      maxLength={4000}
                    />
                  </label>
                  <Button type="submit" data-guide="sender-followup-send">Gửi bổ sung</Button>
                </fieldset>
              </form>
            </Card>
          )}
          <details className="panel">
            <summary data-guide="sender-history">Lịch sử yêu cầu và hướng dẫn</summary>
            {request.decision && request.canonical && currentNote && (
              <SupportResult
                decision={request.decision}
                canonical={request.canonical}
              />
            )}
            <AssistanceHistory
              items={
                active ? request.assistance.slice(0, -1) : request.assistance
              }
            />
            <AuditTimeline events={request.events} />
          </details>
          {!active && (
            <Link className="button primary" href={request.input.requesterMode === "guest" ? "/guest" : "/send-help"}>
              Gửi yêu cầu mới
            </Link>
          )}
        </>
      )}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => void refresh()}
      >
        Tải lại yêu cầu
      </Button>
    </main>
  );
}
