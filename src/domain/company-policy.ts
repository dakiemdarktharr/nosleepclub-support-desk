import type { CanonicalRequest, Decision } from "./contracts";
import { companyTopic, isCompanyService } from "./company-support";

export function companyMissingFacts(request: CanonicalRequest): string[] | null {
  if (!isCompanyService(request.serviceGroup)) return null;
  const found = companyTopic(request.intentLabel);
  if (!found || found.private || found.urgent || request.requestKind === "GUIDANCE") return [];
  return [...new Set([...found.required, ...request.missingFields])].filter(field =>
    !request.entities[field]?.trim() || /^(?:unknown|n\/a|chua ro)$/i.test(request.entities[field]));
}

export function companyDecision(request: CanonicalRequest, base: Decision): Decision | null {
  const found = companyTopic(request.intentLabel);
  if (!found || request.workEvidence) return null;
  const prefix = `COMPANY-${found.group}`;
  const privateMessage = `Trao đổi riêng với ${found.service.team} qua kênh nội bộ đã xác minh; không gửi hồ sơ cá nhân, dữ liệu khách hàng hoặc thông tin thanh toán vào kênh chung.`;
  if (found.urgent) return { ...base, action: "ESCALATE", handlingMode: "HUMAN_REVIEW", riskLevel: "HIGH",
    bucket: "BEYOND_AUTHORITY", uncertaintyClass: "AUTHORITY_REQUIRED", ruleIds: [`${prefix}-URGENT`],
    missingFields: [], questions: [], reviewerQuestions: ["Người phụ trách an toàn tại chỗ đã được báo và tiếp nhận chưa?"],
    userReason: "Có dấu hiệu nguy hiểm tại nơi làm việc; cần người phụ trách tại chỗ tiếp nhận ngay.",
    adminReason: `${prefix}-URGENT: không chờ bổ sung hoặc dùng hướng dẫn tự sửa.`,
    nextStep: "Dừng thao tác, tránh khu vực nguy hiểm theo hướng dẫn an toàn tại chỗ và liên hệ lực lượng phụ trách qua kênh khẩn cấp đã xác minh. Không chờ phản hồi trong ứng dụng.",
    assignedTeam: found.service.team };
  if (!found.private && request.requestKind === "GUIDANCE" && request.requestedAction === "guidance" && !request.ambiguities.length) {
    return { ...base, action: "AUTO_APPROVE", handlingMode: "GUIDE", riskLevel: "LOW", bucket: "ROUTINE",
      uncertaintyClass: "NONE", ruleIds: [`${prefix}-GUIDE`], missingFields: [], questions: [], reviewerQuestions: [],
      userReason: "Có thể hướng dẫn chuẩn bị yêu cầu và tìm quy trình nội bộ đã xác minh.",
      adminReason: `${prefix}-GUIDE: chỉ hướng dẫn chuẩn bị; không xác nhận chính sách, quyền lợi, phê duyệt hoặc thực thi.`,
      nextStep: "Làm theo hướng dẫn chuẩn bị; bộ phận có thẩm quyền xác nhận quy trình và kết quả nghiệp vụ.",
      assignedTeam: found.service.team, approvalStatus: "not_required" };
  }
  const missing = companyMissingFacts(request) ?? [];
  if (!found.private && missing.length) return { ...base, action: "NEEDS_INFORMATION", handlingMode: "GUIDE",
    riskLevel: "LOW", bucket: "MISSING_INFO", uncertaintyClass: "MISSING_FACTS", ruleIds: [`${prefix}-INFO`],
    missingFields: missing, clarificationFields: missing,
    questions: missing.map(field => field === "location" ? "Sự việc ở vị trí nào? Chỉ nêu khu vực cần hỗ trợ."
      : field === "timeWindow" ? "Bạn cần hỗ trợ cho khoảng thời gian nào? Không gửi hồ sơ riêng tư."
        : "Bạn muốn người phụ trách hỗ trợ kết quả gì? Chỉ nêu thông tin không nhạy cảm."),
    reviewerQuestions: [], assignedTeam: found.service.team,
    userReason: "Cần thêm thông tin để đúng bộ phận tiếp nhận.", adminReason: `${prefix}-INFO: không suy diễn dữ kiện còn thiếu.` };
  return { ...base, action: "ESCALATE", handlingMode: "HUMAN_REVIEW", riskLevel: found.private ? "HIGH" : "MEDIUM",
    bucket: "BEYOND_AUTHORITY", uncertaintyClass: "AUTHORITY_REQUIRED", ruleIds: [`${prefix}-${found.private ? "PRIVATE" : "REVIEW"}`],
    missingFields: [], questions: [], reviewerQuestions: [found.private ? privateMessage : `${found.service.team} đã xác nhận phạm vi, người phụ trách và quy trình áp dụng chưa?`],
    userReason: found.private ? privateMessage : `Yêu cầu cần ${found.service.team} xác nhận và xử lý.`,
    adminReason: `${prefix}-REVIEW: không dùng quy tắc hạ tầng để duyệt nghiệp vụ công ty.`,
    nextStep: found.private ? privateMessage : "Người phụ trách kiểm tra yêu cầu và ghi nhận kết quả; hệ thống chưa thực thi nghiệp vụ bên ngoài.",
    assignedTeam: found.service.team };
}
