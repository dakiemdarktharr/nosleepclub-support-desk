# Inventory riêng tư và quyền truy cập

Phạm vi: Support intake → extraction boundary → request/preview → audit → UI.
Kiểm thử dùng synthetic, mock/memory; không phải chứng nhận anonymization hay
kiểm toán bảo mật production. Dữ liệu gõ ban đầu vẫn nằm trong trình duyệt.

| Loại | Phạm vi nhận diện trong code | Giới hạn |
| --- | --- | --- |
| CCCD | Nhãn CCCD/căn cước + đúng 12 chữ số, liền hoặc cách bằng khoảng trắng/dấu chấm/gạch ngang; JSON quote | Số không có nhãn, dạng khác, ảnh/OCR chưa được che toàn diện. Không kiểm chứng danh tính. |
| Điện thoại | Nhãn phone/mobile/số điện thoại + mobile VN 0/+84, một số dấu phân cách | Số không nhãn, số bàn, số quốc tế khác chưa được bảo đảm. |
| Email | Địa chỉ ASCII có @ và domain nhiều nhãn, gồm dấu + | Unicode email, obfuscation “at/dot”, ảnh, tên hiển thị chưa được bảo đảm. |
| Họ tên | Không hứa nhận diện tự do | Tên giả lập trong test vẫn giữ nguyên; phải ẩn danh trước nhập. |
| Địa chỉ | Không hứa nhận diện tự do | Địa chỉ giả lập trong test vẫn giữ nguyên; phải ẩn danh trước nhập. |
| Employee ID | Che khi nhãn employee ID/mã nhân viên + `:`/`=` nằm trong nội dung; metadata `fields.employeeId` loại khỏi model facts | Metadata ID vẫn cần cho lookup, lưu và hiển thị. Đây là dữ liệu có thể liên kết, không ẩn danh hoặc xác thực. ID không nhãn chưa được che. |
| Secret/key | PEM, token prefixes, Bearer/JWT, labelled password/client_secret/access_token…, connection credentials | Pattern-based; encoding, ảnh, secret không nhãn hoặc bị làm rối có thể lọt. |
| OTP | Nhãn OTP/verification code, 4–10 số, JSON quote, số cách bằng khoảng trắng/gạch ngang | Dạng khác hoặc không nhãn chưa bảo đảm; không log/gửi OTP thật để thử. |
| Unicode | NFKC, tổ hợp dấu và ký tự zero-width theo regex trong code | Không cam kết mọi homograph/encoding/biến thể nhận diện. |

`tests/privacy-boundaries.test.ts` kiểm tra intake, allowed field values,
extraction argument, output đã lưu và audit; clarification, feedback/follow-up,
reviewer reason cũng đi qua redaction. `competition-readiness.spec.ts` kiểm tra
response API, events và trang hồ sơ không chứa các sentinel synthetic. Đây là
model **boundary bằng spy/mock**, không phải model thật hay dữ liệu Mongo thật.
Các ca mới trực tiếp kiểm tra OTP JSON/số cách nhau/fullwidth/zero-width, CCCD
gạch ngang, email có dấu + và employee ID có nhãn. Các biến thể khác trong regex
chưa có test riêng cho từng tổ hợp; bảng không phải bảo đảm mọi định dạng đều được che.

Fail-safe cũ được giữ: recognized redaction marker đi qua kiểm tra rủi ro,
không làm app tự cấp quyền. Vì vậy người dùng gửi PII đã che vẫn có thể bị
chuyển reviewer; không coi privacy masking là đường bỏ qua policy. Không sửa
bản ghi lịch sử hoặc tự purge dữ liệu. Corpus, artifact và screenshots chỉ
được bổ sung từ synthetic; danh bạ seed lịch sử chưa có xác minh nguồn gốc
từng tên, không tái sử dụng tên đó trong test mới hoặc claim đã ẩn danh toàn bộ.

## Quyền và quyết định cần owner

Bộ [sentiment synthetic mới](SENTIMENT-EVALUATION.md) không chứa review được
thu thập, người đánh giá hoặc địa điểm Google Maps. Schema chỉ nhận bản nháp
synthetic development và từ chối provenance/split khác; khai báo không tự chứng
minh giấy phép hay ẩn danh. Không nhập review bên ngoài vào schema bằng cách đổi
nhãn nguồn. Nội dung, evidence và explanation sentiment vẫn đi qua redaction/
validation trước persistence. Feedback lưu assessment đã kiểm tra cùng nguồn
model/fallback khi có; dữ liệu lịch sử thiếu trường này không được backfill.

- Reviewer Support là **public demo**, không xác thực thành viên/team. Bộ lọc
  hàng đợi chỉ để tìm hồ sơ. Nhãn này được hiển thị trong reviewer cả mobile.
- Sender ID-only có assurance demo; không phải production authentication.
  IT duyệt ID cũng dùng phiên ID-only demo + role server theo cấu hình hiện tại;
  tên job/header không tạo quyền. Không coi ID-only là xác minh chủ tài khoản.
- Identity Mongo có transaction/index/session controls nhưng chưa có integration
  evidence trên replica set thật trong lượt này. Support smoke standalone không
  chứng minh transaction của identity.
- Owner cần chốt identity provider, tenant, mapping team/scope và quyền đọc/
  approve/override; retention, deletion, consent custody và actor đáng tin cậy.
  Không chọn hộ SSO, cấp team role hoặc cài notification integration.
- Không dùng production/private data cho demo công khai. Muốn thử người thật,
  vẫn dùng ticket synthetic và thu consent theo [protocol](INDEPENDENT-EVALUATION-PROTOCOL.md).
