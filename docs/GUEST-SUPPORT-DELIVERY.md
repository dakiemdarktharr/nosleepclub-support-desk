# Luồng hỗ trợ khách và cấu hình identity — 08/10/2026

Base: b0abeb3ca90327bbefd33a2aa2b0f3f076ad1427 (GitHub main được kiểm tra lại).
Thực hiện trong worktree mới guest-support-entry, detached và sạch trước sửa.
Workspace gốc/những worktree cũ không được stage hay tích hợp. AI assistance: Codex.

## Phạm vi

- Trang đầu và form login có nút “Đăng nhập không cần tài khoản”, dẫn /guest.
- Dùng chung form Support để giữ preview, xác nhận lưu, hội thoại, theo dõi và
  chuyển nhân viên; khách không có ô ID/phòng ban hoặc lựa chọn vai trò nhân viên.
- Server lưu requesterMode=guest, bỏ metadata nhân viên từ client, không sử dụng
  cookie identity cũ cho intake khách. Audit hành động người gửi ghi actor guest.
- Policy/safety/authority/approval không đổi. Khách không được cấp tài khoản,
  role IT, quyền danh bạ hoặc quyền thực thi hạ tầng. Verify input không được
  gắn requesterMode guest để vượt kiểm tra fixture.
- Luồng nhân viên/Verify cũ giữ nguyên; assertion số link trang đầu đổi 2 → 3
  theo yêu cầu mới, không sửa Ground Truth/expected quyết định.
- Identity adapter trim cấu hình, trả lỗi 503 chung cả khi URI sai định dạng;
  không lộ URI, không fallback sang CSV/memory. Mẫu cấu hình và hướng dẫn được bổ sung.

## MongoDB trên web

Kiểm tra metadata tên biến Vercel, decrypt=false: Production có MONGODB_URI,
nhưng không có IDENTITY_MONGODB_DB. Không đọc/in credential. Chủ repo chọn
database riêng vng_support_identity; không thay database Support.

Đã thêm IDENTITY_MONGODB_DB=vng_support_identity cho target Production trên
Vercel và đọc lại metadata xác nhận đúng tên/target/giá trị không bí mật.
Không thay URI hay MONGODB_DB của Support. Deployment mới sẽ nhận biến này.

Tên database không tự tạo nhân viên/profile. Bootstrap IT cần danh tính/kênh
đã xác minh và OTP relay theo RUNBOOK. Không chạy bootstrap, cấp tài khoản,
gửi OTP hoặc sửa/xóa dữ liệu production trong lượt này. Chưa kiểm chứng transaction,
Mongo restart hoặc quyền truy cập database bằng một thao tác dữ liệu thật.

## Kiểm tra

Local Windows, provider mock, budget 0, memory-demo; Mongo/OTP URI/key rỗng.
Bước full checks đầu bị ENOSPC; chỉ xóa node_modules vừa cài trong worktree mới
rồi dùng junction tới dependency cùng lockfile đã có. Không xóa file người dùng.
Checks chạy lại sau khi khắc phục; lockfile/dependency không thay đổi.

- npm test: 635 pass, 1 skip (benchmark opt-in), 40 file pass/1 skip.
- node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs: 15 pass.
- npm run lint, npm run typecheck: PASS.
- npm run build: PASS, gồm route /guest và hướng dẫn trong app.
- E2E lần đầu phát hiện tour sender-result bị ngắt trong lúc tải request.
  Đã sửa giữ stage trong trạng thái tải như luồng cũ; không đổi assertion tour.
- SUPPORT_E2E_PRODUCTION=true npm run test:e2e -- --project=chromium: 69 pass.
- SUPPORT_E2E_PRODUCTION=true npm run test:e2e -- --project=mobile: 68 pass,
  1 skip quay video chỉ dành desktop. Build và E2E chạy tuần tự tại port3227,
  không tái dùng server cũ. Đã xem ảnh giao diện desktop/mobile local.
- Benchmark development hiện có: 56/128; không đổi GT/policy hay nhận là held-out.
- Regression mới: preview/save/readback không identity Mongo, cookie cũ, metadata
  giả mạo, cấm guest gắn Verify, confirmation, danh bạ, sensitive input và follow-up.
- Runtime artifacts/screenshots/logs không commit. Không gọi model có phí.

CI/deployment và test local là các loại bằng chứng riêng. Thêm tên biến môi trường
không tự chứng minh identity production hoạt động đầy đủ.
