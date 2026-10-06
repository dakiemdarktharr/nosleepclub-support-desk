# Protocol thu thập bằng chứng độc lập

Trạng thái: **NOT COLLECTED**. Chủ repo xác nhận chưa có held-out độc lập và
phản hồi bằng văn bản từ ba người dùng thực tế. Tài liệu này là kế hoạch và
biểu mẫu trống, không phải kết quả nghiên cứu. AI assistance: Codex.

## 1. Người phụ trách và quyền sử dụng

Chủ repo chỉ định một người giữ tập kiểm thử và hai người hiểu quy trình để
gán nhãn độc lập với người sửa policy. Ghi quan hệ với đội thi và xung đột lợi
ích. Người phụ trách xác nhận phiên bản policy mô phỏng; không gắn tên VNG
như bên phê duyệt khi chưa được xác nhận.

Mời ít nhất ba nhân sự thực sự xử lý helpdesk/quy trình tương ứng. Consent phải
nêu mục đích, dữ liệu thu, thời gian giữ, quyền dừng/rút trước khi tổng hợp,
người được truy cập, có quay màn hình hay không và quyền trích dẫn. Không tạo
tên, chức danh hoặc chữ ký thay họ. Mỗi người tự viết phản hồi.

Danh tính, chức danh thật, consent và văn bản gốc giữ trong kho riêng có kiểm
soát truy cập. Bản công khai chỉ dùng mã P01/P02/P03, không phải bằng chứng
những người đó đã tồn tại. Brief yêu cầu xác minh danh tính/chức danh: đội thi
phải thỏa thuận kênh nộp riêng với BTC; không đăng PII vào Git. Chỉ dùng ticket
synthetic hoặc dữ liệu tổ chức được phép và đã ẩn danh trước khi nhập app.

## 2. Đóng băng tập held-out trước khi chạy

1. Người giữ tập tạo tình huống mới theo policy, không sao chép/paraphrase các
   pack Verify, 128 fixture cũ, regression mới hay ví dụ trong tài liệu.
   Chia theo họ tình huống/nguồn để tránh cùng template ở development và test.
2. Đề xuất 120 ca, phân tầng routine / missing facts / security / authority /
   multi-request, có phủ định và câu tiếp. Đây là cỡ mẫu dự kiến, chưa thu thập;
   không suy ra power thống kê hoặc tính đại diện tổng thể từ số này.
3. Hai người gán nhãn riêng **trước khi thấy output**: action, bucket, rule,
   facts bắt buộc, approval có thể xác minh, câu hỏi hợp lý. Ghi bất đồng;
   người thứ ba adjudicate, giữ cả nhãn ban đầu và lý do cuối. Ca không thể
   quyết định được đánh dấu ambiguous trước chạy, báo riêng, không loại sau
   khi thấy model sai. Đặc biệt thống nhất `NEEDS_INFORMATION` khác `ESCALATE`.
4. Hash dữ liệu, nhãn và danh sách case; ghi người giữ tập, thời điểm đóng băng,
   SHA app, policy, provider/model, budget được owner cho phép và storage.
   Không đưa input/nhãn vào ngữ cảnh agent phát triển. Chạy bởi người giữ tập.
5. Freeze code trước mở kết quả. Không tune trên held-out. Nếu mở case để sửa,
   chuyển nó thành development, lập held-out mới cho lần đánh giá tiếp theo.
   API `/evaluation` chỉ kiểm tra khai báo; không chứng thực độc lập/consent.

## 3. Báo cáo chất lượng

Giữ mọi lỗi/time-out; ghi unavailable và coverage, không chỉ tính trên các ca
thành công. Báo confusion matrix 3 action, action accuracy, exact-match
action+bucket+rule (nếu nhãn cung cấp), và nhóm lỗi theo rule/subrequest.

- FNR: expected ESCALATE nhưng actual khác ESCALATE / số expected ESCALATE
  có prediction. Tách rõ actual AUTO và NEEDS_INFORMATION; hỏi bổ sung không
  phải tự phê duyệt nhưng vẫn là binary FN theo định nghĩa này.
- Unnecessary escalation: expected không ESCALATE nhưng actual ESCALATE /
  số expected không ESCALATE có prediction. Báo riêng routine bị hỏi bổ sung.
- Luôn đưa số đếm và mẫu số; mẫu số 0 là unknown, không phải 0% lỗi. Kèm khoảng
  tin cậy Wilson 95% cho tỷ lệ và báo từng nhóm; mẫu nhỏ không chứng minh an toàn.
- Các ngưỡng đạt cần owner/policy reviewer chốt trước chạy. Không giảm ngưỡng
  sau khi có kết quả để tuyên bố đạt 9,5.

## 4. Thử nghiệm người dùng trước/sau

Mỗi người làm hai bộ nhiệm vụ tương đương (routine, missing facts, escalation)
với cách hiện tại và app. Đảo thứ tự giữa người tham gia; không dùng lại cùng
ticket để tránh nhớ đáp án. Tách thời gian onboarding khỏi thời gian xử lý.
Người quan sát không gợi ý trong phần tự thực hiện; ghi mọi trợ giúp/bỏ cuộc.

Đo: hoàn thành đúng theo policy, thời gian thao tác/chờ/học, số lần hỏi bổ sung,
handoff không cần thiết, khả năng tìm rule/evidence, can thiệp Stop/Override,
và lỗi người dùng chấp nhận mà không kiểm tra. Hỏi cảm nhận gánh nặng công việc,
ỷ lại AI, giảm trao đổi với đồng nghiệp, quyền riêng tư và điểm gây khó chịu.
Không cài đáp án sai có hậu quả thật; chỉ dùng mô phỏng và giải thích sau thử.

Với tối thiểu ba người, trình bày từng người và median/range; không suy rộng
đến nhân viên VNG hoặc toàn bộ ngành. Báo cả thất bại, không hoàn tất và bất cập.
Giữ verbatim feedback; AI có thể hỗ trợ phân loại nhưng không viết thay lời họ.

## 5. Biểu mẫu trống (điền sau thu thập)

| Mục | Giá trị |
| --- | --- |
| Participant code / task code / thứ tự thử | NOT COLLECTED |
| Consent và danh tính/chức danh: mã hồ sơ riêng | NOT COLLECTED |
| SHA / policy / provider / model / storage | NOT COLLECTED |
| Onboarding / thao tác / chờ / tổng thời gian | NOT COLLECTED |
| Kết quả đúng, lỗi, trợ giúp, bỏ cuộc | NOT COLLECTED |
| Rule/evidence tìm được và giải thích của người dùng | NOT COLLECTED |
| Gánh nặng mới / ỷ lại / giảm phối hợp | NOT COLLECTED |
| Phản hồi nguyên văn do chính người dùng viết | NOT COLLECTED |
| Đồng ý trích dẫn và phạm vi công bố | NOT COLLECTED |
| Cải tiến từ phản hồi → issue/commit → thử lại | NOT COLLECTED |

Một cải tiến chỉ được tính là từ người dùng sau khi nối được feedback gốc,
quyết định thay đổi, diff và kết quả thử lại. Regression do AI đề xuất trong
lượt này không thay thế yêu cầu đó.
