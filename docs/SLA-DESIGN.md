# Đo thời gian phục vụ — hợp đồng pilot

Ngày: 17/10/2026. Base: `002525d8665d0afd0c86e5a4da2bc71aad6bd924`.
Triển khai có AI assistance; chưa có xác nhận owner hay human review.

## Hiện trạng và quyết định

Ticket/audit được ghi chung một document bằng version CAS trong `support-repository.ts`.
Policy `support-guidance-v5.20`, HANDOFF-002, quyền và Ground Truth giữ nguyên.
Tin nhắn nhóm có document giao hàng/audit bất biến riêng và không tăng version ticket.
Incident update chỉ là thông báo chung, không phải xác nhận hoàn tất từng ticket.
Chưa có event accept, priority matrix hoặc bằng chứng khôi phục dịch vụ riêng.
Phòng ban người gửi (khách: chưa xác minh) không xác định service owner hoặc quyền.

SLI là phép đo; SLO là mục tiêu nội bộ; SLA là cam kết đã duyệt; OLA là mục tiêu giữa các đội.
Pilot SHADOW chỉ đo SLI. Target, calendar, owner cam kết và ngưỡng cảnh báo để trống.
Không tự xem thời gian thực trôi qua là giờ làm việc; business elapsed chưa tính khi lịch chưa duyệt.
Telemetry model/retrieval/cache/API giữ riêng.

## Contract sự kiện

| Metric | Start | Stop | Cancel / reopen | Pause | Trách nhiệm / audience |
| --- | --- | --- | --- | --- | --- |
| `human_response` | Lần vào hàng chờ ESCALATED/NEEDS_INFORMATION đầu tiên của cycle | SEND_MESSAGE hoặc REQUEST_INFORMATION có nội dung do reviewer xác nhận; hoặc tin nhắn nhóm giao đúng recipient sau start | REJECT/STOP/hồ sơ hoàn tất trước phản hồi: cancel, không tính đạt; reopen tạo cycle mới | Chỉ reason đã duyệt trong snapshot, mặc định không pause | Team đang tiếp nhận; SLA owner chưa xác nhận; reviewer |
| `support_completion` | DECISION đầu tiên sau tiếp nhận, hoặc reopen có event mới | COMPLETED từ feedback RESOLVED hoặc FULFILL; hoàn tất hỗ trợ/mô phỏng, không gọi là khôi phục dịch vụ | REJECT/STOP: cancel; reopen giữ cycle cũ, tạo cycle mới | Như trên; chờ nội bộ vẫn chạy | Team đang tiếp nhận; reviewer |
| `requester_wait` | Chuyển sang NEEDS_INFORMATION có event nguồn | CLARIFICATION hoặc rời NEEDS_INFORMATION | REJECT/STOP: cancel; mỗi lần chờ tạo cycle mới | Không pause chính metric chờ | Team theo dõi bổ sung; reviewer |

AI ANSWER, draft chưa gửi, APPROVE và incident broadcast không kết thúc human response.
Lời nhắn ngắn do reviewer chủ động xác nhận được tính là phản hồi; chưa có đánh giá chất lượng nội dung độc lập.
Không thêm accept/restoration/vendor/approval metrics trước khi có event đáng tin cậy và owner.
`completionEvents` trong snapshot cho phép mỗi service chỉ chấp nhận FULFILL hoặc REQUESTER_RESOLVED
(hoặc cả hai). Hồ sơ đóng theo kết quả không nằm trong tiêu chí đã pin sẽ hủy metric, không tính đạt.
Định nghĩa event có `definitionVersion`; thêm nguồn mới phải bổ sung contract và kiểm thử trước khi cấu hình.
Duplicate/group/incident link giữ mỗi ticket/cycle riêng; không reset đồng hồ.
Đổi team/context ghi event; target/calendar đã pin không tự đổi. Đổi priority chưa có API nguồn được duyệt.
Luồng hiện có chỉ mở lại REJECTED qua OVERRIDE; không mở thêm quyền reopen cho COMPLETED/STOPPED.
Team thay đổi theo quyết định/handoff/clarification hiện có; chưa thêm thao tác phân công thủ công.
Không có pause API trong pilot; engine chỉ nhận reason allowlist đã duyệt để dùng trong giai đoạn sau.

## Cấu hình và lưu trữ

