# Bàn giao UI và hệ thống ID nhân viên

Base GitHub main: `7857d5c0024dbfd9691fd998241f30f0a27ad8cf`. Thực hiện và kiểm tra có AI hỗ trợ. Không suy ra human review từ Git identity.

## Phạm vi và quyết định

- Trang đầu ưu tiên Đăng nhập bằng ID, không mật khẩu. Hướng dẫn demo có nút mở riêng; hướng dẫn lần đầu ở luồng hỗ trợ vẫn giữ. Hai đường vào demo Support/reviewer và Verify không yêu cầu tài khoản, phù hợp brief.
- Giữ Nunito, màu VNG từ CSS hiện có, UI native/Tailwind và component nền đang dùng. Không thêm dependency. Responsive, nhãn input/select, focus, trạng thái/lỗi tại chỗ, chuyển trạng thái ngắn và reduced motion.
- Đơn cấp ID có ba bước; job có sẵn pin phiên bản, job mới chọn scope cấu trúc. IT duyệt/từ chối có lý do, có phân trang đơn/audit. ID trùng đi qua trạng thái riêng và IT chọn hậu tố có audit. Theo dõi bằng capability riêng, chỉ hiển thị ID sau duyệt và phân biệt quyền yêu cầu/quyền đã duyệt.
- Mongo-only cho identity: validator, unique ID/profile-version, transaction cho profile/account/decision/audit, optimistic version, hash token/OTP và TTL. Không tự import CSV; bộ đọc CSV còn để kiểm tra fixture.
- Theo điều chỉnh của chủ repo, người gửi dùng ID ACTIVE đã cấp được truy cập demo. Server vẫn yêu cầu OTP + role operator cấp cho danh bạ và quyết định IT; header/tên job/level không cấp quyền. Phiên demo không được gọi kiểm tra thực thi scope.
- Scope phải khớp chính xác đích/thao tác/tài nguyên/môi trường. Quyền nhạy cảm không được tự chạy từ profile approval. Endpoint access chỉ kiểm tra/audit, trả `executed:false`. Không sửa authority của deterministic Support policy hoặc sentiment.
- Form Support tự điền ID phiên; server chặn ID khác phiên. Giữ các fixture Verify và public demo với mã tự khai báo, không nhận đó là danh tính được xác minh.

## File chính

| Nhóm | File |
| --- | --- |
| Domain, parser fixture | `src/domain/identity.ts`, `src/domain/employees.ts` |
| Mongo, phiên/OTP, guard | `src/lib/identity-store.ts`, `src/lib/identity-auth.ts`, `src/lib/employee-rbac.ts` |
| Giao dịch cấp ID | `src/services/identity.ts` |
| API | `src/app/api/identity/[...path]/route.ts`, `src/app/api/employees/route.ts`, hai intake route và `src/lib/support-http.ts` |
| UI | `src/components/identity-ui.tsx`, `identity-review.tsx`, các trang `/identity/*`, `/help`, homepage, header/staff navigation/guide và form Support |
| Operator | `scripts/identity-bootstrap.mjs` |
| Hướng dẫn | `README.md`, `RUNBOOK.md`, `docs/IDENTITY-UX-PLAN.md` |
| Regression | `tests/identity-*.test.ts`, `tests/employees-api.test.ts`, `tests/e2e/identity.spec.ts`, E2E employees/onboarding/QR và `playwright.config.ts` |

## Giới hạn bằng chứng và production

Các test identity dùng adapter giả lập hoặc route mock; API không cấu hình Mongo được kiểm tra fail-closed trên build thật local. Chưa chạy Mongo replica set thật, kiểm tra restart/durability, tải đồng thời thật, OTP relay thật, SSO, user study hoặc deployment. Không dùng production data/credentials, không gọi paid model, không deploy thủ công.

Sender ID-only là demo và cho phép người biết ID mạo danh người gửi. Chưa thể gọi đó là xác thực production an toàn. IT phải cấu hình MongoDB replica set, validator/index permissions, bootstrap operator qua nguồn tin cậy và HTTPS OTP relay theo RUNBOOK trước khi dùng luồng cấp ID. Không có connector IAM/cloud/database thực thi quyền thật. Chưa có UI đổi/revoke profile/channel/role; operator cần quy trình được ủy quyền và có audit. Liên kết theo dõi phải giữ kín; chưa có khôi phục link.

Workspace gốc được đối chiếu lại bằng SHA-256: 305 file thay đổi/chưa track giữ nguyên so với snapshot trước tác vụ. Toàn bộ triển khai ở worktree sạch detached HEAD, không tạo branch riêng. Artifact do test sinh không thuộc commit.

## Kết quả kiểm tra bản tích hợp

- `npm test`: 561 tests / 36 files đạt.
- `node --test scripts/mongo-smoke-guard.test.mjs`: 11 đạt.
- `npm run lint`, `npm run typecheck`, `npm run build`: đạt.
- `$env:SUPPORT_E2E_PRODUCTION='true'; npm run test:e2e`: 115 đạt (58 Chromium desktop, 57 mobile), 1 skip bài quay video chỉ dành desktop. Build hoàn tất trước E2E; server riêng 127.0.0.1:3227, mock model, không Mongo/OTP thật.
- `node --check scripts/identity-bootstrap.mjs`: đạt; không chạy bootstrap vào database thật.
- README/CSV: đủ 36 dòng khớp; `git diff --check` trên file nhiệm vụ đạt.
- Đã xem ảnh desktop/mobile của đăng nhập và form cấp ID; test bàn phím, reduced motion, không tràn ngang, trạng thái lỗi/lưu thành công và các luồng Support/Verify đạt. Đây không phải kiểm chứng trình đọc màn hình vật lý hoặc user study.

E2E lần đầu phát hiện select job thiếu nhãn truy cập tường minh; đã bổ sung nhãn và kiểm tra lại. Selectors lỗi do Next route announcer được giới hạn vào vùng main; các kiểm thử onboarding đổi thao tác mở guide theo UX mới. Không sửa Ground Truth/expected policy để đạt test. Bộ cuối không còn test thất bại.
