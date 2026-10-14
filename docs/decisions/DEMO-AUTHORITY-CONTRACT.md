# Quyết định quyền, approval và quota demo — 14/10/2026

Nguồn: 13 câu trả lời trực tiếp của chủ repo trong hội thoại. Đây là cấu hình
cho dự án demo, không phải policy chính thức của VNG, không phải adjudication
nhãn benchmark. AI hỗ trợ triển khai và kiểm thử; không suy ra human review
từ Git identity.

| Câu | Quyết định |
| --- | --- |
| 1 | Sổ entitlement demo trong MongoDB; adapter cho nguồn thật về sau. Không nâng assurance ID-only. |
| 2 | Đề xuất quyền đọc GitHub/Jira/Confluence thông thường 8 giờ; người gửi xác nhận. |
| 3 | Đề xuất quyền ghi thông thường 4 giờ; không gồm production/admin/secrets. |
| 4 | Jira Developer: xem/tạo/bình luận; sửa và chuyển trạng thái ticket được giao, trong project được cấp. |
| 5 | Jira standard agent: xem hàng đợi được cấp; tạo/bình luận; sửa/chuyển trạng thái ticket được giao. |
| 6 | Đề xuất VPN QA/dev 8 giờ, vẫn cần thiết bị/profile/subnet/entitlement hợp lệ. |
| 7 | Approval demo qua giao diện reviewer, lưu scope, trạng thái, lý do, actor và audit MongoDB. Không giả đối chiếu ITSM thật. |
| 8 | Sổ capacity demo MongoDB có nguồn/thời điểm/hiệu lực; tính active + reserved + requested. Thiếu hoặc cũ là unknown. |
| 9 | Project DEMO-SANDBOX: tổng 16 vCPU, 64 GB RAM, 500 GB disk, 4 GPU T4. Không dùng cho A100/H100 hay project khác. |
| 10 | Tối đa 24 giờ/lần cấp tài nguyên demo trước khi owner xem xét; không điền thời hạn khi người gửi chưa nêu. |
| 11 | Chưa cấu hình/xác minh ngân sách thì chuyển owner. Không tạo giá giả hoặc coi chi phí bằng 0. |
| 12 | IT demo có thể kiêm owner trong scope đã gán; cấm tự xử lý đơn của mình trong luồng mới. |
| 13 | Owner ban đầu chỉ DEMO-SANDBOX; chưa gán repo/Jira/Confluence/VPN hoặc scope từ fixture cũ. |

## Contract triển khai

- `proposeAccessDuration` trả đề xuất hoặc null, không sửa canonical/input.
  Nút áp dụng ghi field duration qua thao tác người dùng, hủy preview cũ và
  yêu cầu kiểm tra lại. TTL không tự tạo entitlement, không gia hạn và vẫn
  phải nằm trong thời hạn grant. Hiện chưa có nguồn expiry IAM tin cậy để
  chứng minh quyền routine; giữ gate server hiện hành.
- Mapping Jira có tên riêng `developer-assigned` / `agent-assigned`, không
  chuyển thành quyền ghi mọi ticket. Policy cần bằng chứng assignment scope
  từ server bên cạnh identity/entitlement/TTL/classification. Bản ghi demo
  không tự cung cấp các cờ verified đó.
- `AuthorityRegistry` có adapter Mongo demo; chưa có adapter IAM/ITSM thật.
  Trang `/identity/authority` nằm trong app Support, được liên kết từ trang
  cấp ID. Owner phải vừa có role IT hiện hành vừa có assignment đúng project.
- Sổ demo lưu riêng trong database identity: pool và đơn quyền. Approval
  pin scope/thời hạn/người gửi; chỉ owner khác người gửi được approve/reject,
  và revoke sau approve. Đơn bị từ chối/thu hồi không được approve lại.
  Request có mã idempotency, decision/usage dùng version CAS, ghi audit cùng
  transaction. Runtime không dùng memory/CSV/localStorage cho sổ này.
- Quyền read/create trên cloud sandbox chỉ là entitlement **demo**. Được duyệt
  không thay đổi ticket Support thành AUTO, không thay đổi quyền trên cloud
  thật. Thời hạn đề nghị trong đơn quyền demo tối đa 24 giờ; kiểm tra yêu cầu
  tài nguyên dài hơn trả owner review, không tự cấp.
- Kiểm tra quyền/quota là preflight có audit và pool version, không giữ chỗ
  hay thực thi tài nguyên. Usage/reservations là snapshot do owner khai báo
  cho demo, có observedAt/validUntil. Không tự giải phóng khi TTL hết.
- Ngân sách hiện là `unconfigured`; dù còn quota và có quyền demo, kết quả
  vẫn cần owner. Muốn tự xác minh chi phí cần nguồn ngân sách/bảng giá hợp lệ
  và adapter bổ sung; không gọi code hiện tại là đã tích hợp billing.
- Bootstrap chỉ chạy khi operator chủ động dùng CLI opt-in, không có public
  endpoint để IT tự gán owner. Chỉ tạo pool mới và audit; không sửa account,
  không cấp grant, không seed vào fixture. Lượt phát triển không chạy CLI này
  lên database thật.

## Vì sao không tự làm 39 mismatch thành PASS

Đề xuất TTL chưa được xác nhận không phải dữ kiện gốc. Demo entitlement không
phải identity proof, quota demo không áp dụng cho tài nguyên legacy. Giữ
single-request rule, security precedence và facts-before-unavailable-quota.
Hai nhãn GPU và ba nhãn Security/Authority cần adjudication độc lập; không sửa
Ground Truth. Test synthetic cũ từng kỳ vọng standard agent chưa được định
nghĩa được cập nhật theo câu 5; vẫn bắt buộc thiếu duration và không AUTO.
