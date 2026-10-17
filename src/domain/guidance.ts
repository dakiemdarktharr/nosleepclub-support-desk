import { normalize } from "./text";
import { faqTopic } from "./faq-intent";
import { intentName } from "./presentation";
import type { Assistance, CanonicalRequest } from "./contracts";
import { guidanceRules, type GuidanceTopic } from "./policy-source";

export const assistanceOptions = [
  "A. Tôi đã làm được",
  "B. Vẫn còn lỗi",
  "C. Giải thích bước này",
  "D. Chuyển cho nhân viên hỗ trợ",
];
const steps: Record<GuidanceTopic, string[]> = {
  restart: [
    "Lưu tài liệu đang làm và đóng các ứng dụng sau khi lưu.",
    "Mở menu nguồn của hệ điều hành; chọn Shut down để tắt máy hoặc Restart để khởi động lại theo nhu cầu.",
    "Nếu đang cập nhật hệ thống, chờ cập nhật hoàn tất; không ngắt nguồn giữa chừng.",
  ],
  device: [
    "Chờ một lúc để máy hoàn tất tác vụ và kiểm tra đèn nguồn, cáp nguồn hoặc pin.",
    "Nếu máy còn phản hồi, lưu công việc đang mở và ghi lại tên ứng dụng gặp lỗi.",
    "Nếu vẫn treo hoặc có cảnh báo phần cứng, dừng thao tác và chuyển IT Helpdesk; không tháo máy hay factory reset.",
  ],
  vpn: [
    "Kiểm tra Internet bằng một trang nội bộ hoặc trang công khai tin cậy mà bạn thường dùng.",
    "Mở ứng dụng VPN chính thức đã được IT cung cấp và kiểm tra tên profile công ty.",
    "Ghi lại mã lỗi, thời điểm và hệ điều hành; không gửi mật khẩu, token hoặc mã MFA.",
    "Thử kết nối lại một lần; giữ nguyên MFA, firewall và các kiểm soát bảo mật.",
  ],
  wifi: [
    "Kiểm tra Wi-Fi đang bật và chọn đúng mạng được công ty cho phép.",
    "Kiểm tra thiết bị khác trên cùng mạng có gặp lỗi tương tự không.",
    "Ghi lại thông báo lỗi và chuyển IT nếu vẫn lỗi; không đổi proxy, DNS hoặc firewall.",
  ],
  software: [
    "Mở ứng dụng từ catalog chính thức đã được công ty phê duyệt.",
    "Kiểm tra hướng dẫn sử dụng và thông báo lỗi trong ứng dụng.",
    "Ghi lại phiên bản và hệ điều hành; không tải bản crack, plugin unsigned hoặc tự bỏ kiểm soát bảo mật.",
  ],
  account: [
    "Mở cổng đăng nhập hoặc self-service chính thức của công ty từ bookmark đã xác minh.",
    "Dùng chức năng quên mật khẩu hoặc hỗ trợ tài khoản của cổng chính thức; chỉ nhập dữ liệu trên cổng đó.",
    "Nếu xác minh danh tính hoặc MFA thất bại, chuyển IT; không gửi mật khẩu hay mã xác minh trong ticket.",
  ],
  peripherals: [
    "Kiểm tra nguồn và kết nối ngoài của thiết bị, không tháo vỏ hoặc chạm linh kiện bên trong.",
    "Kiểm tra đúng thiết bị đầu ra/đầu vào trong cài đặt người dùng.",
    "Ghi lại hiện tượng và liên hệ IT nếu vẫn lỗi; không tự cài driver không rõ nguồn.",
  ],
  general: [
    "Xác định ứng dụng và mục tiêu bạn muốn đạt được, không gửi thông tin xác thực.",
    "Tham khảo phần Help hoặc tài liệu đã được tổ chức phê duyệt.",
    "Nếu cần quyền mới, thao tác xóa dữ liệu hoặc thay đổi hệ thống, chuyển admin trước khi thực hiện.",
  ],
};

