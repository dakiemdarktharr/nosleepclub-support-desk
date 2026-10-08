# ID-only demo và khởi tạo Mongo — 09/10/2026

Base GitHub main: `4d84ce105371c8f6a8a989619f6d12472f20b32f`.
Worktree riêng, không sửa checkout người dùng. Có AI assistance.

## Yêu cầu và contract mới

Chủ repo yêu cầu bỏ OTP và chọn tài khoản “Nhân Viên Giả Lập IT” để duyệt
ID demo. Đây là thay đổi chủ động giảm mức xác thực cho demo, không phải
nâng độ an toàn production.

- Login chỉ nhận `employeeId`, kiểm tra ID ACTIVE trong Mongo, tạo cookie
  HttpOnly/SameSite Strict thời hạn 8 giờ. Không tạo/gửi/xác minh OTP.
- Session luôn được mô tả là `demo`. Client không được tự khai báo verified,
  role hoặc assurance. Endpoint verify cũ trả 410, không cấp cookie.
- Vai trò `identity-admin` do operator cấp vẫn được server kiểm tra cho
  duyệt ID/danh bạ/audit. Account thường, header ID hoặc job tên IT không cấp
  vai trò. Trạng thái ACTIVE, expiry và role được đọc lại mỗi request.
- Tài khoản IT mở trang cấp ID sau đăng nhập; người gửi mở form hỗ trợ.
  Hướng dẫn và trang IT nêu rõ người biết ID IT có thể mạo danh.
- API scope vẫn đánh giá đúng profile/version và rủi ro; trả
  `assurance: demo`, `executed: false`. Không thực thi IAM/cloud/database.
- Bootstrap cần `--demo-id-only --apply`, đúng database đã cấu hình,
  validator/unique index có sẵn, tên + actor + reason. Gặp ID trùng thì dừng;
  profile/account/audit phải cùng transaction. Không seed CSV.
- Dữ liệu challenge/kênh cũ được giữ, không sử dụng. Che OTP trong nội dung
  ticket vẫn hoạt động; bỏ xác minh OTP không bỏ redaction.

Các test OTP cũ được thay bằng test contract ID-only theo yêu cầu, gồm role
thường/IT, thu hồi role, ID sai/disabled, expiry, audit rollback và từ chối
client tự khai báo quyền. Không sửa Ground Truth/expected quyết định Support.

## Kiểm chứng hosting và Mongo thật

Computer use không khởi tạo được: `failed to write kernel assets`,
`os error 3`, kể cả sau reset hai runtime. Không có thao tác UI Atlas.
Connector Vercel trả 403; CLI đúng project/scope đọc được danh sách biến.
Không có biến OTP. CLI không xuất được URI vì biến được đánh dấu Secret.

Dùng cấu hình Mongo đã có của chính dự án, nạp vào process; không in/copy URI
hoặc thêm credentials vào Git. Chỉ thao tác database `vng_support_identity`.

- Health live trả revision base, storage MONGODB, status ok.
- Profiles API live trả 200; code đã hoàn tất khởi tạo schema/index.
- Kiểm tra trực tiếp: replica set, validator trên bốn collection chính,
  unique ID index của employees/applications và unique id/version của profiles.
- Trước bootstrap: employees/profile/applications/audit đều 0.
- Bootstrap live theo lựa chọn của chủ repo: một account giả lập, một profile
  sandbox/read và một audit `OPERATOR_BOOTSTRAP_DEMO` cùng transaction.
  Actor là công cụ thực hiện, reason ghi quyền của chủ repo và giới hạn demo;
  không giả xác minh nhân sự.
- Tiến trình mới đọc lại xác nhận ACTIVE, role IT, profile được pin và đúng
  một audit bootstrap. Website đọc được profile mới từ cùng database.

Không tạo đơn nhân viên khác, không sửa dữ liệu Support, không gọi model trả
phí, không xóa account/challenge cũ và không thay network access trên Atlas.

## Kiểm tra trên thay đổi này

Ngày kiểm tra: 09/10/2026; base SHA ở đầu báo cáo, commit chứa báo cáo này
là phiên bản code được kiểm tra. Node 24.18.0, Next.js 15.5.27.

