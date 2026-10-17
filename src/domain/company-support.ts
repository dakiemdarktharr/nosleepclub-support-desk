import type { Assistance, CanonicalRequest, RequestKind } from "./contracts";
import { normalize } from "./text-normalization";

export const companyServiceGroups = [
  "PEOPLE_HR", "PAYROLL_BENEFITS", "FINANCE_ACCOUNTING", "PROCUREMENT",
  "WORKPLACE_FACILITIES", "CORPORATE_ADMIN", "LEGAL_COMPLIANCE", "BUSINESS_SALES",
  "MARKETING_COMMUNICATIONS", "CUSTOMER_OPERATIONS", "PRODUCT_PROJECTS", "DATA_ANALYTICS",
  "LEARNING_DEVELOPMENT", "TRAVEL_EVENTS", "WORKPLACE_SAFETY",
] as const;
export type CompanyServiceGroup = typeof companyServiceGroups[number];
type Topic = { id: string; label: string; pattern: RegExp; required: string[]; private?: boolean; urgent?: boolean };
type CompanyService = { label: string; team: string; preparation: string; topics: Topic[] };
const topic = (id: string, label: string, pattern: RegExp, required: string[] = [], privacy: "normal" | "private" | "urgent" = "normal"): Topic =>
  ({ id, label, pattern, required, private: privacy === "private", urgent: privacy === "urgent" });

/** Proposed routing and preparation guidance, never official VNG entitlements,
 * HR decisions, legal advice, spending limits or approval authority. */