Catalog service dùng ID ổn định, ánh xạ service group có sẵn; service owner department tách requester department.
Resolver chọn cấu hình effective có precedence cao nhất, rồi số điều kiện khớp lớn nhất.
Mọi cấu hình phải đầy đủ (không deep merge); bằng điểm là conflict → UNCONFIGURED.
Không có config/owner/calendar hợp lệ → UNCONFIGURED có reason; không đoán default giờ trực.
DRAFT/RETIRED không kích hoạt mục tiêu; raw observations vẫn có trạng thái UNCONFIGURED. SHADOW ghi event, không hứa hẹn/cảnh báo. ACTIVE phải có approval reference,
owner, target, calendar và danh sách nhóm nhận cảnh báo; chỉ cảnh báo trong reviewer queue.
Không có màn hình/API sửa config; sửa dữ liệu TypeScript qua review Git, với owner phê duyệt trước ACTIVE.
Business calendar giới hạn phép tính trực tiếp ở 3.660 ngày mỗi clock; vượt giới hạn trả unknown.
Đây là pilot có giới hạn tập dữ liệu, chưa có báo cáo aggregation cho quy mô doanh nghiệp.

SLA state/cycles chứa snapshot policy ID/version/effective date/target/calendar/scope/owner, event ID,
UTC server timestamp, actor, team và reason code; không sao chép nội dung tin nhắn vào SLA.
Clock update cùng atomic write với business event và audit; version conflict không lưu một phần.
Ticket cũ không có SLA state giữ LEGACY_UNMEASURED, kể cả được cập nhật; không backfill.
Tin nhắn nhóm vẫn dùng document giao hàng làm nguồn kết thúc; projection SLA đọc record đó theo recipient,
không fan-out ghi ticket, không đổi membership/version. Báo cáo và chi tiết dùng cùng projection.
Thời điểm cảnh báo được đánh giá khi đọc queue/chi tiết, không có scheduler hoặc thông báo ngoài app.
Alert là projection có ID ổn định theo clock sau khi ghép đủ nguồn ticket và tin nhắn nhóm;
không ghi một event breach giả khi chưa ghép nguồn. Các event start/stop/pause cùng snapshot được lưu
đủ để tính lại kết quả. Pilot không tạo notification delivery log hay giả lịch sử cảnh báo nền.

## Báo cáo và các quyết định cần duyệt

Cửa sổ do reviewer chọn `[from, to)` theo thời điểm bắt đầu cycle; snapshot cũ giữ nguyên.
Mẫu số compliance chỉ gồm ACTIVE SLA/SLO/OLA đã cấu hình đủ, kết thúc hoặc đang quá hạn;
clock đang chạy chưa quá hạn, cancelled, SHADOW, legacy và thiếu config được đếm riêng.
Clock hoàn tất đúng target được tính đạt, vượt target là trượt. Không bịa percentile khi ít mẫu.
Mọi báo cáo có số ticket/cycle, giới hạn tập dữ liệu, business-time coverage và cảnh báo không đủ bằng chứng kết luận.

Owner cần xác nhận: catalog và ownership, phân loại kết quả từng service, nguồn accept/restoration,
impact/urgency/priority, target và tỷ lệ đạt, lịch/zone/ngày nghỉ, pause exceptions,
đội nhận escalation và hậu quả breach, audience, cửa sổ và mức mẫu tối thiểu.
Pilot bắt đầu Helpdesk IT; thêm dịch vụ qua catalog/config, không thêm `if departmentName`.

## Căn cứ

- [Google SRE: Implementing SLOs](https://sre.google/workbook/implementing-slos/): chọn phép đo từ trải nghiệm và có đồng thuận stakeholder.
- [Atlassian: SLA conditions](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/): start/pause/finish tường minh; đây là ví dụ sản phẩm, không phải policy VNG.
- [Atlassian: SLA goals](https://support.atlassian.com/jira-service-management-cloud/docs/create-service-level-agreements-slas/): mục tiêu và calendar cấu hình riêng; không nhập target mẫu vào repo.

## Kiểm chứng dự kiến

Schema/config conflict, snapshot, timezone/DST/ngày nghỉ/ngoài giờ, pause/resume idempotency,
handoff/response/wait/reopen/cancel, group reply và incident isolation, legacy, CAS, reporting và privacy.
Sau đó docs/lint/typecheck/full unit/integration/build/script guards/persistence opt-in và E2E desktop/mobile local mock.
Không đọc/ghi/migrate Production, không deploy hoặc sửa environment.
