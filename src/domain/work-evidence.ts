import { normalize } from "./text";

export type EvidenceRequirement = {
  artifact: string;
  range: string;
  access: string;
  reason: string;
};
export type WorkEvidence = {
  kind: string;
  requirements: EvidenceRequirement[];
  nextAction: string;
  sourceChecks: Array<{ source: string; result: string }>;
  confidence: string;
};

// These are input contracts, not canned answers or claims of completed work.
const profiles = [
  { kind: "sales", match: /doanh thu|\bsales\b|ban chay|best.selling/,
    artifact: "Bảng doanh thu/sales/revenue của kỳ cần báo cáo", range: "Ngày bán, sản phẩm/SKU, số lượng, doanh thu; toàn bộ kỳ báo cáo",
    reason: "Xác định kỳ và kiểm tra dữ liệu để tính sản phẩm đứng đầu.",
    nextAction: "Kiểm tra dữ liệu, tính tổng theo sản phẩm cho cả số lượng và doanh thu; trả công thức và bảng xếp hạng." },
  { kind: "code", match: /(?:sua|fix|debug).{0,60}(?:loi|bug|dong|line|src\/)|\bsrc\/[^\s]+\.[a-z]+/,
    artifact: "Repository và file mã nguồn được yêu cầu", range: "Commit/branch, dòng lỗi và ít nhất 30 dòng trước/sau; test liên quan, lỗi tái hiện",
    reason: "Xác định nguyên nhân từ mã nguồn thật và xác minh patch.",
    nextAction: "Đọc ngữ cảnh, tái hiện nếu có công cụ, tạo diff tối thiểu; báo test/typecheck và ảnh hưởng API, ghi rõ kiểm tra chưa chạy." },
  { kind: "contract", match: /hop dong|\bcontracts?\b/,
    artifact: "Hai phiên bản hợp đồng, ghi rõ bản cũ và bản mới", range: "Toàn văn, metadata/version và số trang/điều khoản",
    reason: "Ghép đúng các điều khoản giữa hai phiên bản.",
    nextAction: "Lập bảng thêm/sửa/xóa có trích vị trí, trách nhiệm, thời hạn, rủi ro và các điểm cần ý kiến pháp lý." },
  { kind: "email", match: /\bemail\b|thu phan hoi/,
    artifact: "Nội dung khách hàng cần phản hồi và tối đa ba email mẫu gần nhất của bạn", range: "Đúng người gửi, ngày gửi và phần nội dung cần dùng; loại bỏ thông tin nhạy cảm",
    reason: "Soạn đúng nội dung và giọng điệu từ mẫu có thật.",
    nextAction: "Soạn bản nháp, dẫn nguồn phong cách; đánh dấu cam kết, giá và SLA cần duyệt; không gửi email." },
  { kind: "analytics", match: /traffic|analytics|luu luong truy cap/,
    artifact: "Dashboard Analytics hoặc bản export", range: "Định nghĩa traffic, kỳ hiện tại/kỳ so sánh, kênh, trang, quốc gia, thiết bị, sự kiện tracking",
    reason: "Kiểm tra tracking và phân rã thay đổi trước khi kết luận.",
    nextAction: "Kiểm tra độ đầy đủ, lập bảng bằng chứng và xếp hạng giả thuyết theo độ tin cậy; đề xuất hành động." },
  { kind: "sql", match: /\bsql\b|cau truy van|query optimization/,
    artifact: "SQL gốc, dialect/database, schema, indexes và EXPLAIN nếu có", range: "Truy vấn đầy đủ, tham số đại diện đã ẩn danh và execution plan",
    reason: "Bảo toàn semantics và kiểm chứng hiệu năng.",
    nextAction: "So sánh SQL trước/sau, nêu tính tương đương, trade-off, plan/benchmark thực tế và rollback; không bịa số đo." },
  { kind: "meeting", match: /cuoc hop|bien ban|transcript|meeting/,
    artifact: "Lịch/cuộc họp và transcript hoặc biên bản", range: "Ngày, giờ, múi giờ, người tham dự và vị trí đoạn ghi nhận quyết định",
    reason: "Phân biệt quyết định đã xác nhận với suy luận.",
    nextAction: "Tạo bảng quyết định/action item nháp, người phụ trách và hạn có bằng chứng; mục mơ hồ ghi cần xác nhận; không giao việc hoặc thông báo." },
  { kind: "pr", match: /pull request|\bpr\b.{0,50}\bapi\b|breaking|pha vo api/,
    artifact: "URL/ID PR, diff, baseline và API contract/OpenAPI/SDK", range: "Commit đầu/cuối, phiên bản API còn hỗ trợ và compatibility tests",
    reason: "So sánh API với baseline đúng phiên bản.",
    nextAction: "Phân loại breaking/non-breaking/chưa đủ bằng chứng theo file/dòng, payload, lỗi; báo compatibility tests và migration." },
  { kind: "inventory", match: /ton kho|inventory|stock forecast/,
    artifact: "Lịch sử bán hàng, tồn kho hiện tại, lead time và đơn hàng đang về", range: "Theo SKU/kho, ngày, mức dịch vụ và kỳ dự báo",
    reason: "Xây dựng dự báo có thể tái lập và đánh giá bất định.",
    nextAction: "Kiểm tra độ đầy đủ, dự báo theo SKU/kho với giả định, khoảng bất định, đánh giá và cảnh báo thiếu hàng; không tạo lệnh mua." },
  { kind: "document", match: /(?:cap nhat|sua|update).{0,60}(?:tai lieu|document|phan \d|section)/,
    artifact: "Tài liệu dự án chính thức và nguồn quyết định mới nhất đã phê duyệt", range: "ID/version tài liệu, phần cần sửa, biên bản hoặc ticket quyết định và trạng thái phê duyệt",
    reason: "Sửa đúng phạm vi theo quyết định có bằng chứng.",
    nextAction: "Tạo bản nháp/diff cho đúng phần, dẫn quyết định và mô tả tác động; giữ cấu trúc ngoài phạm vi và không ghi đè bản gốc." },
] as const;

