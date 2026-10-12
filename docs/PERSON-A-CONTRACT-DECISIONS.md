# Quyết định contract Member A — vòng v5.12

Ngày 12/10/2026 ICT. Nguồn: người dùng chỉ dẫn “hãy chạy theo quyết định của
bạn” sau báo cáo 18 mismatch còn lại. Người dùng giao quyền chọn contract trong
phạm vi này. Đây là policy mô phỏng của dự án, không phải xác nhận của owner
VNG. AI hỗ trợ quyết định/triển khai; human cross-review của B/C chưa có.

Base: `755f0982c90a045867620bfd67561d7b6a9de1dc`; working tree sạch,
branch `codex/person-a-benchmark`. Giữ nguyên input, Ground Truth và expected.

## Quyết định trước triển khai

1. VPN_SETUP thuộc ACCESS_REQUEST cần service, source, target, environment,
   duration và reason; không yêu cầu symptom/urgency của luồng chẩn đoán.
   Cấp quyền VPN vẫn đi qua Network/reviewer; không mở thêm đường AUTO.
2. DATABASE_PROVISION cần system, environment, CPU, RAM, disk, duration và
   reason. Không hỏi permission/resourceScope như xin quyền database có sẵn.
   Thiếu sizing/TTL giữ ESCALATE/MISSING_INFO; đủ facts vẫn cần DBA xem xét.
3. Quyền Jira/Confluence cần targetSystem, resourceScope (project/space/page),
   accessType, duration và reason. Không bắt buộc môi trường hạ tầng cho quyền
   nội dung tài liệu. Các production/security signal rõ vẫn giữ ưu tiên.
4. Git push branch/code được hiểu là Write khi được yêu cầu rõ, không bị phủ
   định. “collaborator” đơn thuần chưa xác định mức quyền. Jira User hoặc
   Browse/Create/Transition Issue được hiểu là standard; Confluence Editor/edit
   là write, view là read-only, comment là standard. Mapping không xác minh
   approval và không mở rộng whitelist AUTO; quyền write nội dung vẫn reviewer.
5. Thời hạn phải là khoảng thời gian dương có đơn vị hoặc timestamp ISO có
   múi giờ. “sprint”, “thứ Sáu”, “sáng mai” thiếu mốc ticket/calendar thì hỏi
   bổ sung; không lấy thời điểm chạy benchmark để suy ra ngày hết hạn.
6. Provider, quota và disk vẫn bắt buộc cho sandbox hiện có. Không tự mặc định
   chúng từ chữ “sandbox/default”, không nới giới hạn tài nguyên.
7. Giữ server-side approval verification đúng resource/quyền/thời hạn. Không
   tạo approval record cho các claim trong fixture để tăng exact-match.
8. Các nhãn AUTO gốc có thể tiếp tục mismatch với contract này. Ghi rõ xung đột
   nhãn/evidence; không đổi expected. Chưa coi development là held-out.

Rà soát sau commit e991b64: yêu cầu đủ facts nhưng nằm ngoài whitelist AUTO
phải chuyển team đã biết với AUTH-VPN-001, AUTH-DB-PROVISION-001 hoặc
AUTH-COLLAB-001, thay vì hỏi lại policy owner bằng AUTH-005. Rule này chạy sau
whitelist AUTO hiện có; không làm case đang được phép AUTO chuyển sang ESC.
Structured VPN_SETUP với requestKind ACCESS_REQUEST đi qua contract cấp quyền;
VPN_SETUP không yêu cầu cấp quyền vẫn giữ chẩn đoán/hướng dẫn.
Structured DATABASE_PROVISION với operation=provision dùng cùng sizing
contract khi requestKind là CONFIGURATION_CHANGE; không tạo CONFLICT giả
chỉ vì requestKind được khai báo đúng thao tác.

## Tiêu chí kiểm tra

- Câu hỏi đúng mục đích cấp quyền/cấp tài nguyên; mapping dựa trên evidence.
- Negation, admin/root, production, bypass, destructive và approval sai scope
  vẫn bị chặn; không có expected ESC chuyển AUTO hoặc exact-pass regression.
- 6 quyết định đã chốt ở v5.10/v5.11 vẫn khớp expected gốc.
- Baseline/candidate giữ dataset/evaluator digest; typecheck/lint/tests/build đạt.
- Ghi từng thay đổi ngoài cohort A và mọi thử nghiệm bị loại trong handoff.
