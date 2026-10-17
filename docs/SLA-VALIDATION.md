# Kiểm chứng pilot thời gian phục vụ — 17/10/2026

Base: `002525d8665d0afd0c86e5a4da2bc71aad6bd924` (`main` và `origin/main` trùng nhau khi bắt đầu).
Diff: 26 file, chỉ bổ sung; không xóa hoặc viết lại fixture/Ground Truth.
Làm trong checkout sạch riêng; `.DS_Store` và `VNG Support Slide.pdf` chưa được theo dõi trong checkout gốc được giữ nguyên.
Có AI assistance trong thiết kế, code, test và tài liệu; dùng lại reviewer surfaces, typography, màu VNG và workflow đã có.
Không suy ra human review hoặc business approval từ Git identity.

## Scope và diff

- Thêm config/schema, snapshot/cycles và engine lịch làm việc dùng chung; không có nhánh theo tên phòng ban.
- Thêm optional `serviceLevel` cho ticket mới và áp event trước CAS, cùng atomic write với business audit.
- Ghép metadata tin nhắn nhóm từ document giao hàng; không sửa cơ chế gửi, membership, version hay trạng thái ticket.
- Thêm API reviewer đo từng ticket/báo cáo, panel clock gọn có phần mở rộng và trang báo cáo với hàng cảnh báo trong app.
- Thêm tests và cập nhật README/RUNBOOK/architecture/[contract](SLA-DESIGN.md).
- Giữ policy `support-guidance-v5.20`, guards, Ground Truth, fixtures, identity và telemetry AI hiện có.
- Không thay package/dependency, environment, deployment config hoặc database Production; không backfill.

## Kết quả local

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run check:docs` | PASS, local links/conflict markers; không kiểm chứng URL/anchor ngoài repo |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | 1.683 PASS, 1 live test SKIP; 84 file PASS, 1 file SKIP |
| `node --test scripts/*.test.mjs` | 38 PASS, 1 persistence test SKIP |
| `npm run build` | PASS, gồm hai API đo và `/review/service-level` |
| E2E Chromium đầy đủ | 123/123 PASS; sau sửa guard reopen/tie ordering, chạy lại group reply + service level: 2/2 PASS |
| E2E mobile đầy đủ | 122 PASS, 1 video-recording test SKIP theo cấu hình desktop-only |
| `npm run test:persistence` | NOT_PERFORMED/SKIP: không có Mongo disposable URI/ack; không kết nối database |
| `npm audit --omit=dev` | 0 advisory |
| `npm audit` | 7 high có sẵn trong toolchain; không tự nâng major/fix-force |
| `git diff --check` | PASS |

Toàn bộ E2E chạy trên production build **local loopback**, model mock, memory-demo và hồ sơ giả lập.
Tên file `production-acceptance.spec.ts` trong suite không có nghĩa đã gọi Production.
Ảnh clock và report đã được kiểm tra để đọc được và không tràn ngang; screenshot/trace sinh tự động để ngoài commit.
Chưa xác nhận hosted CI, Mongo restart thật, model thật, tải lớn hoặc SLA vận hành thực tế.

## Các nhánh được kiểm tra

[Calendar tests](../tests/service-calendar.test.ts): giờ trực, nghỉ trưa, ngoài giờ, ngày nghỉ, cuối tuần,
phần lẻ giây, lịch continuous được cấu hình, DST gap/fold và DST nửa giờ; từ chối lịch không hợp lệ.

[Domain tests](../tests/service-level.test.ts): default/override/conflict/effective date, guard ACTIVE/owner/approval,
catalog validation, snapshot, first human response, requester wait, completion criteria theo service,
transfer, reopen, cancel, pause/resume idempotency và retry muộn, breach không đổi policy/status,
mẫu số và projection phản hồi nhóm có thứ tự ổn định khi trùng timestamp.

[Workflow tests](../tests/service-level-workflow.test.ts): submit idempotency, review thật, clarification,
CAS cạnh tranh/rollback, legacy không hồi tố, xác nhận hoàn tất, reopen thật từ REJECTED,
gửi nhóm đúng một lần/không gửi cho người đến sau, bảo vệ nội dung riêng và API guards.

[E2E](../tests/e2e/service-level.spec.ts): panel SHADOW, target/owner chưa duyệt, gửi tin nhắn,
reopen có cycle mới, màn hình người gửi không render mục tiêu thử nghiệm, báo cáo không bịa tỷ lệ đạt và không tràn ngang.

## Phần cần owner quyết định

Chưa đặt SLA target, priority matrix, lịch trực/ngày nghỉ, owner cam kết, mức mẫu tối thiểu hoặc hậu quả breach.
Business elapsed trả unknown khi chưa có lịch; tỷ lệ đạt không có mẫu số ACTIVE. Đây là phép đo thử SLI.
Accept, khôi phục dịch vụ riêng, chờ vendor/approval/team khác chưa có event đáng tin cậy và owner nên chưa bật metric.
Pause chỉ có engine với reason đã duyệt, chưa có UI/API; không dừng đồng hồ tự động khi chờ.
Config quản trị qua Git; báo cáo giới hạn 500 hồ sơ; chưa có scheduler hoặc kênh thông báo ngoài app.
Public-demo giữ giới hạn xác thực hiện có, không phải phân quyền doanh nghiệp.

Pilot Helpdesk IT nên thu thập đủ mẫu và chốt các mục còn thiếu trước ACTIVE. Thêm dịch vụ qua catalog/config;
nếu cần routing nhiều service cùng grouping, bổ sung nguồn service identity trong intake trước, không lấy phòng ban người gửi thay owner.
