# Kiểm chứng reviewer, phòng ban, cache và sự cố chung

Ngày 17/10/2026. AI-assisted implementation; dữ liệu synthetic.
Base bắt đầu: `13edf8034df44decabf41b86da7fe1c89e1a9c33`.
Đã tích hợp main `91bddd609df5543e7d9718cdf4b7137d10b6f1e7` (mascot và bóng);
không ghi đè checkout người dùng. Commit chứa báo cáo này là candidate phát hành.
Policy giữ `support-guidance-v5.20`; Ground Truth và fixture gốc không đổi.

| Phần | Thay đổi và bằng chứng |
| --- | --- |
| Reviewer | Một câu hỏi + hai giải đáp theo đúng input: model viết lời dẫn bạn/mình, server giữ nguyên toàn bộ các bước an toàn/lý do policy. Strict schema/evidence, chặn ba câu hỏi, rủi ro/secret/claim giả; version trước/sau. Chỉ gửi khi reviewer xác nhận action; atomic decision/audit/message. Test máy in/VPN, yêu cầu nhạy cảm, stale, redact, giữ lịch sử sau handoff và UI polling/reload. |
| 40 ID | Giữ ID/scope; thêm 6 phòng ban: Kỹ thuật 14, IT 11, Sản phẩm 6, Vận hành 6, Tài chính 2, Nhân sự 1. 29 scope routine / 9 cần thẩm quyền / 2 bảo mật. Migration transaction đối chiếu batch/profile/role/scope, chỉ điền trường trống; test rollback/idempotency bằng adapter giả. |
| Phiên khách | Không có ô chọn phòng ban/ID. Chọn ngẫu nhiên trong sáu phòng ban, loại trừ lần trước trong tab; ghi rõ trên form và hồ sơ. Reload giữ phiên; mở tab mới khởi tạo tại tab đích, không sửa phiên tab gốc. Storage bị chặn vẫn gửi được, nhưng reload có thể đổi phòng ban. Enum được server kiểm tra, không dùng làm danh tính hoặc cấp quyền. |
| Theo dõi auto | Bộ lọc dựa lịch sử AUTO_APPROVED, có Mongo index; test vẫn tìm thấy sau handoff hoặc hoàn tất. |
| FAQ | VPN/Wi-Fi theo grammar đóng; Dice >= 0,8; 7 ngày; hash template + policy. Hit chạy lại deterministic extraction/policy, trả nguồn cache và evidence của câu mới, không gọi model. Input có scope khác, rủi ro, câu ghép, Verify/fault bỏ qua cache. |
| Sự cố chung | 8 gửi đồng thời local → 8 hồ sơ, 1 nhóm; Mongo đếm hồ sơ bằng một aggregation cho cả danh sách, có test adapter; khác khu vực/loại không gộp. 24 giờ, không gia hạn theo lượt gửi; update+audit atomic, idempotency và version guard. Cập nhật template đến mọi tracker qua polling, không tự đóng ticket. |
| Sentiment | Cảm xúc và nhu cầu trợ giúp tách biệt; không tự tăng ưu tiên. Dedup phản hồi cảm xúc giống nhau, kể cả đổi dấu câu; giữ explicit handoff và policy risk trước sentiment. Số lần báo còn vướng là tự báo cáo. |
| Verify progress | Cam VNG, transform easing, số ca có response thật; khởi tạo/đọc lại không fake phần trăm. E2E giữ response từng ca, xác nhận 0→1/5, lỗi 503 có kiểm soát, tiếp tục 5/5 và reduced motion. Không đổi expected của fixture. |

## Lệnh và kết quả

| Lệnh | Kết quả |
| --- | --- |
| `npm ci` | Hoàn tất từ lockfile, không nâng dependency |
| `npm test` | 1.355 pass, 1 skip; 68 file pass, 1 skip |
| `node --test scripts/identity-demo-roster.test.mjs scripts/identity-demo-rename.test.mjs` | 20 pass |
| `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs scripts/check-docs.test.mjs` | 18 pass |
| `npm run lint`, `npm run typecheck`, `npm run build` | Pass |
| `SUPPORT_E2E_PRODUCTION=true npx playwright test --project=chromium` | 102 pass |
| `SUPPORT_E2E_PRODUCTION=true npx playwright test --project=mobile` | 101 pass, 1 skip (quay video chỉ dành desktop) |
| `npm run test:persistence` | 1 skip: persistenceVerification=NOT_PERFORMED; không có Mongo cô lập |
| `npm run check:docs`, `git diff --check` | Pass (liên kết local và conflict markers; không kiểm tra URL ngoài/anchor) |
| `npm audit --omit=dev` | 0 advisory runtime |
| `npm audit --json` | 7 high trong dependency dev; command báo advisory, không coi là pass. Dependency tree không đổi |

