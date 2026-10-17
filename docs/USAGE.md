# Hướng dẫn sử dụng VNG Support

## Thời hạn đề xuất và sổ quyền demo

Với yêu cầu quyền thông thường thiếu thời hạn, preview có thể đề xuất đọc
8 giờ, ghi 4 giờ hoặc VPN QA/dev 8 giờ khi đã biết nguồn/đích. Bấm **Dùng … giờ
và kiểm tra lại** để xác nhận giá trị; preview cũ bị hủy, cần xem lại trước
khi gửi. Bỏ qua đề xuất thì hệ thống vẫn hỏi thời hạn, không tự điền hoặc
gia hạn quyền. Entitlement, phạm vi và giới hạn rủi ro vẫn được kiểm tra riêng.

Jira Developer chỉ sửa/chuyển trạng thái ticket được giao trong project được
cấp. Standard agent xem hàng đợi được cấp và chỉ sửa/chuyển trạng thái ticket
được giao. Cả hai không có quyền quản trị/xóa/bulk export hoặc duyệt đặc quyền.

**Cấp ID nhân viên → Sổ quyền và quota DEMO-SANDBOX** mở sổ Mongo demo:

1. Người đăng nhập xin quyền read/create trên project demo, ghi thời hạn và
   lý do. Chỉ báo đã gửi sau khi Mongo lưu thành công.
2. IT đã được operator gán owner xem đơn, ghi lý do duyệt/từ chối; không tự
   xử lý đơn mình. Duyệt tạo entitlement demo có hạn; có thể thu hồi và xem
   audit ở trang cấp ID. Đơn từ chối/thu hồi phải gửi mới, không tự gia hạn.
3. Nhập tài nguyên và thời gian để kiểm tra quyền/quota. App cộng đang dùng,
   giữ chỗ và xin thêm. Không coi thiếu snapshot là usage bằng 0; dữ liệu cũ
   cần owner xác minh lại. GPU chỉ tính T4 trong pool demo.
4. Ngân sách chưa cấu hình nên còn quota vẫn cần Capacity owner. Thao tác kiểm
   tra không giữ chỗ, không cấp hạ tầng hoặc đổi quyết định ticket Support.

