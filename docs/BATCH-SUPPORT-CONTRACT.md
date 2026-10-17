# Hỗ trợ theo nhóm và gợi ý reviewer

Base: `13edf8034df44decabf41b86da7fe1c89e1a9c33`. AI-assisted implementation.

- Gợi ý tin nhắn: reviewer chủ động gọi model đang cấu hình, nhận ba bản nháp,
  chọn/sửa rồi mới thực hiện thao tác. Model không quyết định trạng thái hoặc quyền.
  Phiên bản hồ sơ được kiểm tra trước và sau inference. Lỗi model dùng mẫu server,
  hiển thị đúng nguồn; không tự gửi phản hồi.
  Câu văn hướng trực tiếp tới người gửi (bạn/mình), không mệnh lệnh rời rạc.
  Khi xác nhận thao tác, nội dung đã redact nằm trong `AuditEvent.senderMessage`,
  cùng atomic write với quyết định. UI hiển thị toàn bộ lịch sử; hồ sơ cũ dùng
  explanation của action reviewer tương ứng. Không suy ra tin đã đọc hoặc gửi email.
  Hợp đồng cố định QUESTION/ANSWER/ANSWER: một hỏi bổ sung, hai giải đáp theo
  đúng câu hỏi gốc/lịch sử đã redact. Luna trả **cả ba tin nhắn đầy đủ** qua
  Structured Outputs strict; server không ghép thêm hay sửa âm thầm kết quả.
  Hai giải đáp phải giữ từng đoạn hướng dẫn/điều kiện dừng đã duyệt trên dòng
  riêng, đầy đủ và đúng thứ tự; phần viết thêm không được thêm thao tác, lệnh,
  thông tin xác thực, tự cấp quyền hoặc tuyên bố đã xử lý. Đoạn nhắc rủi ro thuộc
  policy được đối chiếu nguyên văn, không coi đó là lệnh thực hiện rủi ro.
  Model chọn `evidenceIds` từ danh mục server; API trả `evidence` chứa nguyên
  văn nguồn tương ứng. Không chấp nhận tên thuộc tính JSON hoặc quote tự viết
  làm dẫn chứng. `knownFacts` giúp tránh hỏi lại dữ kiện đã có, nhưng reviewer
  vẫn cần đọc/sửa câu hỏi trước khi gửi.
  Một lượt inference, deadline tối đa 12 giây, đầu ra tối đa 2.200 token để đủ
  ba tin nhắn; không tăng hạn mức lượt gọi hoặc retry. Giới hạn 2.000 ký tự mỗi
  tin nhắn vẫn giữ nguyên. API trả attempts/latency và mã fallback đã lọc:
  schema, nguồn, thiếu bước, nội dung không an toàn, văn phong hoặc lỗi provider.
  Fallback không gắn nhãn OpenAI. Ba câu hỏi thay vì hai giải đáp bị từ chối.
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
- Phiên khách: lựa chọn ngẫu nhiên trong chín phòng ban, loại trừ phòng ban của
  lần vào trước; sessionStorage giữ ngữ cảnh UI trong tab, fallback bộ nhớ nếu
  storage bị chặn. Đây không phải runtime account/identity. Metadata
  `input.guestDepartment` enum tách khỏi employeeId/department đã xác minh,
  chỉ chấp nhận trong requesterMode=guest, không truyền vào extraction model
  hoặc kiểm tra entitlement. Hồ sơ support lưu ngữ cảnh theo storage hiện hành;
  nhân viên và người gửi đều thấy nhãn giả lập. Không tạo tài khoản Mongo mới.
- Cache: chỉ câu hỏi chung thuộc danh mục đóng, sau khi policy hiện tại đã được
  đánh giá. Không dùng độ giống nhau để tái sử dụng quyền/approval/quota. Mức 80%
  là ngưỡng từ vựng, không phải xác suất hai sự cố giống nhau. Không cache secrets,
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
  doanh nghiệp. Rate limit giữ nguyên; cache không phải bảo vệ DDoS.
- Sentiment: quan sát cảm xúc riêng với mức cần hỗ trợ. Không suy diễn “gian dối”
  hoặc “genuine” từ câu chữ. Cảm xúc đơn thuần không đổi trạng thái/ưu tiên.
  Giữ yêu cầu chuyển người rõ ràng và kiểm tra rủi ro trước sentiment.
