export const GUIDE_SESSION_PREFIX = "vng-guide-v1:";
export type GuideRole = "sender" | "reviewer";
export type GuideStep = {
  target: string;
  title: string;
  text: string;
  advanceOn?: "click" | "change" | "input";
};
export const guideStages: Record<string, { role: GuideRole; steps: GuideStep[] }> = {
  "sender-form": {
    role: "sender",
    steps: [
      { target: "sender-mode", title: "1. Chọn cách gửi", text: "Bấm “Mô tả vấn đề” để viết tự do, hoặc “Chọn theo danh mục” để chọn nhu cầu cụ thể.", advanceOn: "click" },
      { target: "sender-department", title: "Chọn phòng ban", text: "Chọn phòng ban và nhập mã nhân viên bắt buộc để liên kết, tra cứu yêu cầu. Mã khai báo chưa xác thực danh tính; khi thử nghiệm chỉ dùng dữ liệu minh họa.", advanceOn: "change" },
      { target: "sender-group", title: "2. Chọn nhóm hỗ trợ", text: "Chọn nhóm phù hợp. Chưa rõ thì giữ “Tôi chưa biết nhóm nào” và bấm Tiếp theo.", advanceOn: "change" },
      { target: "sender-intent", title: "3. Chọn nhu cầu", text: "Chọn việc cần hỗ trợ rồi điền các ô xuất hiện bên dưới. Chỉ nhập dữ liệu minh họa, không nhập mật khẩu.", advanceOn: "change" },
      { target: "sender-fields", title: "Điền thông tin theo danh mục", text: "Điền các ô bạn biết trong khung được chỉ. Không cần bịa thông tin còn thiếu. Khi xong, bấm Tiếp theo để thêm mô tả hoặc gửi yêu cầu." },
      { target: "sender-description", title: "4. Mô tả tình huống", text: "Bấm vào ô và nhập vấn đề. Ví dụ: “VPN không kết nối”. Bạn có thể tiếp tục gõ sau khi mũi tên chuyển sang nút Gửi.", advanceOn: "input" },
      { target: "sender-send", title: "5. Gửi để xem phản hồi", text: "Viết xong, bấm Gửi. Trợ lý sẽ trả lời hoặc hiển thị thông tin cần xác nhận; hồ sơ chỉ được lưu ở bước tiếp theo." },
    ],
  },
  "sender-preview": {
    role: "sender",
    steps: [
      { target: "sender-preview", title: "Kiểm tra phản hồi", text: "Đọc thông tin đã hiểu, hướng dẫn và những mục còn thiếu. Nếu chưa đúng, bấm Quay lại sửa. Bấm Tiếp theo để xem cách lưu hồ sơ." },
      { target: "sender-confirm", title: "Xác nhận hoặc lưu hội thoại", text: "Bấm nút này để lưu yêu cầu. Bạn sẽ được đưa đến trang theo dõi, có phản hồi và lịch sử riêng." },
    ],
  },
  "sender-result": {
    role: "sender",
    steps: [
      { target: "sender-result", title: "Theo dõi kết quả", text: "Xem trạng thái và phản hồi. Nếu cần bổ sung, trả lời đúng mục được hỏi. Nếu đang chờ nhân viên, theo dõi cập nhật tại liên kết này." },
      { target: "sender-feedback", title: "Thử các lựa chọn hỗ trợ", text: "A: đã giải quyết. B: vẫn lỗi. C: giải thích một bước. D: chuyển nhân viên. Chỉ bấm lựa chọn đúng với kết quả bạn muốn kiểm tra.", advanceOn: "click" },
      { target: "sender-followup", title: "Tiếp tục hỏi hoặc bổ sung", text: "Nhập câu hỏi tiếp theo hoặc thông tin còn thiếu rồi bấm nút gửi bên dưới. Mỗi lần gửi đều được kiểm tra lại.", advanceOn: "input" },
      { target: "sender-followup-send", title: "Gửi nội dung tiếp theo", text: "Bấm để gửi câu hỏi hoặc phần bổ sung. Nếu có lỗi, nội dung vẫn được giữ để bạn sửa và thử lại.", advanceOn: "click" },
      { target: "sender-history", title: "Xem lại toàn bộ quá trình", text: "Bấm mở lịch sử để xem hướng dẫn và các lần xử lý. Bạn đã biết luồng người gửi; có thể về trang đầu để thử vai trò nhân viên.", advanceOn: "click" },
    ],
  },
  "reviewer-list": {
    role: "reviewer",
    steps: [
      { target: "reviewer-filters", title: "1. Tìm yêu cầu cần xử lý", text: "Dùng bộ lọc trạng thái và nguồn. Tra chính xác mã nhân viên bằng ô riêng; dùng ô nội dung để tìm mã yêu cầu hoặc nội dung ticket. Mục chờ xử lý gồm yêu cầu cần người phụ trách xem xét.", advanceOn: "change" },
      { target: "reviewer-list", title: "2. Mở một hồ sơ", text: "Bấm một yêu cầu để xem chi tiết. Nếu danh sách trống, bấm Tạo yêu cầu demo, gửi một tình huống rồi quay lại đây.", advanceOn: "click" },
    ],
  },
  "reviewer-detail": {
    role: "reviewer",
    steps: [
      { target: "reviewer-evidence", title: "3. Đọc bằng chứng trước", text: "Đối chiếu nội dung, quyết định, rủi ro và thông tin còn thiếu. Mở phần quy tắc để xem lý do hệ thống xử lý như vậy." },
      { target: "reviewer-reason", title: "4. Nhập lý do", text: "Bấm vào ô và viết lý do cụ thể, tối thiểu 8 ký tự. Lý do sẽ được ghi lại cùng quyết định.", advanceOn: "input" },
      { target: "reviewer-actions", title: "5. Chọn quyết định phù hợp", text: "Có thể hỏi thêm, từ chối, dừng hoặc duyệt khi được phép. Nút bị mờ là thao tác chưa đủ điều kiện. Điều chỉnh quyết định cần chọn trạng thái đích trước.", advanceOn: "click" },
      { target: "reviewer-history", title: "6. Kiểm tra nhật ký", text: "Xem trạng thái mới, người thao tác và lý do vừa ghi. Hướng dẫn không tự duyệt hay gửi quyết định thay bạn." },
    ],
  },
};
