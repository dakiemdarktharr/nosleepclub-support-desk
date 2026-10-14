# Protocol thu thập bằng chứng độc lập

Trạng thái: **PARTIAL**. Báo cáo feedback của ba người kiểm thử đã được gỡ khỏi cây mã
nguồn công khai theo yêu cầu chủ repo. Protocol này không lưu tên, trích dẫn nguyên văn
hoặc chi tiết nhận dạng. Việc gỡ báo cáo khỏi repository không phủ nhận việc feedback
đã được thu thập. Chưa có held-out độc lập.
AI assistance: Codex.

## 1. Người phụ trách và quyền sử dụng

Chủ repo chỉ định một người giữ tập kiểm thử và hai người hiểu quy trình để
gán nhãn độc lập với người sửa policy. Ghi quan hệ với đội thi và xung đột lợi
ích. Người phụ trách xác nhận phiên bản policy mô phỏng; không gắn tên VNG
như bên phê duyệt khi chưa được xác nhận.

Mời ít nhất ba nhân sự thực sự xử lý helpdesk/quy trình tương ứng. Consent phải
nêu mục đích, dữ liệu thu, thời gian giữ, quyền dừng/rút trước khi tổng hợp,
người được truy cập, có quay màn hình hay không và quyền trích dẫn. Không tạo
tên, chức danh hoặc chữ ký thay họ. Mỗi người tự viết phản hồi.

Danh tính, chức danh thật, consent và văn bản gốc giữ trong kho riêng có kiểm soát truy
cập. Bản công khai mặc định dùng mã người tham gia. Chỉ công bố tên hoặc trích dẫn
nguyên văn khi consent nêu rõ phạm vi đó; không suy ra quyền công bố chức danh hay
thông tin cá nhân khác từ consent trích dẫn. Hồ sơ consent không được lưu trong
repository này; nhóm phụ trách cần xác minh và quản lý riêng phạm vi công bố trước
khi đưa thông tin định danh vào tài liệu. Chỉ dùng ticket synthetic hoặc dữ liệu tổ
chức được phép và đã ẩn danh trước khi nhập app.

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

## 5. Phạm vi báo cáo feedback trong repository

Báo cáo ghi nhận feedback của ba người đã được gỡ khỏi cây mã nguồn công khai theo
yêu cầu chủ repo. Protocol này không sao chép tên, trích dẫn nguyên văn hoặc chi tiết
từng trường hợp. Thông tin này mô tả trạng thái repository; không phủ nhận việc
feedback đã được thu thập. Feedback người dùng cũng không tự thay thế held-out độc
lập, phép đo tác động trước/sau hoặc retest trên đúng SHA.

## 6. Biểu mẫu cho lượt đánh giá tiếp theo

| Mục cần ghi nhận | Cách ghi nhận |
| --- | --- |
| Participant code / task code / thứ tự thử | Dùng mã người tham gia; ghi rõ nhiệm vụ và thứ tự |
| Consent và phạm vi công bố | Xác minh trước khi thử; không suy rộng quyền công bố |
| Chức danh và quy trình nghiệp vụ | Ghi theo xác nhận của người tham gia; không tự gán vai trò |
| SHA / policy / provider / model / storage | Ghi phiên bản và cấu hình trước mỗi lượt |
| Onboarding / thao tác / chờ / tổng thời gian | Đo riêng thời gian làm quen, thao tác và chờ |
| Kết quả đúng, lỗi, trợ giúp, bỏ cuộc | Ghi cho từng nhiệm vụ, kể cả lỗi và trường hợp không hoàn thành |
| Rule/evidence tìm được và giải thích của người dùng | Ghi nội dung người dùng tìm thấy và cách họ hiểu |
| Gánh nặng mới / ỷ lại / giảm phối hợp | Hỏi mở, không gợi ý câu trả lời |
| Phản hồi nguyên văn do chính người dùng viết | Lưu riêng; chỉ trích dẫn khi consent cho phép |
| Cải tiến từ phản hồi → issue/commit → thử lại | Liên kết feedback, thay đổi cụ thể và lượt retest |

Một cải tiến chỉ được tính là từ người dùng sau khi nối được feedback gốc, quyết định
thay đổi, diff và kết quả thử lại. Regression do AI đề xuất trong lượt này không thay
thế yêu cầu đó.