const specificSteps: Record<string, string[]> = {
  DEVICE_SHUTDOWN_GUIDANCE: [
    steps.restart[0],
    "Mở menu nguồn của hệ điều hành; chọn Shut down (Tắt máy). Chờ màn hình và đèn hoạt động tắt trước khi cất máy.",
    steps.restart[2],
  ],
  DEVICE_RESTART_GUIDANCE: [
    steps.restart[0],
    "Mở menu nguồn của hệ điều hành; chọn Restart (Khởi động lại), không chọn Reset. Máy sẽ khởi động lại; các tệp đã lưu không bị xóa.",
    steps.restart[2],
  ],
  ACCOUNT_LOGIN: [
    "Kiểm tra địa chỉ trang đăng nhập từ dấu trang công ty đã xác minh, tên tài khoản và trạng thái Caps Lock.",
    "Chỉ thử đăng nhập lại một lần trên cổng chính thức. Nếu báo tài khoản bị khóa hoặc xác minh thất bại, dừng thử để tránh khóa thêm.",
    "Ghi lại thông báo lỗi và chọn chuyển cho nhân viên hỗ trợ. Không gửi mật khẩu hoặc mã xác minh.",
  ],
  MFA_FAILURE: [
    "Kiểm tra giờ trên điện thoại có đúng không và ứng dụng xác thực có đang mở đúng tài khoản không.",
    "Thử xác minh lại một lần trên cổng công ty đã xác minh; không chấp thuận thông báo đăng nhập do người khác khởi tạo.",
    "Nếu mất thiết bị hoặc vẫn không xác minh được, chuyển cho nhân viên để xác nhận danh tính; không tắt xác thực hai bước.",
  ],
  DEVICE_AUDIO: [
    "Kiểm tra âm lượng và biểu tượng tắt tiếng trong ứng dụng đang dùng.",
    "Trong cài đặt âm thanh của người dùng, chọn đúng loa hoặc tai nghe đang kết nối; thử bằng âm thanh không chứa dữ liệu công việc.",
    "Nếu vẫn không nghe được, ghi lại ứng dụng và thiết bị đang dùng. Không tự cài trình điều khiển từ nguồn lạ.",
  ],
  DEVICE_DISPLAY: [
    "Kiểm tra màn hình đã bật và cáp bên ngoài đã cắm chắc; không tháo vỏ thiết bị.",
    "Kiểm tra màn hình đang chọn đúng nguồn vào theo dây kết nối. Nếu máy còn hiển thị, lưu công việc trước khi thử bước khác.",
    "Nếu màn hình vẫn đen hoặc có dấu hiệu hỏng, dừng thao tác và chuyển cho nhân viên hỗ trợ.",
  ],
  DATABASE_QUERY_HELP: [
    "Nêu kết quả muốn xem và tên bảng/cột giả lập; không gửi dữ liệu khách hàng hay thông tin đăng nhập.",
    "Xem tài liệu cú pháp truy vấn của hệ thống đang dùng. Có thể học với câu SELECT 1 trên môi trường học tập đã được phép, không chạy trên hệ thống thật.",
    "Nếu cần truy cập dữ liệu, sửa bảng hoặc thay dữ liệu, gửi yêu cầu riêng để xác minh phạm vi và quyền trước.",
  ],
};
const expected: Partial<Record<GuidanceTopic, string>> = {
  restart:
    "Máy tắt hoặc khởi động lại bình thường; các tệp đã lưu được giữ nguyên.",
  vpn: "VPN kết nối được, hoặc bạn có mã lỗi và thời điểm để nhân viên tiếp tục kiểm tra.",
  wifi: "Thiết bị truy cập được mạng được phép, hoặc xác định lỗi chỉ ở một máy hay nhiều máy.",
  account:
    "Đăng nhập hoặc tự khôi phục được tài khoản; nếu không, nhân viên tiếp nhận lỗi mà không cần mật khẩu.",
  peripherals:
    "Thiết bị hoạt động trở lại hoặc bạn có thông báo lỗi cụ thể để gửi hỗ trợ.",
};
const diagnosis: Partial<Record<GuidanceTopic, string>> = {
  device:
    "Máy có thể đang hết nguồn, bị treo tác vụ hoặc gặp cảnh báo phần cứng. Chưa đủ dữ kiện để kết luận nguyên nhân.",
  vpn:
    "Có thể là đường truyền, profile VPN hoặc xác thực. Cần kiểm tra theo thứ tự an toàn để khoanh vùng.",
  wifi:
    "Có thể là Wi-Fi đang tắt, chọn sai mạng hoặc lỗi chỉ xảy ra trên kết nối hiện tại. Cần so sánh an toàn trước khi kết luận.",
};

