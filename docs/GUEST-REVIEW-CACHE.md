# Gợi ý xử lý, theo dõi khách và kiểm thử cache

Base: `cbedebf96a17dd81ed81431e16e6a62c8d8d186f` từ GitHub `main`. Thay đổi có AI assistance; Git identity không chứng minh human authorship/review. Phạm vi là giao diện reviewer, tin nhắn bổ sung, lịch sử khách và kiểm chứng cache/Verify. Không thay Ground Truth hoặc policy cấp quyền.

## Hợp đồng mới

- Khi mở hồ sơ hoặc đổi version, tự tạo đúng **hai phương án trả lời xử lý**. Cả hai giữ toàn bộ bước đã rà soát, kết quả cần kiểm tra và điều kiện dừng. Luna soạn toàn bộ hai tin nhắn; server validate các bước, cách kiểm tra và cảnh báo bắt buộc, rồi trả nguyên văn. Thiếu dữ kiện/quyền thì nói rõ giới hạn, không hứa chắc chắn đã khắc phục.
- Bấm **Hỏi thêm thông tin** gọi `/api/review/:id/information` với version, tạo một tin nhắn 1–2 câu, tối đa 500 ký tự, nêu các dữ kiện thiếu. Người xử lý sửa được và bấm **Gửi yêu cầu bổ sung**. Việc soạn chưa thay trạng thái hay gửi tin; xác nhận mới ghi atomically vào hồ sơ/audit như trước.
- Thiếu thông tin do policy xác định được ưu tiên. Với hướng dẫn đã đủ điều kiện, hỏi chi tiết chẩn đoán chưa được cung cấp. Không hỏi lại hệ điều hành, mã lỗi hoặc thời điểm đã ghi rõ. Model lỗi/schema/evidence sai dùng mẫu dự phòng, hiển thị đúng nguồn. Version được kiểm tra trước và sau inference; phản hồi cũ không thay nội dung hồ sơ mới.
- Lưu UUID yêu cầu khách vào `localStorage` sau khi gửi thành công. Không lưu nội dung ticket, identity hoặc trạng thái vào lịch sử trình duyệt. Đổi sang Admin/đăng nhập nhân viên/đổi phòng ban khách không xóa danh sách này.
- `/guest` và `/track` hiển thị danh sách, đọc trạng thái từ API riêng từng UUID, phân trang 10 mục, làm mới khi trở lại tab và mỗi 30 giây khi tab hiển thị. Pending, Approved, Needs more information và Rejected hiển thị rõ; trạng thái dừng/hoàn tất giữ riêng. Mất mạng hiện chưa tải được, không bịa trạng thái Pending.
- Danh sách thuộc cùng trình duyệt và origin. Xóa dữ liệu trình duyệt hoặc dùng trình duyệt khác cần liên kết theo dõi đã giữ riêng. Khi storage bị chặn, vẫn dùng được liên kết và bộ nhớ của tab hiện tại. Không tạo quyền truy cập mới hoặc danh sách chung của mọi khách.
- Đã bỏ thông báo phiên khách và các đoạn hướng dẫn reviewer được khoanh trong ảnh. Thông tin nguồn AI, audit và các chặn nghiệp vụ vẫn hiển thị tại vị trí phù hợp.

## Bộ kiểm chứng cache

Bổ sung **[test cache system](TEST-CACHE-SYSTEM.md)** trong trang Kiểm thử: 4 nhóm × 7 cách diễn đạt cùng ý và 14 câu đối chứng. `npm run test:cache-system` chạy riêng bộ này; `npm run test:cache` chạy cả các guard cache dưới đây.

Chạy `npm run test:cache`. Provider là mock hoặc hàm model giả lập trong test; Mongo được giả lập tại boundary, không gọi model/Mongo thật.

| Nhóm | Kiểm tra và kết quả bắt buộc |
| --- | --- |
| Câu trả lời công khai | Miss sinh câu trả lời; hit dùng lại nội dung đã validate và giữ thời gian sinh ban đầu. |
| Hạn dùng answer | Hit trước một giờ; miss đúng mốc một giờ. |
| Hạn dùng FAQ | Hit trước bảy ngày; miss đúng mốc bảy ngày. |
| Hạn dùng summary | Miss sau 24 giờ. |
| Đầu ra sai | Validate trước khi ký/lưu; đầu ra sai không được cache. |
| Schema mới | Mỗi hit phải qua validator hiện hành; dữ liệu cũ không hợp lệ được tạo lại. |
| Nội dung bị sửa | Chữ ký sai hoặc giá trị bị sửa phải miss. |
| Khóa ký khác | Không dùng entry của key khác hoặc key API đã đổi. |
| Entry hỏng | Ngày sai, createdAt ở tương lai, signature hỏng đều miss. |
| Đồng thời | Hai miss cùng key chỉ gọi generator một lần; lỗi được giải phóng để thử lại. |
| Bypass | Không key/provider mock/thiếu secret không đọc/ghi shared answer cache; vẫn validate kết quả. |
| Cache lỗi | Read/write Mongo lỗi không làm mất câu trả lời an toàn; không mở store dự phòng mới cho FAQ. |
| Template thay đổi | Đổi warning, expected result hoặc summary phải invalidation. |
| Riêng tư và policy | Câu riêng tư, operational fields, missing facts, risk, compound request, lỗi model, Verify/fault không dùng FAQ. Policy vẫn được đánh giá lại. |
| Phạm vi summary/read-only | Summary không dùng chéo ticket; đổi nội dung phải tạo lại; lookup FAQ read-only không tự làm nóng cache. |

Lỗi được sửa trong `answer-cache.ts`: trước đây generator trả giá trị rồi ghi cache mới validate ở đầu ra. Nay validate trước khi ký/lưu, kể cả đường bypass. Cache vẫn không thể cấp quyền hoặc làm ticket tự hoàn tất.

## Bộ 15 tình huống

Đối chiếu cả 15 case trong `mlai26_new/data/verify/judge-15.json` với policy hiện hành: các kỳ vọng action/bucket/rule vẫn phù hợp, nên giữ nguyên file và nhãn. Không thay Ground Truth để tăng tỷ lệ đạt. Bộ hiện tại bao phủ hướng dẫn thiết bị/mạng, song ngữ, reset mơ hồ, thiếu phạm vi database, production admin, public RDP, xung đột field/text, handoff, wipe, bypass MFA, prompt injection và tác vụ ngoài danh mục.

Verify nay kiểm tra thêm chất lượng phản hồi của bộ 15: hướng dẫn có bước thực hiện, cách kiểm tra kết quả và cảnh báo; nhánh thiếu dữ kiện có câu hỏi và trường còn thiếu; nhánh escalation không được approved/completed. Màn hình hiển thị từng check. `tests/support-verify.test.ts` chạy cả 15 qua cùng API và đọc lại detail/audit/queue/metrics. `tests/judge-packs.test.ts` kiểm tra contract nghiệp vụ và cấu trúc bộ. Đây là regression synthetic, không phải benchmark AI độc lập.

## Kiểm tra toàn repo

Chạy docs check, typecheck, lint, toàn bộ Vitest, script guard tests, production build, Playwright desktop/mobile và persistence opt-in. Không có Mongo disposable thì bài restart phải báo skip; không coi là đã kiểm chứng Mongo thật. Nhật ký kết quả sau commit được lưu ngoài repo để tránh commit artifact sinh tự động.
