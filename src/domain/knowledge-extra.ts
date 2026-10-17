import type { KnowledgeArticle } from "./knowledge";
import type { AnswerSource } from "./contracts";
import type { ConversationLabel } from "./conversation";
const checkedAt = "2026-09-21";
const recovery: AnswerSource = {
  title: "Google: Khôi phục tài khoản",
  url: "https://support.google.com/accounts/answer/7682439?hl=vi",
  scope: "public",
  checkedAt,
};
const recoveryTips: AnswerSource = {
  title: "Google: Mẹo xác minh chủ tài khoản",
  url: "https://support.google.com/accounts/answer/7299973?hl=vi",
  scope: "public",
  checkedAt,
};
const people: AnswerSource = {
  title: "VNG: Phát triển con người — tổng quan công khai",
  url: "https://vng.com.vn/news/enterprise/chien-luoc-phat-trien-con-nguoi.html",
  scope: "public",
  checkedAt,
};
const project: AnswerSource = {
  title: "VNG Support: hướng dẫn demo đã review",
  url: "https://github.com/dakiemdarktharr/DOCRELAY_MLAI2026",
  scope: "project",
  checkedAt,
};
// Original, bounded guidance. Public sources never establish private employee entitlements.
const entries: Array<
  [string, ConversationLabel, string, string[], string, AnswerSource[]]
