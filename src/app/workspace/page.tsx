"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  catalog,
  allFields,
  commonFields,
  labelForField,
} from "@/domain/catalog";
import {
  employeeIdentityOnly,
  employeeIdentityError,
  isEmployeeIdentityField,
} from "@/domain/employee-identity";
import { EmployeeIdentityFields } from "@/components/employee-identity-fields";
import { intentName, optionName } from "@/domain/presentation";
import { extractIntake } from "@/domain/text";
import { missingFacts } from "@/domain/policy";
import {
  requestKinds,
  serviceGroups,
  type CanonicalRequest,
  type Decision,
  type SupportInput,
  type SupportRequest,
  type ServiceGroup,
  type RequestKind,
  type Assistance,
} from "@/domain/contracts";
import { browserApi } from "@/lib/browser-api";
import { Alert, Button, Card, Spinner, Textarea } from "@/components/ui";
import { SupportResult } from "@/components/support-result";
import { SupportField } from "@/components/support-field";
import { AssistanceHistory } from "@/components/support-history";
type Preview = {
  input: SupportInput;
  canonical: CanonicalRequest;
  decision: Decision;
  assistance: Assistance | null;
};
const kinds: Record<RequestKind, string> = {
  GUIDANCE: "Hỏi cách thực hiện",
  SAFE_DIAGNOSTIC: "Tìm nguyên nhân lỗi",
  ROUTINE_WORKFLOW: "Yêu cầu thông thường",
  ACCESS_REQUEST: "Xin quyền truy cập",
  CONFIGURATION_CHANGE: "Thay đổi cấu hình",
  INCIDENT: "Báo sự cố",
  OTHER: "Tôi chưa rõ",
};
const familiar: ServiceGroup[] = [
  "DEVICE_BOOT",
  "NETWORK_VPN",
  "ACCOUNT_ACCESS",
  "SOFTWARE_LICENSE",
];
export default function WorkspacePage() {
  const router = useRouter();
  const [input, setInput] = useState<SupportInput>({
    mode: "freeform",
    serviceGroup: "OTHER",
    rawText: "",
    fields: {},
    confirmed: false,
    idempotencyKey: "",
  });
  const [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function edit(next: Partial<SupportInput>) {
    setInput((current) => ({ ...current, ...next, previewId: undefined }));
    setPreview(null);
    setError("");
  }
  async function analyze() {
    if (busy) return;
    const identityError = employeeIdentityError(input.fields);
    if (identityError) {
      setError(identityError);
      return;
    }
    if (
      !input.rawText.trim() &&
      !Object.entries(input.fields).some(
        ([field, value]) => !isEmployeeIdentityField(field) && value.trim(),
      )
    ) {
      setError("Nhập mô tả yêu cầu hoặc chọn một nhu cầu cụ thể trong danh mục.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const value = await browserApi<Preview>("/api/support/preview", {
        ...input,
        previewId: undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setInput(value.input);
      setPreview(value);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Chưa thể kiểm tra thông tin. Thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    try {
      const row = await browserApi<SupportRequest>("/api/support/requests", {
        ...preview.input,
        confirmed: true,
      });
      router.push(`/requests/${row.id}`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Chưa gửi được. Nội dung của bạn vẫn được giữ lại.",
      );
      setBusy(false);
    }
  }
  const isConversation = !!preview?.assistance?.answer;
  const required = missingFacts(
    extractIntake({
      ...input,
      rawText: "",
      fields: { intentLabel: input.fields.intentLabel ?? "" },
    }),
  ).filter(
    (field) => allFields.has(field) && field !== "resetType" && !isEmployeeIdentityField(field),
  );
  const initialFields = required.slice(0, 3);
  const extraFields = [
    ...new Set([
      ...required,
      ...commonFields,
      ...catalog[input.serviceGroup].fields,
    ]),
  ].filter(
    (field) => !initialFields.includes(field) && !isEmployeeIdentityField(field),
  );
  function fieldControl(field: string) {
    return (
      <SupportField
        key={field}
        field={field}
        value={input.fields[field] ?? ""}
        onChange={(value) =>
          edit({ fields: { ...input.fields, [field]: value } })
        }
      />
    );
  }
  return (
    <main className="page page-narrow page-enter" data-guide-stage={preview ? "sender-preview" : "sender-form"}>
      <h1>Tôi cần hỗ trợ</h1>
      <p className="page-description">
        Bạn cứ mô tả vấn đề bằng lời của mình. Chúng tôi sẽ giúp bạn tìm hướng
        xử lý phù hợp.
      </p>
      <ol className="flow-steps" aria-label="Các bước gửi yêu cầu">
        <li aria-current={!preview ? "step" : undefined}>1. Mô tả</li>
        <li aria-current={preview ? "step" : undefined}>
          2. Kiểm tra thông tin
        </li>
        <li>3. Nhận hỗ trợ</li>
      </ol>
      <Card>
        <div className="support-actions" role="group" aria-label="Kiểu yêu cầu" data-guide="sender-mode">
          {(["freeform", "structured"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              variant={input.mode === mode ? "primary" : "secondary"}
              aria-pressed={input.mode === mode}
              disabled={busy || !!preview}
              onClick={() => {
                if (mode !== input.mode)
                  edit({
                    mode,
                    fields: employeeIdentityOnly(input.fields),
                    requestKind: undefined,
                  });
              }}
            >
              {mode === "freeform" ? "Mô tả vấn đề" : "Chọn theo danh mục"}
            </Button>
          ))}
        </div>
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void (preview ? submit() : analyze());
          }}
        >
          <fieldset
            disabled={busy || !!preview}
            className="intake-fields space-y-5"
            hidden={!!preview}
          >
            <EmployeeIdentityFields
              fields={input.fields}
              onChange={(fields) => edit({ fields })}
            />
            <label>
              Nhóm hỗ trợ
              <select
                aria-label="Nhóm hỗ trợ"
                data-guide="sender-group"
                value={input.serviceGroup}
                onChange={(event) =>
                  edit({
                    serviceGroup: event.target.value as ServiceGroup,
                    fields: employeeIdentityOnly(input.fields),
                  })
                }
              >
                <option value="OTHER">Tôi chưa biết nhóm nào</option>
                <optgroup label="Vấn đề thường gặp">
                  {familiar.map((group) => (
                    <option key={group} value={group}>
                      {catalog[group].label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Các vấn đề khác">
                  {serviceGroups
                    .filter(
                      (group) => group !== "OTHER" && !familiar.includes(group),
                    )
                    .map((group) => (
                      <option key={group} value={group}>
                        {catalog[group].label}
                      </option>
                    ))}
                </optgroup>
              </select>
              <span className="field-hint">
                Không bắt buộc. Hệ thống sẽ giúp bạn xác định nhóm phù hợp.
              </span>
            </label>
            {input.mode === "structured" && (
              <>
                <label>
                  Nhu cầu cụ thể
                  <select
                    aria-label="Nhu cầu cụ thể"
                    data-guide="sender-intent"
                    value={input.fields.intentLabel ?? ""}
                    onChange={(event) =>
                      edit({
                        fields: {
                          ...employeeIdentityOnly(input.fields),
                          intentLabel: event.target.value,
                        },
                      })
                    }
                  >
                    <option value="">Chọn nhu cầu</option>
                    {catalog[input.serviceGroup].labels.map((label) => (
                      <option key={label} value={label}>
                        {intentName(label)}
                      </option>
                    ))}
                  </select>
                </label>
                {input.fields.intentLabel && (
                  <div className="grid gap-4 sm:grid-cols-2" data-guide="sender-fields">
                    {initialFields.map(fieldControl)}
                  </div>
                )}
                <details>
                  <summary>Thông tin khác bạn đã biết (không bắt buộc)</summary>
                  <label>
                    Loại yêu cầu
                    <select
                      aria-label="Loại yêu cầu"
                      value={input.requestKind ?? ""}
                      onChange={(event) =>
                        edit({
                          requestKind:
                            (event.target.value as RequestKind) || undefined,
                        })
                      }
                    >
                      <option value="">Để hệ thống nhận diện</option>
                      {requestKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {kinds[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {extraFields.map(fieldControl)}
                  </div>
                </details>
              </>
            )}
            <label>
              Mô tả yêu cầu{" "}
              {input.mode === "structured" ? "(không bắt buộc)" : ""}
              <Textarea
                aria-label="Mô tả yêu cầu"
                data-guide="sender-description"
                rows={5}
                required={input.mode === "freeform"}
                maxLength={6000}
                value={input.rawText}
                onChange={(event) => edit({ rawText: event.target.value })}
                placeholder="Ví dụ: VPN không kết nối, tôi nên kiểm tra gì?"
              />
              <span className="field-hint">
                Nêu điều bạn muốn làm và lỗi đang gặp. Không gửi mật khẩu hoặc
                mã xác minh.
              </span>
            </label>
          </fieldset>
          {error && <Alert tone="error">{error}</Alert>}
          {preview && (
            <section className="support-preview" aria-label="Kiểm tra dữ kiện">
              <p className="eyebrow">
                {isConversation
                  ? "TRỢ LÝ TRẢ LỜI TRỰC TIẾP"
                  : "CHƯA GỬI YÊU CẦU"}
              </p>
              <h2 data-guide="sender-preview">
                {isConversation ? "Câu hỏi của bạn" : "Mình đã hiểu như sau"}
              </h2>
              <p>
                {!isConversation && (
                  <>
                    {catalog[preview.canonical.serviceGroup].label} ·{" "}
                    {intentName(preview.canonical.intentLabel)}
                  </>
                )}
              </p>
              <blockquote className="original-question">
                {preview.input.rawText || "Yêu cầu theo danh mục"}
              </blockquote>
              <dl className="fact-list">
                {Object.entries(preview.canonical.entities)
                  .filter(([key]) => key !== "intentLabel")
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{labelForField(key)}</dt>
                      <dd>{optionName(value)}</dd>
                    </div>
                  ))}
              </dl>
              <p>
                {isConversation
                  ? "Bạn đã nhận câu trả lời. Lưu cuộc trò chuyện để mở khung Hỏi tiếp ngay bên dưới phản hồi và tiếp tục theo ngữ cảnh."
                  : "Bản xem trước chưa tạo hồ sơ. Kiểm tra thông tin rồi xác nhận gửi bên dưới."}
              </p>
              {!isConversation && <SupportResult {...preview} />}
              {preview.assistance && (
                <AssistanceHistory items={[preview.assistance]} />
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => edit({ confirmed: false })}
              >
                {isConversation ? "Hỏi câu khác" : "Quay lại sửa"}
              </Button>
            </section>
          )}
          <Button type="submit" disabled={busy} data-guide={preview ? "sender-confirm" : "sender-send"}>
            {busy ? (
              <>
                <Spinner />
                Đang xử lý…
              </>
            ) : preview ? (
              isConversation ? (
                "Lưu và tiếp tục trò chuyện"
              ) : (
                "Xác nhận và gửi yêu cầu"
              )
            ) : (
              "Gửi"
            )}
          </Button>
        </form>
      </Card>
    </main>
  );
}