function printerGuidance(context: string) {
  // Evidence may mention a ruled-out or cleared jam while describing another fault.
  const activeSymptoms = context.replace(
    /\b(?:khong|chua|da het|het|no|not|without)\s+(?:(?:bi|bao|co|con|a|any|longer)\s+)*(?:ket giay|paper jams?|jammed)\b|\b(?:paper jams?|jam)\s+(?:is\s+)?(?:cleared|resolved)\b/g,
    "",
  );
  const jam = /\b(?:ket giay|paper jams?|jammed)\b/.test(activeSymptoms);
  const outOfPaper = /\b(?:het giay|out of paper|no paper|paper empty)\b/.test(activeSymptoms);
  const offline = /\boffline\b|ngoai tuyen/.test(context);
  const wrongPrinter = /chon nham|sai may in|wrong printer/.test(context);
  const readyToPrint = "Chỉ khi máy báo sẵn sàng và không còn cảnh báo kẹt giấy, chọn đúng máy in rồi thử một trang không chứa dữ liệu nhạy cảm. Nếu lỗi quay lại, dừng gửi lệnh in và nhờ nhân viên hỗ trợ.";
  const followUp = "Máy in thuộc hãng/model nào, đang hiển thị mã lỗi hoặc thông báo gì? Không gửi ảnh có tài liệu hay dữ liệu cá nhân.";
  if (jam) return {
    summary: "Máy in đang báo kẹt giấy. Hãy dừng gửi lệnh in mới và kiểm tra theo hướng dẫn đúng model trước khi thử in lại.",
    steps: [
      "Dừng gửi thêm lệnh in. Xem màn hình máy in và ghi lại vị trí kẹt giấy hoặc mã lỗi đang hiển thị.",
      "Xem hướng dẫn xử lý kẹt giấy trên màn hình hoặc tài liệu chính thức đúng hãng/model; chỉ tiếp cận phần dành cho người dùng khi hướng dẫn cho phép. Nếu chưa xác định được model hoặc vị trí kẹt, nhờ nhân viên hỗ trợ trước khi mở khay hay nắp.",
      "Không cố kéo giấy, dùng vật nhọn, tháo vỏ hoặc chạm phần có cảnh báo điện/nhiệt. Nếu giấy bị rách, nằm sâu hoặc không lấy ra dễ dàng theo hướng dẫn đúng model, dừng lại và nhờ nhân viên hỗ trợ.",
      readyToPrint,
    ],
    expectedResult: "Cảnh báo kẹt giấy hết và máy báo sẵn sàng trước khi thử in; nếu còn lỗi, nhân viên có hãng/model, vị trí kẹt và mã lỗi để tiếp tục.",
    nextQuestion: followUp,
  };
  return {
    summary: outOfPaper ? "Máy in báo hết giấy. Kiểm tra khay và loại giấy theo hướng dẫn đúng model."
      : offline ? "Máy in đang offline. Kiểm tra nguồn, kết nối bên ngoài và máy in đang chọn."
        : wrongPrinter ? "Kiểm tra lại máy in đang chọn trước khi gửi tài liệu."
          : "Kiểm tra trạng thái máy in và thông báo lỗi trước khi thử in.",
    steps: [
      outOfPaper
        ? "Xem màn hình để xác định khay hết giấy; nạp đúng loại và khổ giấy theo hướng dẫn của khay, không vượt vạch giới hạn. Không mở phần có cảnh báo điện hoặc nhiệt."
        : offline
          ? "Kiểm tra máy in có nguồn và kết nối bên ngoài có chắc không. Xem trạng thái trên màn hình; không đổi cấu hình mạng hoặc tự cài driver."
          : "Kiểm tra nguồn, giấy và thông báo trên màn hình. Nếu báo kẹt giấy, dừng gửi lệnh in và làm theo hướng dẫn đúng model trước.",
      "Trong hộp thoại In, đối chiếu tên máy in với nhãn thiết bị bạn định dùng và xem trước tài liệu. Không gửi lại tài liệu đến máy in không rõ vị trí.",
      readyToPrint,
    ],
    expectedResult: "Xác định được trạng thái máy in hoặc có thông báo lỗi cụ thể để nhân viên hỗ trợ tiếp tục kiểm tra.",
    nextQuestion: followUp,
  };
}
export function guidanceTemplate(
  request: CanonicalRequest,
  round = 0,
): Omit<Assistance, "source" | "timestamp"> {
  const rule = guidanceRules.find((item) =>
    item.labels.some((label) => label === request.intentLabel),
  );
  const topic = rule?.topic ?? "general";
  const context = normalize(
    request.evidence.map((item) => item.quote).join(" "),
  );
  const platform = /windows/.test(context)
    ? "Windows"
    : /macos|macbook|mac os/.test(context)
      ? "macOS"
      : "";
  const vpnTimeout =
    topic === "vpn" && /timeout|timed out|het thoi gian/.test(context);
  const vpnDisconnect = topic === "vpn" && (faqTopic(context) === "vpn:disconnect" || /ngat ket noi|rot ket noi|disconnect|drops? connection/.test(context));
  const printer = request.intentLabel === "DEVICE_PRINTER" ? printerGuidance(context) : undefined;
  const guideSteps = printer?.steps ?? specificSteps[request.intentLabel] ?? steps[topic];
  const summary = printer?.summary ?? (vpnTimeout
    ? "VPN hết thời gian chờ kết nối. Hãy kiểm tra đường truyền trước, rồi thử lại một lần."
    : vpnDisconnect
      ? "VPN liên tục ngắt kết nối. Hãy kiểm tra Internet và ghi lại thời điểm mất kết nối; giữ nguyên các cài đặt bảo mật."
    : topic === "vpn"
      ? `Hãy kiểm tra kết nối VPN${platform ? ` trên ${platform}` : ""} từ Internet đến ứng dụng, không thay cài đặt bảo mật.`
      : request.intentLabel === "DEVICE_SHUTDOWN_GUIDANCE"
        ? "Bạn có thể tắt máy sau khi lưu công việc và chờ các cập nhật đang chạy hoàn tất."
        : request.intentLabel === "DEVICE_RESTART_GUIDANCE"
          ? "Khởi động lại có thể giúp máy hoạt động bình thường; lưu công việc trước để tránh mất phần chưa lưu."
          : intentName(request.intentLabel));
  return {
    summary,
    ...(diagnosis[topic] ? { diagnosis: diagnosis[topic] } : {}),
    ...(diagnosis[topic]
      ? {
          potentialFixes:
            round > 0
              ? [
                  "Dừng lặp lại bước vừa thử nếu kết quả không thay đổi; giữ nguyên cài đặt bảo mật và công việc đang mở.",
                  "Ghi lại bước đã thử, thông báo lỗi và thời điểm xảy ra; loại bỏ mật khẩu và mã xác minh.",
                  "Nếu không thể tiếp tục an toàn, chuyển cho nhân viên hỗ trợ cùng lịch sử này.",
                ]
              : [...guideSteps],
        }
      : {}),
    stepByStepInstructions:
      round > 0
        ? [
            "Dừng lặp lại bước vừa thử nếu kết quả không thay đổi; giữ nguyên cài đặt bảo mật và công việc đang mở.",
            "Ghi lại bước đã thử, thông báo lỗi và thời điểm xảy ra; loại bỏ mật khẩu và mã xác minh.",
            "Nếu không rõ thông báo hoặc không thể tiếp tục an toàn, chọn chuyển cho nhân viên hỗ trợ cùng lịch sử này.",
          ]
        : [...guideSteps],
    options: [...assistanceOptions],
    expectedResult:
      printer?.expectedResult ?? expected[topic] ??
      "Có thể xác định bước tiếp theo phù hợp với nhu cầu; nếu chưa, chuyển cho nhân viên hỗ trợ.",
    warning:
      "Không gửi mật khẩu hoặc mã xác minh. Dừng lại nếu thấy yêu cầu xóa dữ liệu hoặc tắt bảo vệ thiết bị.",
    nextQuestion:
      printer?.nextQuestion ?? (topic === "vpn"
        ? vpnDisconnect
          ? "VPN ngắt sau khoảng bao lâu, trên hệ điều hành nào và có mã lỗi gì? Internet có mất kết nối cùng lúc không?"
          : "VPN đã kết nối được chưa? Nếu chưa, thông báo hoặc mã lỗi hiện tại là gì?"
        : topic === "account"
          ? "Bạn thấy thông báo sai mật khẩu, tài khoản bị khóa hay lỗi xác minh?"
          : "Sau bước vừa thử, hiện tượng đã thay đổi như thế nào?"),
    canPassToAdmin: true,
  };
}