> = [
  [
    "recovery-username",
    "GOOGLE_RECOVERY",
    "Quên địa chỉ Gmail hoặc tên đăng nhập",
    [
      "username",
      "ten dang nhap",
      "quen dia chi",
      "tim email",
      "so dien thoai khoi phuc",
    ],
    "Nếu quên địa chỉ Gmail, dùng mục tìm tên đăng nhập trong hướng dẫn Google. Chuẩn bị số điện thoại hoặc email khôi phục và họ tên đã đăng ký; nhập chúng trực tiếp trên Google. Bạn quên địa chỉ email hay chỉ quên mật khẩu?",
    [recovery],
  ],
  [
    "recovery-code",
    "GOOGLE_RECOVERY",
    "Không nhận được mã xác minh Google",
    [
      "ma xac minh",
      "verification code",
      "khong nhan",
      "email xac minh",
      "inbox",
    ],
    "Kiểm tra thư rác của email khôi phục. Nếu Google yêu cầu mã ở nơi bạn không truy cập được, chọn thử cách khác nếu có. Chỉ nhập mã trên trang Google chính thức; không gửi mã vào chat. Bạn đang chờ mã qua email hay điện thoại?",
    [recoveryTips],
  ],
  [
    "recovery-device",
    "GOOGLE_RECOVERY",
    "Google chưa xác minh được chủ tài khoản",
    [
      "chu tai khoan",
      "device",
      "trinh duyet quen thuoc",
      "xac minh duoc",
      "recovery device",
    ],
    "Thử khôi phục bằng thiết bị, trình duyệt và nơi bạn thường đăng nhập. Trả lời các câu hỏi xác minh trực tiếp trên Google. Đây là gợi ý tăng khả năng xác minh, không bảo đảm lấy lại được tài khoản. Bạn còn thiết bị từng đăng nhập không?",
    [recoveryTips],
  ],
  [
    "software-os",
    "SOFTWARE_GUIDE",
    "Chọn phần mềm theo hệ điều hành",
    [
      "windows",
      "macos",
      "operating system",
      "he dieu hanh",
      "tuong thich",
      "phien ban",
    ],
    "Ghi tên chương trình và hệ điều hành, sau đó đối chiếu mục yêu cầu hệ thống trên trang nhà phát hành. Chọn đúng phiên bản dành cho máy bạn; không chạy gói không rõ nguồn. Bạn đang dùng Windows, macOS hay Linux và phiên bản nào?",
    [],
  ],
  [
    "software-publisher",
    "SOFTWARE_GUIDE",
    "Kiểm tra nhà phát hành và nguồn tải",
    [
      "publisher",
      "nha phat hanh",
      "website chinh thuc",
      "nguon tai",
      "official",
    ],
    "Tìm tên nhà phát hành từ tài liệu của ứng dụng, rồi kiểm tra tên miền và thông tin gói tải. Tránh nút tải quảng cáo hoặc link do người lạ gửi. Nếu chưa xác định được chương trình, mình cần tên chính xác để hướng dẫn tiếp; không đoán đường dẫn tải.",
    [],
  ],
  [
    "software-install-blocked",
    "SOFTWARE_GUIDE",
    "Trình cài đặt yêu cầu quyền quản trị",
    [
      "administrator permission",
      "quyen quan tri",
      "khong du quyen",
      "installation",
      "cai dat",
    ],
    "Dừng tại màn hình yêu cầu quyền nếu bạn chưa có quyền hợp lệ. Ghi tên phần mềm và thông báo đang thấy; kiểm tra danh mục ứng dụng được công ty cho phép. Mình có thể giúp xác định gói cài phù hợp, nhưng không hướng dẫn vượt qua kiểm soát hay tự cấp quyền.",
    [],
  ],
  [
    "gpu-preparation",
    "CLOUD_GPU_GUIDE",
    "Chuẩn bị workload trước khi dùng GPU",
    ["chuan bi", "prepare", "workload", "framework", "du lieu", "muc tieu"],
    "Chuẩn bị mục tiêu chạy, framework, kích thước mô hình/dữ liệu và thời gian dự kiến. Dùng dữ liệu mẫu không nhạy cảm để ước lượng nhu cầu trước. Đây là checklist chuẩn bị, chưa phải xác nhận bạn được quyền tạo tài nguyên. Bạn đang huấn luyện hay chạy suy luận?",
    [project],
  ],
  [
    "gpu-budget",
    "CLOUD_GPU_GUIDE",
    "Ước lượng và theo dõi chi phí cloud GPU",
    ["chi phi", "cost", "estimate", "budget", "du tru", "theo doi"],
    "Ước lượng thời gian sử dụng cùng cấu hình cần thiết, rồi tra bảng giá chính thức đang áp dụng; chú ý thêm lưu trữ và truyền dữ liệu. Đặt kế hoạch kết thúc phiên theo tài liệu nền tảng khi đã có quyền. Mình chưa có đơn giá hoặc ngân sách nội bộ được xác minh để báo một con số cụ thể.",
    [project],
  ],
  [
    "gpu-entitlement",
    "CLOUD_GPU_GUIDE",
    "Quota và quyền GPU nội bộ chưa xác minh",
    ["quota", "mien phi", "free", "entitlement", "cap quyen", "nhan vien"],
    "Mình chưa có tài liệu nội bộ được xác minh về quota hoặc quyền GPU của nhân viên. Thông tin sản phẩm công khai không chứng minh quyền của bạn. Bạn có thể tra cổng tài liệu nội bộ được công ty cung cấp; không cần gửi thông tin nhạy cảm vào demo. Mình vẫn có thể giải thích cách chuẩn bị workload và ước lượng nhu cầu.",
    [project],
  ],
  [
    "gpu-contact",
    "CLOUD_GPU_GUIDE",
    "Hỏi ai về sử dụng cloud GPU",
    ["nen hoi ai", "lien he ai", "hoi nhom nao", "cloud gpu", "su dung gpu"],
    "Trong demo này, hãy bắt đầu qua Support Desk để được chuyển tới nhóm Cloud/ML Infra phù hợp. Chuẩn bị mục đích sử dụng, framework, dữ liệu dự kiến và thời gian chạy; không gửi thông tin đăng nhập. Nhóm thực tế và quy trình có thể thay đổi, nên xác minh lại trên cổng nội bộ hiện hành trước khi tạo tài nguyên.",
    [project],
  ],
  [
    "policy-leave",
    "COMPANY_POLICY",
    "Chính sách nghỉ phép: cần tài liệu áp dụng",
    ["nghi phep", "annual leave", "leave days", "bao nhieu ngay", "phep nam"],
    "Nguồn công khai của VNG nói về định hướng phúc lợi, không xác định số ngày nghỉ áp dụng cho bạn. Mình chưa có chính sách nội bộ được xác minh nên không đưa ra con số. Hãy đối chiếu tài liệu nhân sự hiện hành của đơn vị; mình có thể giúp bạn lập danh sách mục cần đọc.",
    [people],
  ],
  [
    "policy-remote",
    "COMPANY_POLICY",
    "Làm việc từ xa và quy định nội bộ",
    ["lam viec tu xa", "remote work", "work from home", "wfh", "hybrid"],
    "Mình chưa có quy định làm việc từ xa được xác minh cho đơn vị của bạn. Bài công khai không đủ xác nhận số ngày hoặc điều kiện được áp dụng. Trong tài liệu nội bộ, hãy tìm đối tượng áp dụng, lịch làm việc, yêu cầu bảo mật và cách đăng ký. Không cần tự tạo yêu cầu reviewer chỉ để hỏi khái niệm này.",
    [people],
  ],
  [
    "browser-help",
    "GENERAL_GUIDE",
    "Trang web không tải trong trình duyệt",
    [
      "trang web",
      "website",
      "browser",
      "trinh duyet",
      "page",
      "khong tai",
      "load",
    ],
    "Kiểm tra xem các trang khác có mở được không, rồi thử tải lại trang một lần và ghi thông báo lỗi. Có thể thử cửa sổ riêng tư để phân biệt lỗi phiên đăng nhập; thao tác này không thay cấu hình hệ thống. Không bỏ qua cảnh báo chứng chỉ. Bạn thấy lỗi trên một trang hay tất cả trang?",
    [project],
  ],
  [
    "explain-error",
    "GENERAL_GUIDE",
    "Mô tả lỗi không cần thuật ngữ kỹ thuật",
    [
      "mo ta loi",
      "describe error",
      "technical jargon",
      "bao loi",
      "thong tin",
      "thong bao loi",
    ],
    "Hãy nói bạn muốn làm gì, đã bấm tới bước nào, điều gì xảy ra và từ khi nào. Nếu có thông báo lỗi, chép phần không chứa dữ liệu cá nhân hoặc mã bí mật. Bạn không cần tự đoán nguyên nhân; mình sẽ hỏi thêm từng phần còn thiếu.",
    [project],
  ],
  [
    "everyday-breakfast",
    "EVERYDAY",
    "Gợi ý bữa sáng nhanh",
    ["bua sang", "an sang", "breakfast", "nhanh", "truoc khi di lam"],
    "Bạn có thể chọn bánh mì với trứng, yến mạch với trái cây hoặc một món nóng quen thuộc gần nhà. Nếu cần nhanh, chuẩn bị nguyên liệu từ tối trước. Chọn theo khẩu vị và tránh nguyên liệu bạn dị ứng. Bạn muốn tự chuẩn bị hay mua ngoài?",
    [],
  ],
];
export const additionalKnowledge: KnowledgeArticle[] = entries.map(
  ([slug, label, title, keywords, answer, sources]) => ({
    _id: `support-kb-v1-${slug}`,
    label,
    title,
    keywords,
    answer,
    sources,
    version: 1,
    reviewedAt: checkedAt,
    expiresAt: "2026-12-20T00:00:00.000Z",
  }),
);
