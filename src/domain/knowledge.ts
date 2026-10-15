import { additionalKnowledge } from "./knowledge-extra";
import type { AnswerSource } from "./contracts";
import type { ConversationLabel } from "./conversation";
export type KnowledgeArticle = {
  _id: string;
  label: ConversationLabel;
  keywords: string[];
  title: string;
  answer: string;
  sources: AnswerSource[];
  reviewedAt: string;
  expiresAt: string;
  version: number;
};
const checkedAt = "2026-09-21";
const rebrandedLabels: ConversationLabel[] = [
  "GREETING",
  "IDENTITY",
  "CAPABILITIES",
];
// Keep old Mongo documents for provenance, but never retrieve superseded identity text.
export const supersededKnowledgeIds = rebrandedLabels.map(
  (label) => `support-kb-v1-${label.toLowerCase()}`,
);
const project: AnswerSource = {
  title: "Khả năng của VNG Support",
  url: "https://github.com/dakiemdarktharr/DOCRELAY_MLAI2026",
  scope: "project",
  checkedAt,
};
const google: AnswerSource = {
  title: "Google: Khôi phục Tài khoản Google hoặc Gmail",
  url: "https://support.google.com/accounts/answer/7682439?hl=vi",
  scope: "public",
  checkedAt,
};
const people: AnswerSource = {
  title: "VNG: Chiến lược Phát triển Con người (BCTN 2024)",
  url: "https://vng.com.vn/news/enterprise/chien-luoc-phat-trien-con-nguoi.html",
  scope: "public",
  checkedAt,
};
const entries: Array<
  [ConversationLabel, string, string[], string, AnswerSource[]]
> = [
  [
    "GREETING",
    "Chào hỏi",
    ["chao", "hello", "hi"],
    "Xin chào! Mình là trợ lý VNG Support. Bạn có thể hỏi chuyện thường ngày, nhờ hướng dẫn sử dụng ứng dụng hoặc mô tả lỗi bằng lời của mình. Bạn đang muốn tìm hiểu điều gì?",
    [project],
  ],
  [
    "IDENTITY",
    "Tên trợ lý",
    ["ten", "name", "ai"],
    "Mình là trợ lý AI VNG Support, đồng hành với bạn trong việc tìm câu trả lời và hỗ trợ kỹ thuật. Mình có thể giải thích và hướng dẫn; việc cấp quyền hay thay đổi hệ thống cần quy trình riêng.",
    [project],
  ],
  [
    "CAPABILITIES",
    "Trợ lý hỗ trợ gì",
    ["xu ly", "ho tro", "request", "capabilities"],
    "Bạn có thể hỏi mình về máy tính, tài khoản, VPN, phần mềm, cách tìm hiểu cloud/GPU và các câu hỏi thường ngày. Hãy nói mục tiêu hoặc thông báo lỗi; mình sẽ hướng dẫn từng bước, hỏi đúng thông tin còn thiếu và trích nguồn khi có. Mình không tự cấp quyền hoặc thao tác hạ tầng. Bạn có thể chủ động nhờ nhân viên khi cần.",
    [project],
  ],
  [
    "EVERYDAY",
    "Gợi ý bữa ăn",
    ["an", "mon", "dinner", "lunch", "recipe", "banh"],
    "Nếu chưa biết ăn gì, bạn có thể chọn cơm với rau và trứng, bún/phở hoặc một món chay mình thích. Nếu nấu nhanh ở nhà, cơm, trứng và rau xào khá dễ chuẩn bị. Bạn muốn ăn ngoài hay tự nấu, và có món nào cần tránh không?",
    [],
  ],
  [
    "GOOGLE_RECOVERY",
    "Khôi phục Google/Gmail",
    ["google", "gmail", "khoi phuc", "recover", "login", "quen"],
    "Với tài khoản Google của chính bạn, mở trang trợ giúp Google trong nguồn bên dưới, chọn liên kết khôi phục tài khoản và trả lời các câu hỏi xác minh trực tiếp trên Google. Đặt mật khẩu mới khi Google yêu cầu. Nếu quên địa chỉ đăng nhập, chọn tìm tên người dùng bằng email/số điện thoại khôi phục và họ tên. Nếu tài khoản do cơ quan quản lý, quy trình tự khôi phục có thể không áp dụng. Không gửi mật khẩu hoặc mã xác minh vào cuộc trò chuyện này. Bạn quên mật khẩu, quên địa chỉ email hay không nhận được mã xác minh?",
    [google],
  ],
  [
    "SOFTWARE_GUIDE",
    "Tải phần mềm an toàn",
    ["tai", "download", "install", "phan mem", "chuong trinh", "software"],
    "Để chỉ đúng cách tải, mình cần tên đầy đủ của chương trình và hệ điều hành bạn đang dùng. Với tên chưa xác định như abcxyz, mình chưa thể xác minh nhà phát hành hoặc đường dẫn tải. Khi đã xác định, hãy dùng website chính thức hoặc cửa hàng ứng dụng của hệ điều hành, kiểm tra nhà phát hành và phiên bản tương thích. Với máy công ty, ưu tiên danh mục phần mềm được duyệt. Nếu trình cài đặt yêu cầu quyền quản trị, đừng tìm cách vượt qua; mình vẫn có thể giúp bạn xác định gói phù hợp trước. Bạn dùng Windows, macOS hay Linux?",
    [],
  ],
  [
    "CLOUD_GPU_GUIDE",
    "Tìm hiểu GPU công ty",
    ["gpu", "cloud", "su dung", "quota"],
    "Để bắt đầu, xác định mục đích chạy GPU (học thử, huấn luyện hay suy luận), framework cần dùng và dữ liệu dự định xử lý. Tiếp theo tra cứu tài liệu nội bộ về nền tảng được duyệt, tài khoản truy cập, hạn mức và chi phí; dùng ví dụ nhỏ trong môi trường thử nghiệm khi bạn đã có quyền hợp lệ. Theo dõi mức sử dụng và kết thúc phiên theo tài liệu của nền tảng. Mình chưa có chính sách GPU nội bộ đã được xác minh, nên không khẳng định cổng truy cập, GPU hay quota mà công ty cấp cho bạn. Bạn đang muốn tìm hiểu quy trình hay đã có một nền tảng cụ thể?",
    [],
  ],
  [
    "COMPANY_POLICY",
    "Tra cứu chính sách VNG",
    ["chinh sach", "policy", "noi quy", "phuc loi", "nghi phep", "nhan vien"],
    "VNG có công bố thông tin tổng quan về phát triển con người, phúc lợi và việc tập trung tài liệu nội bộ trên nền tảng tra cứu. Bài công khai không cung cấp đầy đủ quy định áp dụng cho từng nhân viên. Mình có thể giúp tìm và giải thích nguồn công khai, nhưng chưa có tài liệu nội bộ được xác minh về số ngày nghỉ, quyền GPU hoặc quy trình phê duyệt của bạn. Bạn muốn tìm chính sách về chủ đề nào?",
    [people],
  ],
  [
    "GENERAL_GUIDE",
    "Làm rõ câu hỏi",
    ["cach", "how", "la gi", "what"],
    "Mình có thể giúp giải thích hoặc hướng dẫn. Bạn muốn đạt kết quả gì, và đang sử dụng ứng dụng hay thiết bị nào? Chỉ cần mô tả bằng lời thường ngày; không cần tự chọn nhóm kỹ thuật.",
    [],
  ],
];
export const knowledgeSeed: KnowledgeArticle[] = entries.map(
  ([label, title, keywords, answer, sources]) => ({
    _id: `support-kb-v${rebrandedLabels.includes(label) ? 2 : 1}-${label.toLowerCase()}`,
    label,
    title,
    keywords,
    answer,
    sources,
    version: rebrandedLabels.includes(label) ? 2 : 1,
    reviewedAt: checkedAt,
    expiresAt: "2026-12-20T00:00:00.000Z",
  }),
);

