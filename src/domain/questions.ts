import type { CanonicalRequest } from "./contracts";
import { labelForField } from "./catalog";
const hints: Record<string, [string, string]> = {
  resetType: [
    "Bạn muốn khởi động lại (không xóa file) hay khôi phục cài đặt gốc (có thể mất dữ liệu)?",
    "Để chọn cách xử lý không làm mất dữ liệu.",
  ],
  system: [
    "Bạn cần hỗ trợ hệ thống nào? Ví dụ: PostgreSQL hoặc tên ứng dụng.",
    "Để hướng dẫn đúng hệ thống.",
  ],
  targetSystem: [
    "Bạn cần dùng ứng dụng hoặc hệ thống nào?",
    "Để xác định nơi cấp quyền.",
  ],
  resourceScope: [
    "Bạn cần dùng cơ sở dữ liệu, bảng hoặc tài nguyên nào?",
    "Để giới hạn đúng phạm vi.",
  ],
  environment: [
    "Đây là hệ thống thử nghiệm hay đang vận hành thật? Nếu chưa rõ, chọn Tôi không biết.",
    "Môi trường quyết định mức độ rủi ro.",
  ],
  duration: [
    "Bạn cần dùng trong bao lâu? Ví dụ: 2 giờ.",
    "Để giới hạn thời gian sử dụng.",
  ],
  reason: [
    "Bạn cần thực hiện công việc gì?",
    "Để chọn quyền tối thiểu cần thiết.",
  ],
  permission: [
    "Bạn cần chỉ xem hay chỉnh sửa dữ liệu?",
    "Quyền chỉnh sửa cần được kiểm tra kỹ hơn.",
  ],
  verifiedApproval: [
    "Bạn có mã phê duyệt cho yêu cầu này không?",
    "Hệ thống cần xác minh mã; lời xác nhận đã duyệt chưa đủ.",
  ],
  symptom: [
    "Bạn gặp lỗi gì? Có thông báo nào trên màn hình?",
    "Để khoanh vùng sự cố. Không gửi mật khẩu.",
  ],
};
export function questionFor(field: string, request?: CanonicalRequest) {
  if (field === "cpu")
    return "Bạn cần bao nhiêu vCPU? Nếu chưa rõ, cho mình biết loại job và tải dự kiến để team Infra chọn cấu hình.";
  if (field === "ram")
    return "Job này dự kiến cần bao nhiêu GB RAM? Nếu chưa đo được, bạn có thể gửi thông tin workload để team kiểm tra.";
  if (field === "disk")
    return "Bạn cần bao nhiêu GB đĩa cho dữ liệu và file tạm?";
  if (field === "duration" && /CLOUD_VM_REQUEST|DATABASE_PROVISION/.test(request?.intentLabel || ""))
    return "Bạn dự kiến dùng tài nguyên đến khi nào? Có thể ghi số giờ/ngày hoặc ngày thu hồi cụ thể.";
  if (field === "permission" && request?.serviceGroup === "GIT_PERMISSION")
    return "Bạn cần chỉ đọc code hay có quyền đẩy branch lên repo?";
  if (field === "accessType")
    return "Bạn cần xem, tạo ticket hay sửa nội dung trong ứng dụng này?";
  if (field === "resourceScope" && request?.entities.system)
    return `Trong ${request.entities.system}, bạn cần dùng cơ sở dữ liệu hoặc bảng nào? Chỉ nêu tên, không gửi nội dung dữ liệu.`;
  if (field === "symptom" && request?.serviceGroup === "DATABASE")
    return "Khi kết nối cơ sở dữ liệu, bạn thấy thông báo lỗi gì? Chép mã lỗi, không gửi chuỗi kết nối hoặc mật khẩu.";
  if (field === "destination")
    return "Dữ liệu sẽ được lưu hoặc gửi đến đâu? Nêu khu vực lưu trữ được công ty quản lý, không gửi dữ liệu thật.";
  if (field === "rollbackPlan")
    return "Nếu thao tác không đạt kết quả, ai phụ trách khôi phục và bản sao lưu nào đã sẵn sàng?";
  if (field === "port")
    return "Ứng dụng cần dùng cổng số nào? Nếu chưa biết, nêu tên ứng dụng để nhân viên kiểm tra giúp.";
  if (field === "source")
    return "Thiết bị hoặc mạng nào bắt đầu kết nối? Đây là mạng công ty, VPN hay bên ngoài?";
  if (field === "target")
    return "Bạn cần kết nối tới ứng dụng hoặc máy chủ nào?";
  if (field === "protocol")
    return "Ứng dụng dùng giao thức nào (ví dụ HTTPS)? Nếu chưa rõ, bạn có thể nói chưa biết.";
  if (field === "purpose" || field === "businessPurpose")
    return "Bạn cần hoàn thành công việc nào bằng tài nguyên hoặc phần mềm này?";
  if (field === "budgetOrQuota")
    return "Bộ phận nào đã xác nhận hạn mức tài nguyên hoặc chi phí cho công việc này?";
  if (field === "affectedScope")
    return "Chỉ bạn gặp lỗi hay đồng nghiệp cũng bị? Công việc nào đang bị gián đoạn?";
  if (field === "startTime" || field === "timeWindow")
    return "Lỗi bắt đầu lúc nào và còn xảy ra liên tục hay thỉnh thoảng?";
  if (field === "summary" || field === "desiredOutcome")
    return "Bạn muốn làm được việc gì, và hiện đang vướng ở bước nào?";
  if (field === "targetServiceOrDevice")
    return "Vấn đề xảy ra trên ứng dụng hoặc thiết bị nào?";
  if (field === "environmentIfKnown") return questionFor("environment");
  return (
    hints[field]?.[0] ??
    `Bạn cho biết ${labelForField(field).toLowerCase()} được không?`
  );
}
export function hintFor(field: string) {
  return (
    hints[field]?.[1] ??
    "Điền nếu bạn biết; thông tin này giúp xác định phạm vi xử lý."
  );
}

export function clarificationPlan(
  request: CanonicalRequest,
  missing: string[],
) {
  const priority = [
    ...(/CLOUD_VM_REQUEST|DATABASE_PROVISION/.test(request.intentLabel)
      ? ["cpu", "ram", "disk", "duration"] : []),
    "resetType",
    "desiredOutcome",
    "summary",
    "targetSystem",
    "system",
    "resourceScope",
    "environment",
    "permission",
    "accessType",
    "symptom",
    "duration",
    "reason",
    "verifiedApproval",
  ];
  const fields = [...new Set(missing)]
    .sort((a, b) => {
      const rank = (field: string) => {
        const i = priority.indexOf(field);
        return i < 0 ? priority.length : i;
      };
      return rank(a) - rank(b);
    })
    .slice(0, 3);
  return {
    fields,
    questions: [...new Set(fields.map((field) => questionFor(field, request)))],
  };
}
