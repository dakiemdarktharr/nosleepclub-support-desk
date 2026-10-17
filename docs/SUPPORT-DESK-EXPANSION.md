# Support Desk: IT, Commercial và HR

## Hợp đồng

- Giao diện xử lý có đúng ba tab: **Ban IT**, **Ban Commercial**, **Ban HR**. Các chuyên môn được ánh xạ nội bộ, không tạo thêm tab.
- IT gồm hỗ trợ thiết bị/tài khoản, engineering, DevOps, cloud, nền tảng dữ liệu, mạng và an ninh mạng. Commercial gồm tài chính, mua sắm, pháp chế, kinh doanh, marketing, CSKH, sản phẩm/dự án và phân tích kinh doanh. HR gồm nhân sự, lương/phúc lợi, đào tạo, hành chính, cơ sở vật chất, công tác/sự kiện và an toàn nơi làm việc.
- Luna trích xuất intent theo catalog; server validate bằng chứng, đánh giá policy và ánh xạ `decision.division`. Phòng ban người gửi và yêu cầu “chuyển ban” không cấp thẩm quyền hay ghi đè định tuyến.
- Tab dùng query `division` được kiểm tra ở server, áp dụng trước phân trang/gộp nhóm. Hồ sơ cũ không có division được đọc theo service group, không migration hoặc sửa lịch sử.
- Hỏi quy trình có thể nhận hướng dẫn chuẩn bị an toàn. Nghỉ phép, thanh toán, hợp đồng, quyền lợi và thay đổi dữ liệu cần người phụ trách. Không bịa chính sách VNG, số ngày phép, hạn mức, SLA hoặc hành động bên ngoài.
- Vấn đề riêng tư và nguy hiểm vật lý đã nhận diện không gửi sang model bên ngoài. Câu hỏi chính sách giữ giới hạn nguồn đã xác minh; hướng dẫn không xác nhận quyền lợi.
- Nhiều yêu cầu thuộc các ban khác nhau cần tách/làm rõ; rủi ro bảo mật kỹ thuật vẫn ưu tiên Ban IT. Cache không chia sẻ hồ sơ nhân sự, thương mại hoặc dữ liệu cá nhân.
- Tab là điều phối trong demo, **không phải RBAC hoặc bằng chứng đã thông báo cho chuyên viên**. Phiên ID-only/reviewer công khai chưa phù hợp dữ liệu thật.

## Kiểm chứng

Bộ **Support Desk expansion** trong Kiểm thử dùng dữ liệu giả lập; kiểm tra action, bucket, division, chất lượng phản hồi và đọc lại ticket/audit/queue. Unit/integration kiểm tra thêm intent trong mọi chuyên môn, HTTP model giả lập, field giả mạo, câu mục đích thương mại trong tác vụ kỹ thuật, lọc Mongo/memory, xử lý đồng thời và UI desktop/mobile. Giữ nguyên nhãn Ground Truth cũ và hash dataset đã đóng băng.

Regression development 128 giữ nguyên kỳ vọng của policy v5.20: 128/128 action đúng, 126/128 khớp cả action, bucket và rule. Hai ca `e128-authority-15/16` vẫn `ESCALATE / BEYOND_AUTHORITY`, nhưng đã có owner nghiệp vụ nên dùng `COMPANY-TRAVEL_EVENTS-REVIEW` và `COMPANY-FINANCE_ACCOUNTING-REVIEW` thay cho rule owner chưa xác định `AUTH-005`. Ghi nhận chênh lệch rule; không sửa dataset để biến thành 128 exact PASS. Đây là mock/synthetic, không phải accuracy của Luna thật.

## Đánh giá điều hành trước sửa

Kết luận: **Not ready** cho dữ liệu doanh nghiệp thật. CI xanh chứng minh regression local tương đương, không chứng minh readiness production.

| Mức | Phê bình | Xử lý / bằng chứng cần có |
| --- | --- | --- |
| P0 | Reviewer công khai và ID-only cho phép người biết ID vào demo; tab không cô lập dữ liệu theo quyền. | Giữ giới hạn demo; chặn API khi chọn môi trường production chưa có xác thực tổ chức. SSO, quyền chuyên viên theo ban và thu hồi phiên cần tích hợp tổ chức thực tế trước pilot dữ liệu thật. |
| P0 | Áp rule kỹ thuật vào lương, tiền và hợp đồng có thể tạo quyết định sai thẩm quyền. | Policy công ty có rule ID, chỉ hướng dẫn chuẩn bị hoặc chuyển owner; không thực thi nghiệp vụ. |
| P0 | Nội dung cá nhân có thể bị đưa vào model hoặc cache dùng chung. | Bypass model cho nhóm riêng tư đã xác định; mở rộng redaction; cấm cache/gộp trả lời các nhóm này. Không tuyên bố regex ẩn danh được mọi PII. |
| P1 | Ghép từ khóa nghiệp vụ có thể đánh cắp yêu cầu hạ tầng có cùng từ trong mục đích. | Giữ precedence cho thao tác kỹ thuật, test lại corpus cũ và ca đối chứng. |
| P1 | Tab chỉ lọc trên browser sẽ sai số tổng/trang hoặc lộ nhóm khác. | Filter server từ truy vấn Mongo, xử lý hồ sơ legacy, chống response cũ và giữ danh sách khi bấm lại tab đang chọn. |
| P1 | Gom nhóm đọc toàn bộ lịch sử không có giới hạn tải. | Giới hạn dữ liệu gom nhóm và báo rõ khi cần chuyển danh sách phân trang; không trả kết quả bị cắt mà giả là đầy đủ. |
| P1 | Nhánh main chưa có bảo vệ bắt buộc CI/review. | Bằng chứng GitHub hiện trả “Branch not protected”. Chưa tự đổi thiết lập repo vì người dùng yêu cầu push trực tiếp main. Cần chủ repo quyết định governance trước release thật. |
| P1 | Chưa có bằng chứng mới về Mongo restart/restore, quyền dữ liệu, tải nhiều instance, cảnh báo vận hành hoặc SLA tổ chức. | Không suy từ mock/CI. Cần môi trường có quyền, nguồn policy thật và kiểm chứng vận hành trước go-live. |

Thay đổi có AI assistance bằng Codex. Author Git theo tài khoản chủ repo không chứng minh human authorship hoặc human review. Không đổi cấu hình deployment, quyền cloud, dữ liệu Production hay quyền GitHub.
