# UI polish — role entry, login and transitions

Base: 566420802800dc949748800b8c739d25df493050 (GitHub main verified).
AI-assisted implementation; isolated detached worktree; original dirty checkout preserved.

Design: make the VNG mascot the memorable visual, with a large left-aligned Vietnamese headline and exactly two role actions. Move login to /login. Remove the three circled descriptions from entry/login; retain authentication limitations in /help and session status. Keep ID registration/tracking, IT OTP, Support demo, all reviewer/audit/Verify flows.

Palette: white #ffffff, page #fafaf8, ink #202124, muted #60646c, VNG orange #f05a22, readable dark orange #a7360d. Keep Nunito. Use a spacious hero and a narrow login form, not two competing forms/cards. Menus, inputs and control groups share a restrained rounded treatment.

    Header: QR · VNG Support
    [Large headline]          [Existing VNG mascot]
    [Tôi cần hỗ trợ → login]
    [Dành cho nhân viên → review]

    Login: back → home
    [Đăng nhập] [ID] [Đăng nhập]
    [Nhân viên mới?] [Tùy chọn: OTP, guide, tracking, demo]

Brief review: no decorative metrics, fake claims, new font or component library. Public judge demo stays reachable through login options and Verify. Dropdown styling progressively enhances native select, preserving keyboard/form semantics and an OS-native fallback. Reference: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select .

Transitions: route-arrival opacity/short movement with no navigation delay or state remount; local reviewer tab change animates the revealed content. Respect prefers-reduced-motion, cancel interrupted animations, never animate authority or submit actions automatically.

Validation: unit/integration, lint, typecheck, sequential production build then local mock E2E desktop/mobile, plus visual inspection of entry/login/open dropdown. Update UI-specific navigation assertions to the requested new flow; preserve policy Ground Truth.

## Kết quả thực hiện và đối chiếu

- Trang đầu chỉ có hai hành động trong nội dung chính; Tôi cần hỗ trợ mở /login, Dành cho nhân viên mở /review. QR và liên kết thương hiệu giữ ở header.
- Đăng nhập giữ ID, Nhân viên mới?, tùy chọn OTP cho người xử lý ID. Theo dõi đơn, hướng dẫn sử dụng, hướng dẫn demo và trải nghiệm demo nằm trong Hướng dẫn & tùy chọn. Các đoạn mô tả được khoanh trong ảnh đã bỏ khỏi trang đầu/đăng nhập; giới hạn xác thực vẫn có trong hướng dẫn và trạng thái phiên.
- Giữ gửi tự do/danh mục, preview và xác nhận, hội thoại/clarification, theo dõi và phản hồi, reviewer có lý do/audit, Verify bộ gốc và input mới, cấp ID/profile/phạm vi và theo dõi đơn. Không sửa API, policy, RBAC hoặc storage trong lượt UI này.
- RouteTransition tạo chuyển cảnh 220ms; không trì hoãn điều hướng hay remount form. Tab reviewer có chuyển cảnh 160ms. Reduced motion tắt các chuyển động này.
- Dropdown dùng select native với base-select ở trình duyệt hỗ trợ; bo góc, nền trắng, dấu chọn và focus bàn phím rõ. Trình duyệt khác giữ menu native. Không thêm dependency, font hay bộ component.

Phạm vi file: trang đầu, /login mới, layout, header, RouteTransition, CSS chung; liên kết đăng nhập trong identity-ui/identity-review; /help, JudgeGuide, README, RUNBOOK và JUDGE-ONBOARDING; sáu spec điều hướng được cập nhật và spec ui-polish mới. Không stage ảnh, video, JSON đánh giá hoặc submission sinh bởi kiểm thử.

### Kiểm tra local tại thay đổi này

- npm test: 561 bài đạt, 36 file.
- node --test scripts/mongo-smoke-guard.test.mjs: 11 bài đạt.
- npm run lint, npm run typecheck, npm run build: đạt; lint/typecheck/build đã chạy lại sau chỉnh sửa dropdown/hướng dẫn.
- SUPPORT_E2E_PRODUCTION=true npm run test:e2e: 121 bài đạt (61 desktop, 60 mobile), 1 skip bài quay video chỉ dành desktop. Production build local, server riêng 127.0.0.1:3227, mock provider và memory-demo cho Support; Mongo/OTP/model thật không cấu hình. Build và E2E chạy tuần tự.
- Sau khi bổ sung kiểm tra opacity của popup trước chụp hình: chạy riêng ui-polish.spec.ts, 6/6 đạt. Có kiểm tra bàn phím, Escape, giữ nội dung form, browser Back, reduced motion, hai lựa chọn vai trò và các công cụ phụ.
- Lần E2E đầu phát hiện assertion cũ đòi scrollY=0 dù nút mở hướng dẫn đã chuyển xuống disclosure. Test hiện đối chiếu vị trí cuộn trước/sau khi cuộn nội dung modal, vẫn kiểm tra khóa cuộn nền. Không thay Ground Truth hoặc expected của policy.
- Đã xem ảnh trang đầu, login và dropdown mở trên desktop/mobile. Qua ảnh đã sửa display:block cũ làm mũi tên select xuống dòng; dropdown cuối cùng căn cùng hàng, menu đọc rõ. Ảnh chụp đợi popup hoàn tất chuyển cảnh để tránh ghi trạng thái opacity trung gian.
- Bài responsive kiểm tra các route, bao gồm /login và /identity/new, ở 320×568, 390×844, 844×390 không tràn ngang.
- Đối chiếu SHA-256: 305 file thay đổi/chưa track của checkout gốc giữ nguyên so với snapshot bàn giao.

### Giới hạn bằng chứng

Đây là kiểm thử Chromium desktop/mobile giả lập và kiểm tra ảnh local; chưa kiểm tra Safari/Firefox hoặc trình đọc màn hình thật. Tùy biến picker là progressive enhancement theo [MDN](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select). Không gọi Mongo production, OTP relay hoặc model có phí; không deploy thủ công và chưa xác nhận Vercel chạy commit mới. ID-only vẫn là phiên demo theo yêu cầu trước, không phải bằng chứng danh tính production. Thay đổi có AI assistance, không tuyên bố human review.
