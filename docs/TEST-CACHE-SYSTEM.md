# test cache system

Base: `19d5269` trên GitHub `main`. Phạm vi: nhận diện FAQ cùng ý, dataset và bộ kiểm thử trong Admin. AI-assisted implementation và dữ liệu giả lập; không phải hội thoại người dùng thật, human review hoặc benchmark Luna.
Tích hợp thêm commit sentiment `e3bff3e` từ GitHub main trước khi kiểm tra và commit thay đổi này.


## Chạy trong ứng dụng

Vào **Admin → Kiểm thử → Bộ kiểm thử → test cache system → Chạy toàn bộ test (42)**. Mở **Xem 42 câu và kỳ vọng** để đọc dữ liệu trước khi chạy. Có thể dừng, tải lại liên kết kết quả, hoặc tiếp tục; kết quả nằm trong lịch sử Verify.

Mỗi câu đã chạy tạo một hồ sơ hỗ trợ có mã HT, nhãn **Case Verify** và liên kết với lần chạy. Sau đủ 42 câu, **Yêu cầu cần xử lý** có bốn nhóm 7 yêu cầu và 14 hồ sơ đối chứng riêng. Các nhóm an toàn giữ trạng thái **Đã xử lý tự động** theo quyết định thật của policy. Bấm **Xem yêu cầu cần xử lý** trong kết quả để mở đúng lần chạy với tất cả trạng thái, không bị bộ lọc cũ che khuất. Mở nhóm để xem từng hồ sơ và gửi trả lời chung. Nguồn **Người dùng gửi** và bộ lọc **Chờ xử lý** vẫn loại các nhóm này theo đúng ý nghĩa của bộ lọc.

Với lần chạy cũ chỉ có kết quả cache, bấm cùng nút để tạo các hồ sơ còn thiếu từ những câu đã chạy. Kết quả PASS/FAIL, HIT/MISS/BYPASS và thời điểm kiểm thử cũ được giữ. Hồ sơ mới ghi thời điểm tạo hiện tại và audit nguồn `cache-verification`, dùng extraction/policy hiện hành. Không tự sửa dữ liệu khi đọc GET. Tạo lại hoặc thử lại cùng case dùng cùng mã hồ sơ, giữ câu trả lời và trạng thái admin đã xử lý.

Kết quả được gộp thành bốn nhóm, ví dụ **VPN không kết nối — 7 yêu cầu cùng nội dung**. Mỗi nhóm báo số yêu cầu, đã kiểm tra/chưa chạy, nhận diện đúng nhóm, PASS/FAIL và HIT/MISS/BYPASS. Bấm **Xem 7 yêu cầu và kết quả** để xem từng cách viết; mở **Chi tiết kiểm tra** để đối chiếu mã ca và các check. Mười bốn câu đối chứng nằm trong mục riêng, không được tính là một nhóm câu giống nhau.

Số yêu cầu là số case thuộc lần chạy đã lưu, gồm câu gốc và các cách viết tương tự; không cộng thêm các câu mồi chuẩn bị cache. Nhận diện đúng nhóm và kết quả cache lấy từ kết quả thực tế đã lưu, không suy từ kỳ vọng. Lần chạy dở chỉ tính số ca đã có kết quả; tiếp tục hoặc reload cập nhật cùng báo cáo. Case cũ không còn trong dataset vẫn hiện ở mục chưa phân nhóm.

| Nhóm | Số câu | Kỳ vọng |
| --- | ---: | --- |
| VPN không kết nối | 7 | 1 MISS, 6 HIT |
| VPN liên tục ngắt kết nối | 7 | 1 MISS, 6 HIT |
| Wi-Fi không kết nối | 7 | 1 MISS, 6 HIT |
| Máy in offline | 7 | 1 MISS, 6 HIT |
| Đối chứng khác ý hoặc cần ngữ cảnh riêng | 14 | 14 BYPASS |

Câu có dấu/không dấu, lời nhờ hỗ trợ, đảo vị trí vấn đề, từ đồng nghĩa và lời phàn nàn nhẹ. Ví dụ “VPN của em cứ rớt kết nối hoài…” và “Kết nối chập chờn quá, VPN của mình…” cùng nhóm ngắt kết nối; chúng không dùng chung nhóm VPN chưa kết nối. Dữ liệu nằm trong [cache-system.json](../data/cache-system.json).

## Hợp đồng nhận diện và cache

Đầu vào là mô tả công khai đầy đủ; đầu ra là một trong bốn cặp **đối tượng + triệu chứng** hoặc `null`. Grammar đóng nhận các cụm đồng nghĩa và lời nói xã giao; nếu còn dữ kiện không hiểu, phủ định, đích cụ thể, lịch sử thất bại, yêu cầu chuyển người, nhiều vấn đề hoặc chỉ dẫn thao tác thì không dùng shared FAQ. Không hard-code ID hay toàn bộ câu test vào matcher.