export const companyServices: Record<CompanyServiceGroup, CompanyService> = {
  PEOPLE_HR: { label: "Nhân sự", team: "Nhân sự", preparation: "Chuẩn bị loại thủ tục, mốc thời gian và điều muốn được hỗ trợ; không gửi hồ sơ cá nhân hoặc thông tin sức khỏe vào kênh chung.", topics: [
    topic("HR_EMPLOYEE_CONCERN", "Phản ánh quan hệ lao động", /\b(?:quay roi|bat nat|phan biet doi xu|workplace harassment|bullying)\b/, [], "private"),
    topic("HR_LEAVE", "Nghỉ phép", /\b(?:nghi phep|xin nghi|annual leave|leave request)\b/, ["timeWindow"]),
    topic("HR_ATTENDANCE", "Chấm công & giờ làm", /\b(?:cham cong|gio lam|tang ca|attendance|timesheet|overtime)\b/, ["timeWindow"]),
    topic("HR_EMPLOYMENT_DOCUMENT", "Giấy xác nhận & hồ sơ nhân sự", /\b(?:xac nhan cong tac|hop dong lao dong|ho so nhan su|employment letter|employment contract)\b/, [], "private"),
    topic("HR_ONBOARDING", "Nhận việc & nghỉ việc", /\b(?:nhan viec|nhan vien moi|nghi viec|ban giao cong viec|onboarding|offboarding)\b/),
    topic("HR_RECRUITMENT", "Tuyển dụng & giới thiệu ứng viên", /\b(?:tuyen dung|ung vien|recruitment|candidate referral)\b/),
  ] },
  PAYROLL_BENEFITS: { label: "Lương & phúc lợi", team: "Lương & phúc lợi", preparation: "Chỉ nêu loại thắc mắc và kỳ liên quan. Phiếu lương, thuế cá nhân, hồ sơ bảo hiểm và thông tin ngân hàng cần kênh riêng đã xác minh.", topics: [
    topic("PAY_BANK_CHANGE", "Thay đổi thông tin nhận lương", /\b(?:tai khoan nhan luong|ngan hang nhan luong|payroll bank|salary bank)\b/, [], "private"),
    topic("PAY_PAYSLIP", "Phiếu lương & chênh lệch lương", /\b(?:phieu luong|bang luong|luong bi|thieu luong|cham luong|payslip|salary discrepancy|payroll)\b/, ["timeWindow"], "private"),
    topic("PAY_INSURANCE", "Bảo hiểm & chế độ", /\b(?:bao hiem|bhxh|bhyt|insurance claim|social insurance)\b/, [], "private"),
    topic("PAY_TAX", "Chứng từ & quyết toán thuế cá nhân", /\b(?:thue thu nhap ca nhan|quyet toan thue|chung tu thue|personal income tax|tax certificate)\b/, [], "private"),
    topic("PAY_BENEFIT", "Phúc lợi & quyền lợi", /\b(?:phuc loi|quyen loi nhan vien|employee benefits|benefit enrollment)\b/),
  ] },
  FINANCE_ACCOUNTING: { label: "Tài chính & kế toán", team: "Tài chính / Kế toán", preparation: "Chuẩn bị loại chi phí, kỳ phát sinh và mã chứng từ không nhạy cảm. Chỉ gửi bản chứng từ đầy đủ qua kênh tài chính đã xác minh.", topics: [
    topic("FIN_EXPENSE", "Hoàn ứng & thanh toán chi phí", /\b(?:hoan ung|tam ung|hoan chi phi|thanh toan chi phi|expense reimbursement|expense claim)\b/),
    topic("FIN_INVOICE", "Hóa đơn & chứng từ", /\b(?:hoa don|chung tu ke toan|invoice|accounting voucher)\b/),
    topic("FIN_PAYMENT", "Theo dõi thanh toán & công nợ", /\b(?:cong no|thanh toan nha cung cap|payment status|accounts payable|receivable)\b/),
    topic("FIN_BUDGET", "Ngân sách & mã chi phí", /\b(?:ngan sach (?:phong|du an|su kien)|ma chi phi|cost center|department budget)\b/),
    topic("FIN_CORPORATE_TAX", "Thuế & đối soát doanh nghiệp", /\b(?:thue doanh nghiep|doi soat|corporate tax|reconciliation)\b/),
  ] },
  PROCUREMENT: { label: "Mua sắm & nhà cung cấp", team: "Mua sắm", preparation: "Nêu nhu cầu sử dụng, số lượng dự kiến và thời điểm cần. Báo giá hoặc nhà cung cấp chưa được xác minh không được coi là đã được duyệt.", topics: [
    topic("BUY_PURCHASE", "Đề nghị mua hàng & thiết bị", /\b(?:de nghi mua|mua sam|mua thiet bi|mua van phong pham|purchase request|procurement)\b/),
    topic("BUY_VENDOR", "Đăng ký & đánh giá nhà cung cấp", /\b(?:dang ky nha cung cap|danh gia nha cung cap|vendor onboarding|supplier registration)\b/),
    topic("BUY_QUOTE", "Báo giá & lựa chọn nhà cung cấp", /\b(?:bao gia|dau thau|quotation|request for proposal|rfp)\b/),
    topic("BUY_ORDER", "Đơn mua hàng & giao nhận", /\b(?:don mua hang|tinh trang don hang|purchase order|delivery status)\b/),
    topic("BUY_RENEWAL", "Gia hạn dịch vụ & hợp đồng mua", /\b(?:gia han dich vu|gia han hop dong mua|vendor renewal|supplier renewal)\b/),
  ] },
  WORKPLACE_FACILITIES: { label: "Văn phòng & cơ sở vật chất", team: "Cơ sở vật chất", preparation: "Nêu vị trí và hiện tượng quan sát được. Không tự sửa điện, tháo thiết bị hoặc xử lý khu vực có dấu hiệu nguy hiểm.", topics: [
    topic("FAC_REPAIR", "Điều hòa, điện, nước & sửa chữa", /\b(?:dieu hoa|may lanh|ro nuoc|hong den|sua chua van phong|air conditioning|water leak)\b/, ["location"]),
    topic("FAC_ROOM", "Phòng họp & không gian làm việc", /\b(?:dat phong hop|phong hop|meeting room|workspace booking)\b/),
    topic("FAC_CLEANING", "Vệ sinh & môi trường làm việc", /\b(?:ve sinh van phong|don dep|rac thai|office cleaning|cleaning request)\b/, ["location"]),
    topic("FAC_PARKING", "Gửi xe & thẻ ra vào", /\b(?:gui xe|the xe|the ra vao|parking|building access card)\b/),
    topic("FAC_MOVE", "Chỗ ngồi & chuyển văn phòng", /\b(?:cho ngoi|chuyen van phong|chuyen ban lam viec|seat allocation|office move)\b/),
  ] },
  CORPORATE_ADMIN: { label: "Hành chính & dịch vụ nội bộ", team: "Hành chính", preparation: "Chuẩn bị loại dịch vụ, thời gian và địa điểm cần hỗ trợ; chỉ sử dụng danh bạ hoặc cổng nội bộ đã được tổ chức xác minh.", topics: [
    topic("ADMIN_MAIL", "Bưu phẩm & chuyển phát", /\b(?:buu pham|chuyen phat|thu tin|courier|mailroom)\b/),
    topic("ADMIN_VISITOR", "Khách đến văn phòng", /\b(?:khach den van phong|dang ky khach|visitor registration|office visitor)\b/),
    topic("ADMIN_SUPPLIES", "Văn phòng phẩm & dịch vụ dùng chung", /\b(?:van phong pham|dich vu noi bo|office supplies|shared office service)\b/),
    topic("ADMIN_DOCUMENT", "Đóng dấu & văn thư", /\b(?:dong dau|van thu|company seal|document stamping)\b/),
    topic("ADMIN_MEAL", "Suất ăn & dịch vụ nhân viên", /\b(?:suat an|can tin|canteen|meal service)\b/),
  ] },
  LEGAL_COMPLIANCE: { label: "Pháp chế & tuân thủ", team: "Pháp chế / Tuân thủ", preparation: "Nêu loại hồ sơ và mục tiêu cần rà soát. Nội dung hợp đồng, thông tin đối tác và phản ánh riêng tư cần được trao đổi qua kênh bảo mật của người phụ trách.", topics: [
    topic("LEGAL_ETHICS", "Đạo đức, gian lận & phản ánh bảo mật", /\b(?:to cao|gian lan|hoi lo|ethics complaint|whistleblow|bribery|fraud report)\b/, [], "private"),
    topic("LEGAL_PRIVACY", "Dữ liệu cá nhân & quyền riêng tư", /\b(?:du lieu ca nhan|quyen rieng tu|personal data request|privacy request|dsar)\b/, [], "private"),
    topic("LEGAL_CONTRACT", "Rà soát hợp đồng & NDA", /\b(?:ra soat hop dong|duyet hop dong|hop dong dich vu|thoa thuan bao mat|nda|contract review)\b/, [], "private"),
    topic("LEGAL_IP", "Sở hữu trí tuệ & bản quyền nội dung", /\b(?:so huu tri tue|ban quyen noi dung|intellectual property|trademark)\b/),
    topic("LEGAL_POLICY", "Tra cứu quy định & tuân thủ", /\b(?:quy dinh noi bo|tuan thu phap ly|legal compliance|compliance policy)\b/),
  ] },
  BUSINESS_SALES: { label: "Kinh doanh & đối tác", team: "Kinh doanh / Đối tác", preparation: "Nêu loại hỗ trợ, mốc thời gian và mã tham chiếu được phép chia sẻ; không đăng danh sách khách hàng, giá riêng hoặc dữ liệu hợp đồng lên kênh chung.", topics: [
    topic("SALES_CRM", "Hồ sơ CRM & dữ liệu cơ hội", /\b(?:crm|co hoi kinh doanh|sales opportunity)\b/),
    topic("SALES_PROPOSAL", "Đề xuất thương mại & báo giá bán", /\b(?:de xuat thuong mai|bao gia ban|sales proposal|commercial proposal)\b/),
    topic("SALES_PARTNER", "Đối tác & bàn giao kinh doanh", /\b(?:hop tac doi tac|ban giao khach hang|partner support|sales handover)\b/),
    topic("SALES_ORDER", "Đơn bán hàng & thông tin sản phẩm", /\b(?:don ban hang|tai lieu ban hang|sales order|sales material)\b/),
  ] },
  MARKETING_COMMUNICATIONS: { label: "Marketing & truyền thông", team: "Marketing / Truyền thông", preparation: "Chuẩn bị mục tiêu, đối tượng, kênh và hạn cần. Nội dung phải qua người có thẩm quyền trước khi phát hành hoặc gửi ra ngoài.", topics: [
    topic("MKT_CAMPAIGN", "Chiến dịch & yêu cầu marketing", /\b(?:chien dich|campaign brief|marketing request|yeu cau marketing)\b/),
    topic("MKT_BRAND", "Nhận diện thương hiệu & thiết kế", /\b(?:thuong hieu|bo nhan dien|thiet ke an pham|brand asset|design request)\b/),
    topic("MKT_CONTENT", "Nội dung & duyệt truyền thông", /\b(?:duyet noi dung|bai truyen thong|content approval|communication request)\b/),
    topic("MKT_MEDIA", "Báo chí & thông tin công bố", /\b(?:bao chi|thong cao|press release|media inquiry)\b/),
    topic("MKT_INTERNAL", "Truyền thông nội bộ", /\b(?:truyen thong noi bo|ban tin noi bo|internal communication|employee newsletter)\b/),
  ] },
  CUSTOMER_OPERATIONS: { label: "Chăm sóc khách hàng & vận hành", team: "Chăm sóc khách hàng / Vận hành", preparation: "Chỉ nêu loại vấn đề và mã hồ sơ không nhạy cảm. Thông tin khách hàng, lịch sử giao dịch và xác minh danh tính cần kênh chuyên trách.", topics: [
    topic("CX_REFUND", "Hoàn tiền & tranh chấp giao dịch", /\b(?:hoan tien|tranh chap giao dich|refund|payment dispute)\b/, [], "private"),
    topic("CX_COMPLAINT", "Khiếu nại & chất lượng dịch vụ", /\b(?:khieu nai khach hang|phan anh dich vu|customer complaint|service complaint)\b/),
    topic("CX_ACCOUNT", "Tài khoản khách hàng", /\b(?:tai khoan khach hang|customer account)\b/, [], "private"),
    topic("CX_OPERATIONS", "Quy trình vận hành & bàn giao ca", /\b(?:ban giao ca|quy trinh van hanh|operations procedure|shift handover)\b/),
    topic("CX_QUALITY", "Kiểm soát chất lượng & lỗi nghiệp vụ", /\b(?:kiem soat chat luong|loi nghiep vu|quality review|operational error)\b/),
  ] },
  PRODUCT_PROJECTS: { label: "Sản phẩm & dự án", team: "Sản phẩm / Quản lý dự án", preparation: "Nêu sản phẩm hoặc dự án, mục tiêu và phạm vi cần phối hợp. Dẫn mã công việc được phép chia sẻ; không suy ra tiến độ khi chưa đọc nguồn thực tế.", topics: [
    topic("PROJECT_COORDINATION", "Điều phối & phụ thuộc dự án", /\b(?:dieu phoi du an|phu thuoc du an|project coordination|project dependency)\b/),
    topic("PRODUCT_FEEDBACK", "Góp ý sản phẩm & yêu cầu tính năng", /\b(?:gop y san pham|yeu cau tinh nang|product feedback|feature request)\b/),
    topic("PROJECT_STATUS", "Tiến độ & thông tin dự án", /\b(?:tien do du an|trang thai du an|project status|project update)\b/),
    topic("PRODUCT_RELEASE", "Phối hợp phát hành sản phẩm", /\b(?:phoi hop phat hanh|ke hoach ra mat|product launch|release coordination)\b/),
  ] },
  DATA_ANALYTICS: { label: "Báo cáo & phân tích dữ liệu", team: "Phân tích dữ liệu / Chủ sở hữu dữ liệu", preparation: "Nêu câu hỏi kinh doanh, kỳ báo cáo và nguồn được phép sử dụng. Quyền dữ liệu và phạm vi chia sẻ phải được chủ sở hữu xác nhận.", topics: [
    topic("ANALYTICS_REPORT", "Đề nghị báo cáo & dashboard", /\b(?:yeu cau bao cao|can bao cao|bao cao doanh so|bao cao kinh doanh|report request|dashboard request)\b/),
    topic("ANALYTICS_METRIC", "Định nghĩa chỉ số & cách đọc báo cáo", /\b(?:dinh nghia chi so|cach doc bao cao|metric definition|dashboard interpretation)\b/),
    topic("ANALYTICS_QUALITY", "Sai lệch & chất lượng dữ liệu", /\b(?:sai lech so lieu|chat luong du lieu|data quality|metric discrepancy)\b/),
    topic("ANALYTICS_SCOPE", "Phạm vi & quyền sử dụng dữ liệu", /\b(?:quyen su dung du lieu|pham vi du lieu|data usage request|data permission)\b/, [], "private"),
  ] },
  LEARNING_DEVELOPMENT: { label: "Đào tạo & phát triển", team: "Đào tạo / Phát triển nhân sự", preparation: "Chuẩn bị mục tiêu học, khóa học mong muốn và thời gian dự kiến. Ngân sách hoặc thời gian học cần người phụ trách xác nhận.", topics: [
    topic("LEARN_ENROLLMENT", "Đăng ký khóa học", /\b(?:dang ky khoa hoc|dang ky dao tao|training enrollment|course registration)\b/),
    topic("LEARN_PLAN", "Kế hoạch & nhu cầu đào tạo", /\b(?:ke hoach dao tao|nhu cau dao tao|learning plan|training request)\b/),
    topic("LEARN_CERTIFICATE", "Chứng nhận & kết quả đào tạo", /\b(?:chung nhan dao tao|chung chi khoa hoc|training certificate|course completion)\b/),
    topic("LEARN_MENTOR", "Mentor & phát triển nghề nghiệp", /\b(?:mentor|co van nghe nghiep|phat trien nghe nghiep|career development)\b/),
  ] },
  TRAVEL_EVENTS: { label: "Công tác & sự kiện", team: "Công tác / Sự kiện", preparation: "Nêu mục đích, địa điểm, thời gian và số người dự kiến. Không tự đặt dịch vụ trả phí hoặc xác nhận chi phí trước phê duyệt.", topics: [
    topic("TRAVEL_BOOKING", "Đi công tác & đặt dịch vụ", /\b(?:di cong tac|dat ve may bay|dat khach san|business travel|travel booking)\b/),
    topic("TRAVEL_DOCUMENT", "Giấy tờ công tác & thị thực", /\b(?:giay to cong tac|thi thuc|visa request|travel document)\b/, [], "private"),
    topic("EVENT_ORGANIZATION", "Tổ chức sự kiện & hội thảo", /\b(?:to chuc su kien|hoi thao|event organization|event request)\b/),
    topic("EVENT_TEAM", "Hoạt động đội nhóm", /\b(?:hoat dong doi nhom|team building|team event)\b/),
  ] },
  WORKPLACE_SAFETY: { label: "An toàn & an ninh nơi làm việc", team: "An toàn / An ninh cơ sở", preparation: "Ưu tiên an toàn tại chỗ, nêu vị trí nếu có thể làm an toàn. Không chờ phản hồi của ứng dụng để ứng phó nguy hiểm đang xảy ra.", topics: [
    topic("SAFETY_EMERGENCY", "Nguy hiểm đang xảy ra", /\b(?:hoa hoan|bao chay|chay no|co khoi|mui khet|ro ri gas|dien giat|fire at|smoke at|gas leak|immediate danger)\b/, [], "urgent"),
    topic("SAFETY_HAZARD", "Nguy cơ mất an toàn", /\b(?:nguy co mat an toan|loi thoat hiem|safety hazard|blocked fire exit)\b/, ["location"]),
    topic("SAFETY_ACCESS", "An ninh tại cơ sở", /\b(?:nguoi la dot nhap|mat an ninh|security at office|unauthorized visitor)\b/, [], "urgent"),
    topic("SAFETY_PROPERTY", "Thất lạc tài sản cá nhân", /\b(?:that lac tai san|mat do ca nhan|lost personal property|lost and found)\b/),
  ] },
};