export function explainStep(step: string): string {
  if (/menu nguồn/.test(step))
    return "Sau khi lưu công việc, trên Windows mở Start → Power, trên macOS mở menu Apple. Chọn Restart để khởi động lại hoặc Shut down để tắt máy; không chọn Reset/Erase. Máy sẽ tắt hoặc khởi động lại; nếu đang cập nhật hãy chờ.";
  if (/Lưu tài liệu|lưu công việc/.test(step))
    return "Mở từng tài liệu đang làm, chọn Tệp → Lưu và chờ lưu xong. Nếu ứng dụng đang treo hoặc bạn không chắc tài liệu đã được lưu, dừng tại đây và nhờ nhân viên hỗ trợ.";
  if (/Kiểm tra Internet/.test(step))
    return "Mở trình duyệt và truy cập trang bạn thường dùng. Nếu trang cũng không mở, vấn đề có thể ở kết nối mạng. Chỉ ghi lại hiện tượng; chưa thay cấu hình mạng.";
  if (/ứng dụng VPN/.test(step))
    return "Mở ứng dụng VPN công ty đã cài trên máy. Xem tên kết nối đang chọn có đúng tên công ty không. Nếu không thấy hoặc không biết tên đúng, đừng tạo kết nối mới; chọn chuyển cho nhân viên hỗ trợ.";
  if (/Ghi lại|Ghi lại|ghi lại/.test(step))
    return "Chép phần thông báo lỗi và thời điểm xảy ra vào phần bổ sung. Bỏ mật khẩu, mã xác minh và thông tin khách hàng. Thông báo này giúp nhân viên xác định bước xử lý tiếp theo.";
  if (/kết nối lại/.test(step))
    return "Trong ứng dụng VPN, bấm kết nối thêm một lần. Nếu vẫn lỗi, ghi lại thông báo và chọn chuyển cho nhân viên. Không tắt xác thực hai bước hoặc tường lửa để thử.";
  return `Chỉ thực hiện bước sau khi bạn nhận ra đúng nút hoặc thiết bị: ${step} Nếu không thấy đúng mục hoặc chưa hiểu, dừng lại và chọn chuyển cho nhân viên hỗ trợ.`;
}
