# Hỗ trợ theo nhóm và gợi ý reviewer

Base: `13edf8034df44decabf41b86da7fe1c89e1a9c33`. AI-assisted implementation.

- Gợi ý tin nhắn: tự gọi model đang cấu hình khi mở hồ sơ, nhận hai phương án xử lý,
  chọn/sửa rồi mới thực hiện thao tác. Model không quyết định trạng thái hoặc quyền.
  Phiên bản hồ sơ được kiểm tra trước và sau inference. Lỗi model dùng mẫu server,
  hiển thị đúng nguồn; không tự gửi phản hồi.
  Câu văn hướng trực tiếp tới người gửi (bạn/mình), không mệnh lệnh rời rạc.
  Khi xác nhận thao tác, nội dung đã redact nằm trong `AuditEvent.senderMessage`,
  cùng atomic write với quyết định. UI hiển thị toàn bộ lịch sử; hồ sơ cũ dùng
  explanation của action reviewer tương ứng. Không suy ra tin đã đọc hoặc gửi email.
  Hợp đồng cố định ANSWER/ANSWER: hai giải đáp theo câu hỏi gốc/lịch sử đã redact.
  Hỏi bổ sung có endpoint riêng, soạn ngắn trước khi xác nhận gửi. Luna trả nguyên hai tin nhắn đầy đủ; server validate tất cả bước, kết quả cần kiểm tra và cảnh báo theo thứ tự. Không ghép nội dung thêm vào đầu ra model. Giới hạn
  tin nhắn 2.000 ký tự dùng chung server/UI; bản nháp hỏi bổ sung tối đa 500 ký tự.
  Gợi ý trả lời dạng câu hỏi bị từ chối. [Hợp đồng cập nhật](GUEST-REVIEW-CACHE.md).
- Verify: tiến độ xác định từ số response case đã lưu, tính cả PASS/FAIL.
  Khởi tạo/đọc lại là trạng thái chờ, không fake ETA. Transform easing bằng CSS,
  hỗ trợ prefers-reduced-motion, không thêm thư viện. Tham khảo hình thức từ
  [Motion loading progress bar](https://motion.dev/examples/react-loading-progress-bar);
  không dùng mã nguồn Motion+ trả phí.
- Theo dõi tự động: lọc cả hồ sơ từng AUTO_APPROVED, kể cả sau khi chuyển người/
  hoàn tất. Giữ lịch sử và khả năng điều chỉnh theo guard hiện có.
- Danh tính: giữ 40 ID và các scope hiện có; bổ sung phòng ban vào manifest giả lập
  và Mongo qua migration tường minh, có transaction/audit. Không dùng manifest làm
  tài khoản runtime; phòng ban không tự cấp quyền.
- Phiên khách: lựa chọn ngẫu nhiên trong sáu phòng ban, loại trừ phòng ban của
  lần vào trước; sessionStorage giữ ngữ cảnh UI trong tab, fallback bộ nhớ nếu
  storage bị chặn. Đây không phải runtime account/identity. Metadata
  `input.guestDepartment` enum tách khỏi employeeId/department đã xác minh,
  chỉ chấp nhận trong requesterMode=guest, không truyền vào extraction model
  hoặc kiểm tra entitlement. Hồ sơ support lưu ngữ cảnh theo storage hiện hành;
  nhãn giả lập còn trong hồ sơ chi tiết; thông báo đầu form đã được bỏ. Không tạo tài khoản Mongo mới.
  UUID yêu cầu đã gửi lưu riêng trong localStorage, không mất khi đổi vai trò/phòng ban;
  danh sách tải trạng thái hiện tại từ server, không cache trạng thái trong trình duyệt.
- Cache: chỉ câu hỏi chung thuộc danh mục đóng, sau khi policy hiện tại đã được
  đánh giá. Không dùng độ giống nhau để tái sử dụng quyền/approval/quota. Nhận diện
  cùng đối tượng/triệu chứng qua grammar đóng; điểm trùng từ chỉ để quan sát, không
  phải xác suất cùng ý hoặc ngưỡng quyết định hit. [Bộ kiểm thử mới](TEST-CACHE-SYSTEM.md). Không cache secrets,
  câu có dữ liệu riêng, yêu cầu rủi ro hoặc Verify/fault injection.
- FAQ an toàn lưu tối đa 7 ngày, invalidation bằng phiên bản policy/template.
  Sự cố mạng/điện chỉ gộp khi người gửi chọn rõ khu vực và cùng loại sự cố,
  trong cửa sổ 24 giờ tính từ lúc tạo nhóm. Không gia hạn theo mỗi lượt gửi.
  Mỗi người giữ hồ sơ riêng. Cập nhật chung chỉ là thông tin công khai cho nhóm,
  không chia sẻ danh sách người gửi hay hồ sơ khác, không tự đóng các hồ sơ.
- Mongo là nguồn nhóm/cập nhật; read kiểm tra hạn dùng, không chỉ dựa TTL cleanup.
  Không có Mongo Production thì không báo đã lưu nhóm/cập nhật.
  Memory chỉ dành môi trường hỗ trợ local đã cho phép.
- Người gửi nhận cập nhật ở màn hình theo dõi qua polling; không tuyên bố gửi
  email/push notification. Reviewer demo công khai vẫn không phải phân quyền
  doanh nghiệp. Rate limit intake/mutation giữ nguyên; bộ kiểm thử cache biệt lập có
  scope 60 case/phút/client. Cache không phải bảo vệ DDoS.
- Sentiment: quan sát cảm xúc riêng với mức cần hỗ trợ. Không suy diễn “gian dối”
  hoặc “genuine” từ câu chữ. Cảm xúc đơn thuần không đổi trạng thái/ưu tiên.
  Giữ yêu cầu chuyển người rõ ràng và kiểm tra rủi ro trước sentiment. Rule HANDOFF-002 chuyển người khi có hai lượt báo còn vướng kèm thất vọng, hoặc ba lượt còn vướng dù trung tính; số lượt dựa trên phản hồi sau hướng dẫn trong cùng chủ đề. [Chi tiết](INTERACTION-HANDOFF.md).