Nếu sổ chưa khởi tạo, liên hệ operator theo [RUNBOOK](../RUNBOOK.md#sổ-quyền-và-quota-demo).
Đăng nhập ID-only và mọi bản ghi ở đây đều là demo, không chứng minh danh tính,
approval ITSM hoặc quyền IAM thật. Chỉ dùng dữ liệu giả lập; xem [contract](decisions/DEMO-AUTHORITY-CONTRACT.md).


Trang đầu giữ hai lựa chọn vai trò và thêm nút **Đăng nhập không cần tài khoản** bên dưới:

| Bạn muốn làm gì? | Cách bắt đầu |
| --- | --- |
| Gửi yêu cầu bằng ID đã cấp | **Tôi cần hỗ trợ → Đăng nhập**; nhập ID còn hiệu lực. |
| Gửi hỗ trợ mà chưa có tài khoản | **Đăng nhập không cần tài khoản** ở trang đầu hoặc dưới form đăng nhập → `/guest`; không cần mã nhân viên/phòng ban. |
| Xin cấp ID mới | **Tôi cần hỗ trợ → Nhân viên mới?**; gửi đơn, lưu liên kết riêng và chờ IT duyệt. |
| Tiếp nhận, xử lý hoặc kiểm thử | **Dành cho Admin**; mở hàng đợi, lịch sử hoặc Verify. |

Nút **URL / QR** giúp sao chép URL hoặc mở app trên điện thoại. Hướng dẫn lần đầu chỉ vị trí thao tác theo vai trò; có thể mở lại từ **Hướng dẫn demo** ở màn hình đăng nhập. Giao diện hỗ trợ desktop/mobile, bàn phím và chế độ giảm chuyển động.

### Người gửi yêu cầu

1. Vào **Gửi yêu cầu**, chọn **Mô tả vấn đề** hoặc **Chọn theo danh mục**.
2. Nếu dùng tài khoản, chọn **Phòng ban** và nhập **Mã nhân viên**; phiên đăng nhập tự điền ID và phòng ban đã cấu hình. Luồng **không cần tài khoản** bỏ các ô này, tự chọn một trong chín phòng ban giả lập và ghi rõ trên form. Phòng ban giữ nguyên khi tải lại/gửi tiếp trong tab; chọn lại nút đăng nhập khách ở trang đầu sẽ nhận phòng ban khác. Trình duyệt chặn sessionStorage vẫn dùng được, nhưng reload có thể đổi phòng ban. Đây chỉ là ngữ cảnh demo, không tạo hay mượn danh tính/quyền nhân viên. Hồ sơ đã lưu giữ phòng ban của lúc gửi.
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

Mở **Dành cho Admin → Yêu cầu cần xử lý**. Tìm theo nội dung, mã nhân viên hoặc mã `HT-…`; lọc nhanh **Chờ xử lý**, **Ngoài quy định**, **Cần thẩm quyền**, **Gợi ý tri thức**. Từ khóa/bộ lọc được giữ trong session của tab, với fallback khi trình duyệt chặn session storage.

Mở hồ sơ để xem **Yêu cầu nguyên văn** (đã che thông tin nhạy cảm) và **Tóm tắt yêu cầu** bằng Luna. Nếu tóm tắt chưa khả dụng, vẫn đọc được nguyên văn và xử lý hồ sơ; có nút thử lại. Tóm tắt chỉ giúp đọc nhanh, không tự duyệt hoặc gửi tin nhắn. Bấm **Xem lịch sử & bằng chứng** để mở hướng dẫn đã gửi, dữ kiện, phòng ban, thời điểm, lý do chuyển tiếp và audit. Mục phân tích nội bộ hiển thị sentiment khi tiếp nhận và trong phản hồi; màn hình người gửi chỉ hiển thị tiến trình dễ hiểu. Có thể yêu cầu bổ sung, duyệt, từ chối, dừng, điều chỉnh quyết định hoặc ghi nhận hoàn tất tùy trạng thái; server kiểm tra chuyển trạng thái, version và lý do. Yêu cầu rủi ro bảo mật không được duyệt/hoàn tất bằng nút reviewer demo. Thao tác dừng/điều chỉnh cập nhật workflow và audit, **không hoàn tác tài nguyên bên ngoài**.

Không gian reviewer hỗ trợ hiện là **public demo**, tách khỏi quyền IT duyệt ID. Nhãn team và bộ lọc không xác thực thành viên nhóm, cấp thẩm quyền hoặc gửi thông báo cho người thật.

### Giám khảo: Verify và input mới

Đường demo ngắn, không cần tài khoản: **Trang đầu → Dành cho Admin → Đã hiểu → Kiểm thử → Đề A → Chạy toàn bộ test (5)**. Xem 3 routine/2 escalation, mở **Bằng chứng quyết định** và **Mở request / audit → Lịch sử yêu cầu và hướng dẫn**, rồi quay lại Verify để nhập một tình huống mới. Có thể bỏ qua tour; tour không tự chạy thao tác.

[Rà soát mới](https://github.com/dakiemdarktharr/vng-support/blob/cd50d826003f2e49e8d52b3e695ad6fe74fe15b7/docs/REPO-AUDIT-2026-10-14.md) · [Readiness kỹ thuật](https://github.com/dakiemdarktharr/vng-support/blob/cd50d826003f2e49e8d52b3e695ad6fe74fe15b7/docs/archive/TECHNICAL-READINESS.md) · [Đánh giá trước đó](https://github.com/dakiemdarktharr/vng-support/blob/cd50d826003f2e49e8d52b3e695ad6fe74fe15b7/docs/archive/COMPETITION-READINESS.md) · [Protocol held-out/người dùng](INDEPENDENT-EVALUATION-PROTOCOL.md) · [Nội dung 5 slide, video và checklist](SUBMISSION-CONTENT.md). Các bằng chứng độc lập/người dùng còn thiếu được ghi `NOT COLLECTED`; không suy ra 9,5/10 từ số test đạt.

1. Mở **Kiểm thử / Verify**, chọn bộ và bấm **Chạy toàn bộ test** một lần.
2. Thanh tiến trình cam hiển thị số ca đã có kết quả, tính cả PASS và FAIL; không phải dự đoán thời gian. Khi khởi tạo hoặc đọc lại kết quả, thanh chuyển sang đang chờ. Xem expected/actual, rule, thời điểm và liên kết hồ sơ; mở audit để đối chiếu quyết định. Có thể dừng, xem lại và tiếp tục lượt chạy đã lưu, kể cả sau lỗi kết nối.
3. Nhập tình huống mới trong Verify hoặc form hỗ trợ. Input mới đi qua luồng xử lý ứng dụng, không nhận kết quả theo case ID.

| Bộ | Số case | Nội dung |
| --- | ---: | --- |
| Bộ chung `submission-4` | 4 | Hai case tự xử lý, một cần bổ sung, một chuyển tiếp vì RDP public. |
| Đề A `de-a-v3` | 5 | Ba case thường quy và hai case cần chuyển tiếp. |
| `judge-15` | 15 | Thiếu dữ kiện, ngoài quy định, vượt thẩm quyền, xung đột và prompt injection. |

Verify tạo request qua API và đọc lại hồ sơ, audit, queue, metrics trước khi đánh dấu PASS. Đây là kiểm tra có ghi dữ liệu; provider OpenAI được cấu hình có thể phát sinh API call. Kết quả mock chỉ chứng minh luồng mô phỏng. Xem [hướng dẫn giám khảo](JUDGE-ONBOARDING.md), [các bộ dữ liệu](JUDGE-DATASETS.md) và [brief cuộc thi](../Challenge_Brief_OrganizationAI_VN.docx.md).

## Xử lý nhiều yêu cầu giống nhau

Người gửi sự cố mạng/điện nhập mã khu vực chung nếu biết; ví dụ giả lập `DEMO-HQ`. Nếu chưa biết, bỏ trống và tiếp tục gửi riêng. Hồ sơ theo dõi hiển thị cập nhật nhóm, thời điểm và lịch sử; nhóm hết hạn sau 24 giờ hoặc đóng không có nghĩa vấn đề cá nhân đã hết.

Admin mở **Sự cố chung**, xem hồ sơ đại diện rồi chọn thông báo tiến độ phù hợp. Thông báo hiển thị cho mọi hồ sơ liên kết; app không tự gửi email. Bỏ chọn **Gộp sự cố trùng** để xem các hồ sơ riêng. Dùng **Đã xử lý tự động** để kiểm tra cả quyết định auto trước đó.

Khi mở hồ sơ, hai gợi ý xử lý tự xuất hiện; chọn để xem toàn bộ và sửa trong ô **Tin nhắn cho người gửi**. Bấm **Hỏi thêm thông tin** để soạn một tin nhắn ngắn nêu dữ kiện thiếu, rồi bấm **Gửi yêu cầu bổ sung** để lưu và gửi. Chọn/soạn gợi ý chưa thay trạng thái. Người gửi thấy **Phản hồi của nhân viên** trên trang theo dõi; trang đang mở tự cập nhật. Khách quay lại từ Admin vẫn thấy **Yêu cầu đã gửi** trong cùng trình duyệt. Đây là tin nhắn trong app, không phải email/push hoặc xác nhận đã đọc. [Chi tiết và kiểm thử](GUEST-REVIEW-CACHE.md).

Luna tự soạn hai tin giải đáp đầy đủ: một theo đoạn ngắn, một theo từng bước. Cả hai giữ đủ hướng dẫn, cách kiểm tra kết quả và giới hạn an toàn đã rà soát. Bấm Hỏi thêm thông tin để soạn riêng tin ngắn nêu dữ kiện thiếu, sửa rồi xác nhận gửi. Model lỗi có mẫu dự phòng ghi đúng nguồn. Ô tin nhắn tối đa 2.000 ký tự; chọn bản nháp không tự duyệt hoặc đóng hồ sơ.

Câu hỏi VPN/Wi-Fi phổ biến có thể dùng mẫu được kiểm duyệt từ cache. Mật khẩu Wi-Fi và thông tin riêng không được chia sẻ qua cache. Nói rõ bước đang vướng giúp hỗ trợ tiếp chính xác; cảm xúc không tự cấp quyền hoặc đổi ưu tiên. Bạn luôn có thể chủ động yêu cầu nhân viên hỗ trợ.
