import type { SentimentAssessment } from "./contracts";

type Reason = NonNullable<SentimentAssessment["fallbackReason"]>;

export const sentimentFallbackMessages: Record<Reason, string> = {
  MOCK_PROVIDER: "Môi trường này đang dùng model mô phỏng.",
  NOT_CONFIGURED: "Chưa đủ cấu hình API model; quản trị viên cần kiểm tra provider, model và API key.",
  AUTHENTICATION: "API model từ chối xác thực (401). Quản trị viên cần cập nhật API key trên hosting.",
  BUDGET_EXHAUSTED: "Đã hết hạn mức gọi model trong ngày UTC. Thử lại sau khi sang ngày UTC mới.",
  RATE_LIMIT: "Dịch vụ model đang giới hạn lượt gọi. Thử lại sau.",
  TIMEOUT: "Model chưa trả lời trong thời gian cho phép. Thử lại sau.",
  INVALID_OUTPUT: "Kết quả model không đúng định dạng hoặc bị cắt ngắn.",
  INVALID_EVIDENCE: "Kết quả model thiếu minh chứng hợp lệ từ nội dung đã nhập.",
  MODEL_UNAVAILABLE: "Chưa nhận được kết quả hợp lệ từ dịch vụ model. Thử lại sau hoặc liên hệ quản trị viên.",
};

// Only expose allowlisted diagnostics, never an upstream error message/body.
export function sentimentFallbackReason(reason?: string): Reason {
  switch (reason) {
    case "MOCK_PROVIDER": case "NOT_CONFIGURED": case "AUTHENTICATION":
    case "BUDGET_EXHAUSTED": case "RATE_LIMIT": case "TIMEOUT":
      return reason;
    case "MODEL_EVIDENCE_INVALID": case "EVIDENCE_MISMATCH":
      return "INVALID_EVIDENCE";
    case "MODEL_OUTPUT_INVALID": case "SCHEMA_INVALID": case "TRUNCATED":
      return "INVALID_OUTPUT";
    default: return "MODEL_UNAVAILABLE";
  }
}