E2E chạy build production **local** ở 127.0.0.1:3227, provider mock, storage
memory-demo; không phải inference Luna thật hay Mongo durability.
Regression mới: `tests/batch-support.test.ts` (29 ca),
`tests/guest-session.test.ts` (9 ca), `tests/e2e/batch-support.spec.ts` (4 ca),
`tests/e2e/guest-support.spec.ts` (4 ca mỗi thiết bị) và Verify progress/loading.
Có regression cho polling sự cố đến chậm: không được ghi đè trạng thái/hồi đáp
của phiên bản hồ sơ mới hơn; cập nhật nhóm cùng phiên bản vẫn hiển thị.

Lượt chẩn đoán đầu phát hiện dedup dấu câu chưa đúng và selector test chưa chuẩn
hóa mã khu vực; đã sửa. Hai assertion nguồn trong E2E cũ được cập nhật cho tính
năng cache có chủ đích, kèm kiểm tra kind/TTL/similarity và giữ nguyên kỳ vọng
decision, policy, safety, input. README giữ tên/ID/job ở đúng thứ tự tương thích.
Không sửa nhãn benchmark để làm test đạt.
Lượt E2E tin nhắn/progress đầu đạt 10/12; hai lỗi còn lại là selector
“Bộ kiểm thử” khớp cả select và tên vùng progress mới. Đã đổi tên vùng thành
“Tiến độ Verify”; giữ nguyên kiểm tra khóa điều khiển khi tải.
Lượt chạy gộp hai project trên một server đạt 198 pass, 1 skip, 1 fail:
mobile Verify nhận HTTP 429 từ luồng gọi API nội bộ sau các bộ desktop.
Trace giữ đúng lỗi rate limit. Không tăng/bỏ giới hạn hoặc đổi expected;
lượt nghiệm thu chạy từng project với server riêng như workflow QA.

## Giới hạn và việc vận hành còn lại

- Chưa gọi Luna thật/kiểm thử deployment Production cho các tính năng mới.
  Push GitHub không phải bằng chứng Vercel đã chạy đúng commit.
- Chưa chạy migration phòng ban trên Mongo Production. Operator chạy lệnh
  `--sync-departments` trong [RUNBOOK](../RUNBOOK.md#bổ-sung-phòng-ban-cho-40-id-hiện-có)
  với biến môi trường an toàn, lưu receipt và xác minh session trả phòng ban.
- Mongo concurrency/index/restart thật chưa được chứng minh trong lượt này.
  Transaction department dùng fake adapter; không gọi đó là kiểm thử Mongo live.
- FAQ hiện chỉ bao phủ câu VPN/Wi-Fi công khai trong grammar đóng, không semantic
  cache mọi câu. Mật khẩu Wi-Fi/secrets không được cache hay phát cho nhóm.
- Gộp sự cố yêu cầu mô tả đóng + mã khu vực tường minh; không suy ra cùng văn phòng.
  Cập nhật chung là ba mẫu tiến độ server, không broadcast nội dung tự do.
  Danh sách nhóm tối đa 50 nhóm mở mới nhất; mọi hồ sơ vẫn tra cứu riêng.
- Đây chưa phải kiểm chứng tải 3.000 người, chống DDoS đa instance hoặc tỷ lệ tiết
  kiệm latency thực tế. Không đổi rate limit, model, entitlement hay ngân sách.
- Sentiment không thể chứng minh “chân thành” hoặc “gian dối”. Người gửi vẫn có
  quyền yêu cầu hỗ trợ trực tiếp; không dùng cảm xúc để cấp quyền hay đóng ticket.
- Reviewer công khai/ID-only vẫn là demo; không phải SSO/team RBAC production.
  Không có email/push notification. Không có dữ liệu hoặc feedback người thật mới.
- Full audit vẫn còn chuỗi toolchain Tailwind/ESLint → braces
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
  npm đề xuất đổi major Tailwind hoặc hạ eslint-config-next; không tự áp dụng
  migration framework vào lượt sửa tính năng này. Runtime audit không có advisory.
