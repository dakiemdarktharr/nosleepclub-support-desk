# Hướng dẫn sử dụng VNG Support


Trang đầu giữ hai lựa chọn vai trò và thêm nút **Đăng nhập không cần tài khoản** bên dưới:

| Bạn muốn làm gì? | Cách bắt đầu |
| --- | --- |
| Gửi yêu cầu bằng ID đã cấp | **Tôi cần hỗ trợ → Đăng nhập**; nhập ID còn hiệu lực. |
| Gửi hỗ trợ mà chưa có tài khoản | **Đăng nhập không cần tài khoản** ở trang đầu hoặc dưới form đăng nhập → `/guest`; không cần mã nhân viên/phòng ban. |
| Xin cấp ID mới | **Tôi cần hỗ trợ → Nhân viên mới?**; gửi đơn, lưu liên kết riêng và chờ IT duyệt. |
| Tiếp nhận, xử lý hoặc kiểm thử | **Dành cho nhân viên**; mở hàng đợi, lịch sử hoặc Verify. |

Nút **URL / QR** giúp sao chép URL hoặc mở app trên điện thoại. Hướng dẫn lần đầu chỉ vị trí thao tác theo vai trò; có thể mở lại từ **Hướng dẫn demo** ở màn hình đăng nhập. Giao diện hỗ trợ desktop/mobile, bàn phím và chế độ giảm chuyển động.

### Người gửi yêu cầu

1. Vào **Gửi yêu cầu**, chọn **Mô tả vấn đề** hoặc **Chọn theo danh mục**.
2. Nếu dùng tài khoản, chọn **Phòng ban** và nhập **Mã nhân viên**; phiên đăng nhập tự điền ID. Luồng **không cần tài khoản** bỏ các ô này, không tạo hay mượn danh tính nhân viên.
3. Viết điều đang gặp, ví dụ “VPN không kết nối” hoặc “Máy in bị kẹt”. Không cần đặt thành câu hỏi; không cần biết trước nhóm hỗ trợ. Các trường nâng cao chỉ bổ sung khi có dữ kiện.
4. Bấm **Gửi** để xem trước cách hệ thống hiểu yêu cầu, hướng dẫn hoặc câu hỏi làm rõ. Preview **chưa tạo hồ sơ yêu cầu**; dùng **Quay lại sửa** nếu cần.
5. Chọn **Xác nhận và gửi yêu cầu**, hoặc **Lưu và tiếp tục trò chuyện** khi đang trong nhánh hội thoại.
6. Hỏi tiếp, trả lời câu hỏi bổ sung hoặc phản hồi kết quả. **Tôi đã làm được** ghi nhận đã giải quyết; **Chuyển cho nhân viên** chuyển hỗ trợ cùng lịch sử.
7. Lưu liên kết hoặc mã UUID đầy đủ để tra cứu tại **Theo dõi yêu cầu**. Mã ngắn `HT-…` dùng nhận biết và tìm trong reviewer/audit; trang theo dõi cần liên kết hoặc mã đầy đủ.

Khách dùng ngay hỏi đáp, hướng dẫn và chẩn đoán thông thường trong giới hạn policy.
Server ghi `requesterMode=guest`, bỏ metadata nhân viên do client gửi và ghi actor
`guest` trong audit người gửi. Lựa chọn này không cấp quyền IT, không xác thực danh
tính, không bỏ kiểm tra production/secrets/root, không thực thi IAM/cloud/database.
Luồng khách không gọi hệ thống ID nên vẫn dùng được khi identity Mongo chưa sẵn sàng;
việc lưu yêu cầu vẫn phụ thuộc storage Support đã cấu hình.

### Người xử lý yêu cầu hỗ trợ

Mở **Dành cho nhân viên → Yêu cầu cần xử lý**. Tìm theo nội dung, mã nhân viên hoặc mã `HT-…`; lọc nhanh **Chờ xử lý**, **Ngoài quy định**, **Cần thẩm quyền**, **Gợi ý tri thức**. Từ khóa/bộ lọc được giữ trong session của tab, với fallback khi trình duyệt chặn session storage.

Mở hồ sơ để xem nội dung gốc, hướng dẫn đã trả, dữ kiện, lý do chuyển tiếp và audit. Có thể yêu cầu bổ sung, duyệt, từ chối, dừng, điều chỉnh quyết định hoặc ghi nhận hoàn tất tùy trạng thái; server kiểm tra chuyển trạng thái, version và lý do. Yêu cầu rủi ro bảo mật không được duyệt/hoàn tất bằng nút reviewer demo. Thao tác dừng/điều chỉnh cập nhật workflow và audit, **không hoàn tác tài nguyên bên ngoài**.

Không gian reviewer hỗ trợ hiện là **public demo**, tách khỏi quyền IT duyệt ID. Nhãn team và bộ lọc không xác thực thành viên nhóm, cấp thẩm quyền hoặc gửi thông báo cho người thật.

### Giám khảo: Verify và input mới

Đường demo ngắn, không cần tài khoản: **Trang đầu → Dành cho nhân viên → Đã hiểu → Kiểm thử → Đề A → Chạy toàn bộ test (5)**. Xem 3 routine/2 escalation, mở **Bằng chứng quyết định** và **Mở request / audit → Lịch sử yêu cầu và hướng dẫn**, rồi quay lại Verify để nhập một tình huống mới. Có thể bỏ qua tour; tour không tự chạy thao tác.

[Rà soát mới](REPO-AUDIT-2026-10-14.md) · [Readiness kỹ thuật](archive/TECHNICAL-READINESS.md) · [Đánh giá trước đó](archive/COMPETITION-READINESS.md) · [Protocol held-out/người dùng](INDEPENDENT-EVALUATION-PROTOCOL.md) · [Nội dung 5 slide, video và checklist](SUBMISSION-CONTENT.md). Các bằng chứng độc lập/người dùng còn thiếu được ghi `NOT COLLECTED`; không suy ra 9,5/10 từ số test đạt.

1. Mở **Kiểm thử / Verify**, chọn bộ và bấm **Chạy toàn bộ test** một lần.
2. Xem expected/actual, rule, thời điểm và liên kết hồ sơ; mở audit để đối chiếu quyết định. Có thể dừng, xem lại và tiếp tục lượt chạy đã lưu.
3. Nhập tình huống mới trong Verify hoặc form hỗ trợ. Input mới đi qua luồng xử lý ứng dụng, không nhận kết quả theo case ID.

| Bộ | Số case | Nội dung |
| --- | ---: | --- |
| Bộ chung `submission-4` | 4 | Hai case tự xử lý, một cần bổ sung, một chuyển tiếp vì RDP public. |
| Đề A `de-a-v3` | 5 | Ba case thường quy và hai case cần chuyển tiếp. |
| `judge-15` | 15 | Thiếu dữ kiện, ngoài quy định, vượt thẩm quyền, xung đột và prompt injection. |

Verify tạo request qua API và đọc lại hồ sơ, audit, queue, metrics trước khi đánh dấu PASS. Đây là kiểm tra có ghi dữ liệu; provider OpenAI được cấu hình có thể phát sinh API call. Kết quả mock chỉ chứng minh luồng mô phỏng. Xem [hướng dẫn giám khảo](JUDGE-ONBOARDING.md), [các bộ dữ liệu](JUDGE-DATASETS.md) và [brief cuộc thi](../Challenge_Brief_OrganizationAI_VN.docx.md).
