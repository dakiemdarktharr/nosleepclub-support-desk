import type { CanonicalRequest, Decision } from "@/domain/contracts";
import { labelForField } from "@/domain/catalog";
import { intentName } from "@/domain/presentation";
import { Badge, Card } from "./ui";
import { jiraRoleProfile } from "@/domain/access-defaults";
export function SupportResult({
  decision,
  canonical,
  audience = "employee",
  compact = false,
}: {
  decision: Decision;
  canonical: CanonicalRequest;
  audience?: "employee" | "reviewer";
  compact?: boolean;
}) {
  const title =
    decision.action === "AUTO_APPROVE"
      ? "Có thể hỗ trợ an toàn"
      : decision.action === "NEEDS_INFORMATION"
        ? "Cần làm rõ thêm"
        : "Cần người phụ trách xem xét";
  const questions =
    audience === "reviewer"
      ? [...decision.questions, ...(decision.reviewerQuestions ?? [])]
      : decision.questions;
  return (
    <Card className="space-y-4" aria-label="Kết quả quyết định">
      <div className="flex flex-wrap items-center gap-3">
        <h2>{title}</h2>
        {audience === "reviewer" && !compact && (
          <Badge
            tone={decision.action === "AUTO_APPROVE" ? "success" : "warning"}
          >
            {decision.action}
          </Badge>
        )}
      </div>
      <p>
        {audience === "reviewer" ? decision.adminReason : decision.userReason}
      </p>
      {jiraRoleProfile(canonical.entities.accessType) && (
        <p>
          Vai trò Jira trong demo:{" "}
          {jiraRoleProfile(canonical.entities.accessType)?.description} Không
          gồm quản trị, xóa ticket, xuất dữ liệu hoặc phê duyệt đặc quyền; vẫn
          cần entitlement đúng phạm vi.
        </p>
      )}
      {canonical.workEvidence && (
        <section aria-label="Yêu cầu bổ sung dữ liệu" className="space-y-3">
          {audience === "reviewer" && (
            <>
              <h3 className="font-semibold">Nguồn đã kiểm tra</h3>
              <ul className="list-disc pl-5">
                {canonical.workEvidence.sourceChecks.map((check) => (
                  <li key={check.source}>
                    <strong>{check.source}:</strong> {check.result}
                  </li>
                ))}
              </ul>
            </>
          )}
          {audience === "employee" && <p>Ứng dụng chưa tự mở tài liệu riêng từ liên kết. Hãy cung cấp nội dung liên quan đã ẩn thông tin nhạy cảm để tiếp tục.</p>}
          <h3 className="font-semibold">Dữ liệu hoặc quyền cần bổ sung</h3>
          {canonical.workEvidence.requirements.map((item) => (
            <dl key={item.artifact} className="rounded-xl bg-paper p-3">
              <dt className="font-semibold">Artefact</dt>
              <dd>{item.artifact}</dd>
              <dt className="font-semibold">Range / phiên bản</dt>
              <dd>{item.range}</dd>
              <dt className="font-semibold">Quyền đọc</dt>
              <dd>{item.access}</dd>
              <dt className="font-semibold">Mục đích</dt>
              <dd>{item.reason}</dd>
            </dl>
          ))}
          <p>{canonical.workEvidence.confidence}</p>
          <p>
            Chưa chuyển review. Sau khi có nguồn và công cụ phù hợp:{" "}
            {canonical.workEvidence.nextAction}
          </p>
        </section>
      )}
      {questions.length > 0 && (
        <ul className="list-disc space-y-2 pl-5">
          {questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      )}
      <p>
        {decision.action === "ESCALATE" && audience === "employee"
          ? "Nhân viên hỗ trợ sẽ xem xét yêu cầu và lịch sử của bạn. Bạn có thể theo dõi tại liên kết yêu cầu."
          : decision.nextStep}
      </p>
      <p className="text-sm text-slate-600">
        Cách hỗ trợ:{" "}
        {
          {
            GUIDE: "Hướng dẫn tự thực hiện",
            LLM_ASSIST: "Hướng dẫn từng bước",
            SIMULATED_WORKFLOW: "Tiếp nhận xử lý mô phỏng",
            HUMAN_REVIEW: "Nhân viên xem xét",
          }[decision.handlingMode]
        }
      </p>
      {audience === "reviewer" && !compact && (
        <details className="rounded-xl bg-paper p-4 text-sm">
          <summary>Quy tắc và thông tin đã hiểu</summary>
          <dl className="mt-3 space-y-2">
            <div>
              <dt>Nhu cầu</dt>
              <dd>
                {intentName(canonical.intentLabel)} · {canonical.intentLabel}
              </dd>
            </div>
            <div>
              <dt>Rule IDs</dt>
              <dd>{decision.ruleIds.join(", ")}</dd>
            </div>
            <div>
              <dt>Mức rủi ro / nhóm</dt>
              <dd>
                {decision.riskLevel} / {decision.bucket}
              </dd>
            </div>
            <div>
              <dt>Dấu hiệu rủi ro</dt>
              <dd>{canonical.riskSignals.join(", ") || "Không phát hiện"}</dd>
            </div>
            <div>
              <dt>Thông tin còn thiếu</dt>
              <dd>
                {decision.missingFields.map(labelForField).join(", ") ||
                  "Không"}
              </dd>
            </div>
          </dl>
          <ul>
            {canonical.evidence.map((item, index) => (
              <li key={index} className="break-words whitespace-pre-wrap">
                <strong>{labelForField(item.field)}: </strong>
                {item.quote}
              </li>
            ))}
          </ul>
        </details>
      )}
      {canonical.model.failure && (
        <p className="text-sm text-amber-900">
          Trợ lý hiện chưa thể đưa ra hướng dẫn đáng tin cậy. Yêu cầu được
          chuyển cho nhân viên hỗ trợ.
          {audience === "reviewer" && ` (${canonical.model.failure})`}
        </p>
      )}
    </Card>
  );
}
