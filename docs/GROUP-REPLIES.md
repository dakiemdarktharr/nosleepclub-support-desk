# Trả lời chung cho nhóm yêu cầu

Base triển khai: `14de9b1`. AI assistance: OpenAI Codex.

## Hành vi

- Hàng đợi mặc định gộp các yêu cầu đang mở cùng vấn đề thành một dòng, ví dụ **7 yêu cầu về lỗi kết nối VPN**.
- Bấm vào nhóm để xem đầy đủ nội dung và mã HT của từng yêu cầu. Mỗi mã mở hồ sơ riêng với các thao tác xử lý hiện có.
- Admin nhập **Trả lời chung**, bấm **Gửi cho 7 yêu cầu**. Mỗi người nhận được tin nhắn ở trang theo dõi của chính mình, kể cả khi tải lại trang.
- Gửi tin nhắn giữ nguyên trạng thái và quyết định policy của từng hồ sơ. Muốn duyệt, từ chối hay đóng một yêu cầu, admin mở hồ sơ riêng.
- Bỏ chọn **Gộp yêu cầu cùng vấn đề** để xem hàng đợi từng hồ sơ.

## Nhóm và tra cứu

Nhận diện lại nội dung hiện tại bằng cùng bộ nhận diện FAQ đóng dùng cho cache: VPN không kết nối, VPN ngắt kết nối, Wi-Fi không kết nối và máy in offline. Sự cố mạng/điện đã được liên kết theo khu vực dùng chung mã sự cố. Không gộp yêu cầu truy cập, nội dung riêng tư, nhiều vấn đề, rủi ro, phạm vi tài nguyên cụ thể hoặc lỗi phân tích. Trạng thái, phiên bản policy, hàng đợi và nơi nhận phải khớp. Verify được tách theo từng lượt chạy.

Server đọc các trường phục vụ phân nhóm của hồ sơ hiện có, gộp trước khi phân trang. Tìm kiếm khớp một thành viên sẽ hiển thị toàn bộ nhóm, cùng số lượng và danh sách người nhận khi mở. Không giới hạn nhóm ở 30 hoặc 200 hồ sơ đầu. Bộ kiểm thử cache lưu hồ sơ của các câu đã chạy để mở và trả lời chung tại đây, nguồn Case Verify và tách theo từng lượt chạy. [Cách mở kết quả mới và cũ](TEST-CACHE-SYSTEM.md). Cách hiện tại đọc các bản ghi rút gọn để hỗ trợ hồ sơ cũ, cần đo và chuyển sang chỉ mục nhóm khi dữ liệu tăng lớn.

## Hợp đồng gửi

`GET /api/review/groups/:id` trả tiêu đề, danh sách thành viên, dấu kiểm tra `membership` từ ID/phiên bản của từng thành viên và lịch sử trả lời chung.

`POST /api/review/groups/:id` nhận `sendId` UUID, `membership` và `text` từ 1 đến 2.000 ký tự. Server tự tìm người nhận, kiểm tra lại nhóm, che thông tin nhạy cảm và áp dụng guard reviewer/rate limit hiện có. Không nhận danh sách người nhận từ client.

Nhóm thay đổi trước lúc kiểm tra gửi trả về 409. Giao diện giữ nội dung, tải lại thành viên và yêu cầu admin bấm gửi lại. Danh sách người nhận được chốt tại lần kiểm tra này. Thành viên đến sau không nhận tin cũ. Người đã nhận vẫn xem được lịch sử sau khi đóng hồ sơ hoặc đổi nội dung.

Tin nhắn, actor, thời điểm, dấu kiểm tra nội dung, redaction và danh sách ID/phiên bản người nhận được lưu nguyên tử trong một document `v3_support_group_replies`. Mỗi hồ sơ đọc tin nhắn qua chỉ mục người nhận, không có quá trình ghi lần lượt dễ bỏ sót. API của người gửi chỉ trả nội dung/thời điểm/mã tin nhắn của họ, không trả danh sách thành viên khác. Lịch sử gửi chung nằm trong nhóm và hiển thị trong hồ sơ riêng, không giả làm thao tác thay đổi trạng thái trong audit policy.

Thử lại cùng `sendId` và nội dung trả về kết quả đã lưu, kể cả khi nhóm đã thay đổi. Dùng lại mã gửi với nội dung khác trả về 409. Lỗi Mongo không chuyển sang bộ nhớ tạm. Bộ nhớ tạm chỉ dùng trong môi trường local đã cấu hình.

## Kiểm chứng

Unit/integration: `tests/group-replies.test.ts` kiểm tra nhóm đủ 7 câu, nhóm vượt trang đầu, tìm theo HT, tách triệu chứng/rủi ro/Verify, danh sách thay đổi, gửi đồng thời/thử lại, người đến sau, redaction, guard API, polling và trạng thái riêng.

E2E: `tests/e2e/group-replies.spec.ts` thao tác hàng đợi, mở nhóm, nhập trả lời, mô phỏng mất phản hồi mạng sau khi lưu, thử lại, kiểm tra cả 7 hồ sơ và cập nhật nhóm lên 8 người. Chạy trên desktop/mobile với dữ liệu giả lập, model mock và memory-demo. Không phải thử nghiệm trên nhân viên thật hoặc kiểm chứng Mongo production.

### Kết quả local ngày 17/10/2026

- Vitest toàn bộ: 1.647 đạt, 1 bỏ qua theo cấu hình. Bộ nhóm mới có 12 ca, gồm nhánh Mongo với adapter giả lập.
- Node script tests: 38 đạt. Kiểm tra restart Mongo thật bỏ qua vì chưa có URI/ack cho database thử nghiệm độc lập.
- Typecheck, lint, production build, kiểm tra liên kết tài liệu và `git diff --check`: đạt.
- Desktop: 121 ca E2E cũ đạt. Ca nhóm mới đạt ở lượt chạy lại sau khi sửa selector kiểm thử để không chọn nhầm vùng thông báo điều hướng của Next.js.
- Mobile: 20 ca hồi quy liên quan đạt. Ca nhóm mới đạt sau cùng sửa selector trên. Đã xem ảnh desktop/mobile, không tràn ngang.
- Lượt E2E ban đầu dùng dev server gặp timeout khi biên dịch trang. Kết quả E2E nêu trên dùng production build, không tăng timeout của các ca cũ để bỏ qua lỗi.

Diff gồm phân nhóm ở server trước phân trang, API lưu/gửi/đọc tin nhắn chung, trang nhóm trong hàng đợi, hiển thị và đồng bộ phản hồi trên hồ sơ riêng, kiểm thử và tài liệu. Không sửa Ground Truth hoặc dữ liệu production.