“Giống khoảng 80%” được hiểu là cùng vấn đề dù cách viết khác nhau. Điểm Dice từ vựng chỉ là số đo số từ trùng, **không phải xác suất cùng ý** và không còn là điều kiện quyết định hit. Màn hình hiển thị điểm thực đo khi hit; không gán điểm AI giả. Chỉ hit khi cùng nhóm, cùng hash toàn bộ mẫu đã rà soát và policy hiện hành; đọc lại các guard dữ kiện thiếu, rủi ro, redaction, model failure và field nghiệp vụ. Phần trích dẫn vẫn là câu mới. Cache không dùng lại quyết định, quyền hay trạng thái hồ sơ.

TTL vẫn 7 ngày; thay policy/template hoặc revision matcher làm miss. Không kéo dài TTL khi hit. Verify nghiệp vụ và fault injection tiếp tục bỏ qua cache chung. Các cache RAG/reviewer khác giữ nguyên hợp đồng.

## Cách kiểm thử

Mỗi case dùng cache bộ nhớ riêng, chạy thật các hàm extraction, policy, mẫu hướng dẫn và `sharedFaqAnswer` của ứng dụng. Trước mỗi câu, nạp câu đầu của các nhóm khác; với câu kỳ vọng HIT, nạp thêm câu đầu của chính nhóm đó. Câu đối chứng được thử khi cả bốn nhóm đã có cache. Kiểm tra cả seed miss, số entry lưu, chủ đề, hit/miss/bypass, quyết định an toàn, body câu trả lời đã lưu (`stored-answer-body`) và nội dung vẫn khớp hướng dẫn hiện hành. So sánh từng field nghiệp vụ, không phụ thuộc thứ tự khóa JSON.

Mỗi case tự nạp lại seed nên đổi thứ tự, thử lại hoặc chuyển worker không làm sai kỳ vọng cold/warm. Không ghi/đọc cache FAQ thật và không gọi Luna. Kết quả Verify và hồ sơ hỗ trợ được lưu qua adapter hiện có. Chỉ câu kiểm thử chính tạo hồ sơ, các câu mồi không tạo thêm yêu cầu. Vì vậy kết quả không chứng minh Mongo restart, embedding tổng quát, độ chính xác model hoặc hiệu năng production. Các case cache có hạn mức riêng 60/phút/client để đủ chạy 42 câu, intake vẫn 30 và mutation vẫn 15/phút.

Chạy local:

```powershell
npm run test:cache-system
npm run test:cache
```

[Unit/integration](../tests/cache-system.test.ts) kiểm tra 42 case, mọi thứ tự câu mồi trong nhóm qua pipeline Support, chống gộp khác triệu chứng, các câu phủ định/nhạy cảm bổ sung, stop/resume, lưu hồ sơ không trùng, khôi phục lần chạy cũ và trả lời chung cho đúng nhóm. [E2E](../tests/e2e/cache-system.spec.ts) chạy 42 case qua API thật local, kiểm tra 24 HIT / 4 MISS / 14 BYPASS, reload, mở bốn nhóm trong hàng đợi và gửi tin đến đủ bảy hồ sơ. Bộ Ground Truth và expected policy của 15 tình huống không đổi.

Sửa luồng hàng đợi ngày 17/10/2026: base `88fa41b`, AI assistance: OpenAI Codex. Phạm vi gồm lưu hồ sơ của câu cache chính, liên kết lần kiểm thử và bộ lọc hàng đợi. Không thay dữ liệu kỳ vọng hoặc policy để tạo nhóm.

Kiểm tra local cho bản sửa: 182 unit/integration tests đạt, 4 E2E đạt trên desktop/mobile với production build, memory-demo và dữ liệu mô phỏng. E2E mở hàng đợi từ kết quả 42 câu, kiểm tra bốn nhóm, bỏ qua bộ lọc cũ và xác nhận tin nhắn có trong cả bảy hồ sơ. Typecheck, lint, build, kiểm tra tài liệu và diff đạt. Lượt E2E đầu chọn nhầm role `alert` của thông báo thành công, đã sửa thành `status`. Ca đánh giá 128 câu cũ từng timeout khi chạy đồng thời với E2E và typecheck, chạy lại riêng đạt với timeout cũ. Chưa kiểm chứng Mongo hoặc dữ liệu production trong lượt này.

Grammar này có phạm vi đóng, không cam kết nhận mọi cách nói tiếng Việt. Câu chưa nhận diện vẫn đi qua luồng xử lý thông thường. Tệp kết quả chạy và diff lưu ngoài Git; không đưa timestamp/UUID runtime vào dataset.

`npm run test:cache-system` còn chạy [kiểm thử tái sử dụng câu trả lời AI](../tests/guidance-answer-cache.test.ts): ba nhóm × bảy cách nói cho VPN trên Windows, macOS và timeout trên Windows; model HTTP giả lập chỉ được gọi cho câu đầu, các câu cùng ý dùng đúng câu trả lời/các bước cũ. Kiểm tra thêm Mongo boundary giả lập, TTL, đổi model/hướng dẫn, body bị sửa, cache outage và handoff. Các nhóm có ngữ cảnh này là regression qua pipeline Support; bộ Verify 42 câu vẫn giữ nguyên phạm vi FAQ để đối chiếu riêng. [Hợp đồng cache trả lời](ANSWER-REUSE-CACHE.md).