export function isCompanyService(group: string): group is CompanyServiceGroup {
  return companyServiceGroups.some(value => value === group);
}
export function companyTopic(intent: string) {
  for (const group of companyServiceGroups) {
    const service = companyServices[group], found = service.topics.find(value => value.id === intent);
    if (found) return { ...found, group, service };
  }
  return null;
}
export function privateCompanyTopic(request: Pick<CanonicalRequest, "intentLabel" | "subrequests">) {
  return [request, ...request.subrequests].map(part => companyTopic(part.intentLabel)).find(topic => topic?.private);
}
export function classifyCompanySupport(text: string) {
  const normalized = normalize(text);
  const matches = companyServiceGroups.flatMap(group => companyServices[group].topics
    .filter(value => [...normalized.matchAll(new RegExp(value.pattern.source, "g"))].some(match => {
      const prefix = (normalized.slice(0, match.index).split(/[.;,!?\n]/).at(-1) ?? "")
        .replace(/\b(?:khong biet|chua biet|khong ro|chua ro)\b/g, " ");
      // Missing service/results are support requests, not a denial of the topic.
      // Absence of a hazard still suppresses urgent routing ("không có mùi khét").
      const absenceIsSafe = value.urgent || ["HR_EMPLOYEE_CONCERN", "LEGAL_ETHICS"].includes(value.id);
      const missingService = !absenceIsSafe && /\b(?:(?:khong|chua)\s+(?:nhan(?: duoc)?|thay|tim thay|duoc(?: duyet)?|co)|not received(?: my| the)?|missing|no)\s*$/.test(prefix);
      if (missingService) return true;
      return !/\b(?:khong|chua|no|not|without)\b(?:\s+\w+){0,3}\s*$/.test(prefix);
    })).map(value => ({ ...value, group })));
  const found = matches.find(value => value.urgent) ?? matches.find(value => value.private) ?? matches[0];
  if (!found) return null;
  if (/\b(?:read only|select|write|push)\s+(?:permissions?\s+)?access\b/.test(normalized)) return null;
  // Business vocabulary in the purpose of an infrastructure request must not
  // steal its technical authority checks (for example DB export for reconciliation).
  if (!found.urgent && /\b(?:vpn|github|gitlab|postgresql|postgres|mysql|mongodb|database|db|kubernetes|k8s|pipeline|firewall|mfa|edr|dns|gpu|cloud|server|sandbox|kafka|clickhouse)\b/.test(normalized) &&
      /\b(?:access|quyen|permission|push|day|clone|export|xuat|drop|delete|restore|cap|tao|create|need|can|provision|ket noi|khong hoat dong)\b/.test(normalized)) return null;
  const guidance = /\b(?:quy trinh|thu tuc|huong dan|lam sao|cach|how to|procedure|process)\b/.test(normalized) &&
    !/\b(?:duyet (?:ngay|giup)|tu dong duyet|phe duyet|approve|cap quyen|chuyen tien|send money)\b/.test(normalized);
  return { serviceGroup: found.group, intentLabel: found.id,
    requestKind: (found.urgent ? "INCIDENT" : guidance && !found.private ? "GUIDANCE" : "ROUTINE_WORKFLOW") as RequestKind,
    urgent: !!found.urgent, private: !!found.private };
}
export function companyGuidance(request: CanonicalRequest, round: number): Omit<Assistance, "source" | "timestamp"> | null {
  const found = companyTopic(request.intentLabel);
  if (!found) return null;
  const steps = round > 0 ? [
    "Dừng lặp lại bước chưa hiệu quả và ghi lại phần còn vướng, không gửi dữ liệu cá nhân hoặc thông tin bí mật.",
    `Nhờ ${found.service.team} hỗ trợ trực tiếp qua kênh nội bộ đã xác minh và giữ mã yêu cầu để theo dõi.`,
  ] : [found.service.preparation,
    `Mở danh bạ hoặc cổng nội bộ đã xác minh để tìm quy trình hiện hành của ${found.service.team}; nếu chưa có nguồn, hỏi người phụ trách trước.`,
    "Gửi đề nghị trong đúng phạm vi và chờ người có thẩm quyền xác nhận. Hướng dẫn này chưa duyệt chi phí, quyền lợi hoặc thay đổi hồ sơ.",
    "Kiểm tra người phụ trách đã tiếp nhận, thời điểm phản hồi và kết quả thực tế; nếu còn vướng, giữ mã yêu cầu để hỏi tiếp.",
  ];
  return { summary: `Chuẩn bị yêu cầu ${found.label.toLocaleLowerCase("vi")}.`,
    stepByStepInstructions: steps, options: ["A. Tôi đã làm được", "B. Vẫn còn lỗi", "C. Giải thích bước này", "D. Chuyển cho nhân viên hỗ trợ"],
    expectedResult: "Xác định được thông tin cần chuẩn bị và người phụ trách; kết quả nghiệp vụ vẫn cần bộ phận có thẩm quyền xác nhận.",
    warning: "Không gửi hồ sơ cá nhân, thông tin thanh toán hoặc dữ liệu khách hàng vào kênh chung. Quy trình nội bộ cần được xác minh; ứng dụng chưa thực thi nghiệp vụ bên ngoài.",
    nextQuestion: "Bạn cần làm rõ bước chuẩn bị nào hoặc muốn nhờ người phụ trách hỗ trợ trực tiếp?", canPassToAdmin: true };
}