export type WorkKind = (typeof profiles)[number]["kind"];
export const workKinds = profiles.map((profile) => profile.kind) as WorkKind[];

export function workEvidencePlan(question: string): WorkEvidence | undefined {
  const text = normalize(question);
  // Access to an artifact is not a request to author/analyse it. Keep approval
  // and missing access facts in the support policy, even if the purpose mentions email/meetings.
  if (/\b(?:cap|xin|cho|need|request|grant|add)\b[^.;\n]{0,70}\b(?:quyen|access|permission)\b/.test(text)) return;
  // A resource named "inventory" or an email login issue is not an analysis task.
  if (!/so sanh|tom tat|du bao|toi uu|viet |sua loi|fix |debug|cap nhat|tim nguyen nhan|phan tich|kiem tra|hay cho biet|compare|summarize|forecast|optimi[sz]e|draft|update|analy[sz]e|review/.test(text)) return;
  const profile = profiles.find((item) => item.match.test(text));
  if (!profile) return;
  return workEvidenceForKind(profile.kind, question);
}

export function workEvidenceForKind(kind: WorkKind, question: string): WorkEvidence {
  const profile = profiles.find((item) => item.kind === kind)!;
  const text = normalize(question);
  const path = question.match(/\b(?:src\/)[\w./-]+/i)?.[0].replace(/[.]+$/, "");
  const line = text.match(/\b(?:dong|line)\s+(\d{1,7})\b/)?.[1];
  return {
    kind: profile.kind,
    requirements: [{
      artifact: profile.kind === "code" && path ? `Repository và file ${path}` : profile.artifact,
      range: profile.kind === "code" && line
        ? `Dòng ${line}, ngữ cảnh dòng ${Math.max(1, Number(line) - 30)}–${Number(line) + 30}; commit/branch, test liên quan và lỗi tái hiện`
        : profile.range,
      access: "Nội dung được phép cung cấp trong hội thoại hoặc quyền đọc qua connector của ứng dụng",
      reason: profile.reason,
    }],
    nextAction: profile.nextAction,
    sourceChecks: [{ source: "Nội dung yêu cầu", result: "Đã đọc; chưa có kết quả đọc artefact bằng connector của ứng dụng." }],
    confidence: "Chưa đủ bằng chứng để đưa ra kết quả công việc.",
  };
}