| Lệnh | Kết quả | Môi trường/phạm vi |
| --- | --- | --- |
| `npm test` | 656 pass, 1 skip | Unit/integration local; identity dùng adapter giả lập |
| `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs` | 15 pass | Guard và công cụ báo cáo local |
| `npm run lint` | PASS | Local |
| `npm run typecheck` | PASS | Local |
| `npm run build` | PASS | Production build local |
| `$env:SUPPORT_E2E_PRODUCTION='true'; npm run test:e2e -- --project=chromium` | 70 pass | Server riêng port 3227, mock/memory; identity UI route mocks |
| `$env:SUPPORT_E2E_PRODUCTION='true'; npm run test:e2e -- --project=mobile` | 69 pass, 1 skip | Chạy sau desktop; skip video chỉ dành desktop |
| `npm run test:persistence` | 1 skip — NOT_PERFORMED | Chưa cấp Mongo disposable/ack cho bài restart |

Mongo bootstrap/readback thật ở phần trên là bằng chứng riêng; không gộp với
E2E mock. Không chạy lại benchmark 128 fixture trong nhiệm vụ bỏ OTP này.
Đối chiếu snapshot checkout gốc: 307 file và 2 thư mục được bảo toàn; không
stage artifact kiểm thử, helper vận hành, `.env.local` hoặc credentials.

## Đối chiếu sau push và sửa E2E Verify

Commit ứng dụng `3e80473311a2ab59fd6595f2ff7937604dc53f34` đã triển khai;
health live trả đúng revision. API live của tài khoản IT giả lập: login 200
(`assurance: demo`, `canReviewIds: true`), session/review/audit 200,
verify OTP cũ 410, logout 200 và session cũ sau logout 401. Cookie chỉ giữ
trong bộ nhớ, không ghi vào báo cáo. Không tạo đơn hoặc nhân viên khác.

[CI đầu tiên](https://github.com/dakiemdarktharr/vng-support/actions/runs/37820619382)
đạt unit/guard/lint/typecheck/build nhưng E2E Chromium dừng 11/15 Verify
(69 pass, 1 fail). Các cuộc gọi intake từ server Verify dùng chung hạn mức
30/phút; hai kịch bản trước đã chạy 10 case, rồi lượt 5 + 4 + 11 chạm 30.
Đây là giới hạn demo hiện có, không phải mismatch policy hay lỗi OTP.

Sửa `tests/e2e/support.spec.ts` để nhận biết đúng HTTP 429, kiểm tra thông báo
chờ một phút, đợi cửa sổ thật và dùng “Tiếp tục lần kiểm thử”. Không retry
mù, tăng cap, reset counter, đổi policy hoặc đổi kỳ vọng 15/15.

Kiểm tra local sau sửa E2E: lint/typecheck PASS; toàn bộ Chromium 70/70.
Lệnh sau chạy liên tiếp 34 case Verify để tái lập quota trong cùng phút:

```powershell
$env:SUPPORT_E2E_PRODUCTION='true'
npm run test:e2e -- --project=chromium --grep 'judge can enter from home|record a raw demo|one click Verify'
```

Kết quả 3/3 pass; kịch bản cuối đi qua nhánh chờ 61 giây, tiếp tục và đạt
15/15. Build/application không thay đổi ở commit sửa E2E; không gọi model
thật hoặc ghi Mongo khi chạy các kiểm thử local này. Kết quả CI đầu tiên
được giữ để truy vết, không gọi nó là PASS.

## Giới hạn bằng chứng

Bootstrap + readback thật chứng minh đường ghi transaction này hoạt động;
không chứng minh restart mongod, khả năng phục hồi sự cố, concurrent approve,
hay toàn bộ workflow identity trên Mongo thật. Persistence restart Support vẫn
`NOT_PERFORMED` khi chưa có Mongo local disposable.

ID-only có thể bị mạo danh, kể cả IT; chỉ dùng dữ liệu giả lập. Role server
không thay thế xác minh con người. Advisory dependencies, held-out độc lập và
phản hồi người dùng còn thiếu không được coi là đã giải quyết bởi thay đổi này.