// Multiple articles may share a label: retrieval must still follow the actual question.
knowledgeSeed.push({
  _id: "support-kb-v1-everyday-cake",
  label: "EVERYDAY",
  title: "Bánh kem đơn giản tại nhà",
  keywords: ["banh kem", "cong thuc", "cake", "recipe"],
  version: 1,
  reviewedAt: checkedAt,
  expiresAt: "2026-12-20T00:00:00.000Z",
  sources: [],
  answer:
    "Bạn có thể làm bánh kem nhỏ với cốt bánh bông lan mua sẵn, 200 ml whipping cream lạnh, 20 g đường và trái cây đã rửa sạch.\n\n1. Giữ kem, tô và que đánh lạnh; đánh kem với đường đến khi kem tạo chóp, dừng trước khi kem tách nước.\n2. Đặt cốt bánh lên đĩa, phết một lớp kem; thêm trái cây rồi phủ kem lên mặt bánh.\n3. Cho bánh vào ngăn mát khoảng 1–2 giờ trước khi ăn. Giữ lạnh phần bánh còn lại theo hướng dẫn bảo quản trên hộp kem.\n\nCông thức này có sữa và cốt bánh có thể chứa trứng, gluten; kiểm tra nguyên liệu nếu có dị ứng. Bạn muốn dùng cốt bánh sẵn hay tự nướng?",
});

knowledgeSeed.push(...additionalKnowledge);

// A bounded concept answer, not instructions to change corporate DNS settings.
knowledgeSeed.push({
  _id: "support-kb-v1-dns-concept",
  label: "GENERAL_GUIDE",
  title: "DNS là gì?",
  keywords: ["dns", "domain name system", "phan giai ten mien"],
  answer: "DNS (Domain Name System) là hệ thống phân giải tên miền thành địa chỉ IP để thiết bị tìm đúng máy chủ. Khi bạn nhập tên một website, thiết bị tra cứu DNS để biết địa chỉ cần kết nối; bạn không phải nhớ địa chỉ IP. Đây là giải thích khái niệm, không phải yêu cầu mở cổng hoặc thay đổi cấu hình mạng.",
  sources: [{
    title: "Cloudflare: What is DNS?",
    url: "https://www.cloudflare.com/learning/dns/what-is-dns/",
    scope: "public",
    checkedAt: "2026-10-15",
  }],
  version: 1,
  reviewedAt: "2026-10-15",
  expiresAt: "2027-01-15T00:00:00.000Z",
});
