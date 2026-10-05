# Hướng dẫn giám khảo và truy cập bằng QR

## Phạm vi demo hiện tại

Sản phẩm là IT support. Dùng các case synthetic; không nhập dữ liệu cá nhân/credential thật. Hàng đợi Ngoài quy định/Cần thẩm quyền chỉ lọc danh sách, không xác thực team hoặc thông báo đến người thật. Evaluator nhận nhãn do caller khai báo; chưa có bằng chứng held-out độc lập, consent đã xác minh hoặc user study. Redaction chỉ che một số mẫu có nhận diện; Mongo health ping không chứng minh persistence sau restart. Xem [bằng chứng và giới hạn hiện tại](FEEDBACK-EVIDENCE-REVIEW.md), gồm harness local và quyết định quyền reviewer còn cần chủ repo cung cấp.

Các số kiểm thử và base commit ở những phần lịch sử bên dưới chỉ mô tả lần thay đổi tương ứng, không phải kết quả của HEAD hiện tại.

Thay đổi có AI assistance, tiếp nối commit `1ed0954` trên nhánh `codex/evidence-workflow-followup`. Không suy ra human review hoặc deployment từ commit. Checkout gốc có thay đổi chưa commit nên phần triển khai nằm trong worktree riêng; không đưa những thay đổi ngoài phạm vi vào commit này.

## Trải nghiệm

- Trang đầu chỉ hiện hai lựa chọn vai trò. Chọn **Tôi cần hỗ trợ** → **Hướng dẫn & tùy chọn** → **Hướng dẫn demo**, hoặc vào luồng Support/reviewer lần đầu để mở popup trắng bo tròn, viền cam, minh họa SVG với mũi tên đỏ; nội dung cuộn bên trong và nút **Đã hiểu** luôn ở cuối khung. Popup giữ focus bàn phím và khóa cuộn trang phía sau.
- Chọn **Tôi cần hỗ trợ**: mũi tên chỉ chế độ, ô chọn **Phòng ban**, danh mục, các ô nhập, **Gửi**, phản hồi, xác nhận, A/B/C/D, hỏi tiếp và lịch sử. Bước Phòng ban chỉ đánh dấu ô chọn này, không bao quanh hoặc trỏ vào trường mã nhân viên. Cả phòng ban và mã nhân viên đều bắt buộc trước khi gửi preview; mã được dùng để liên kết và tra cứu hồ sơ nhưng chưa xác thực danh tính. Để trống Phòng ban không tự chuyển bước. Các bước không có trên giao diện hiện tại được bỏ qua. Nút **Gửi** vẫn chạy preview; bước xác nhận mới lưu hồ sơ.
- Chọn **Dành cho nhân viên**: hướng dẫn lọc danh sách, mở hồ sơ, đọc bằng chứng, nhập lý do, quyết định và kiểm tra nhật ký. Hướng dẫn không tự click, gửi request hoặc phê duyệt.
- Có thể bấm **Tiếp theo** hoặc **Bỏ qua hướng dẫn**. Mỗi vai trò được ghi nhận ngay khi bắt đầu, nên thoát giữa chừng rồi quay lại cũng không lặp.
- Cờ `vng-guide-v1:intro`, `sender`, `reviewer` nằm trong `sessionStorage`. Refresh và quay về trang chọn vai trò không lặp; đóng tab rồi mở link trong tab mới sẽ có hướng dẫn lại. Tab được trình duyệt khôi phục/nhân bản có thể giữ session theo hành vi của trình duyệt. Khi storage bị chặn, bộ nhớ trang là phương án dự phòng, không duy trì qua refresh.

Người gửi có ID đã cấp có thể đăng nhập demo; “Nhân viên mới?” mở đơn cấp ID ba bước, lưu MongoDB và chờ IT duyệt. Luồng này không bắt buộc cho giám khảo dùng Support/Verify. Quyền xử lý ID cần OTP và role riêng, không lấy quyền từ reviewer demo. Xem [hướng dẫn ID](../README.md#đăng-nhập-cấp-id-và-phạm-vi-quyền) và [kết quả bản tích hợp mới](IDENTITY-UX-DELIVERY.md).

## URL / QR

Nút **URL / QR** ở đầu trái header trên mọi trang. Mã tạo ngay trong trình duyệt bằng `qrcode.react`; không gửi URL đến dịch vụ QR bên ngoài. Nội dung luôn là `window.location.origin + '/'`, không chứa mã hồ sơ, query hoặc fragment. Quét bằng camera điện thoại sẽ mở trang chọn vai trò. **Tôi cần hỗ trợ** dẫn tới Đăng nhập; **Hướng dẫn & tùy chọn** chứa hướng dẫn demo và lối vào trải nghiệm không cần tài khoản.

Popup có URL, nút sao chép, mở trang chọn vai trò và đóng. Nếu clipboard bị chặn, ô URL được chọn để sao chép thủ công. URL localhost chỉ hoạt động trên máy đang chạy; quét từ điện thoại cần truy cập bản triển khai hoặc địa chỉ mạng có thể kết nối. Không hardcode URL production và không thay đổi cấu hình deployment.

## Kiểm chứng

Dùng dữ liệu synthetic, model mock và kho memory-demo; không gọi LLM/DB production.

Kết quả tại thay đổi này: lint, typecheck, production build và 323 unit test đạt; E2E desktop 28 đạt, mobile 27 đạt, 1 bỏ qua theo cấu hình vì video demo chỉ ghi trên desktop. `git diff --check` đạt. Đã xem ảnh chụp popup, hướng dẫn và QR ở desktop/mobile. Mức tin cậy cao cho các luồng và kích thước đã kiểm tra; chưa xác nhận bản triển khai hoặc thiết bị vật lý.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
$env:SUPPORT_E2E_PRODUCTION='true'
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=mobile
```

Tùy chọn E2E production chạy bản build tại localhost, giúp tránh biên dịch Next dev đồng thời với trình duyệt trên máy ít RAM. Rate limit vẫn bật; mỗi test sử dụng IP giả lập riêng để mô phỏng khách truy cập độc lập. Chạy từng project với server riêng như trên: Verify còn gọi API nội bộ qua loopback, nên gộp cả hai project quá nhanh có thể chạm giới hạn 30 request/phút của địa chỉ này. Fixture hồi quy ghi nhận khách đã xem hướng dẫn, trong khi bộ `judge-guide.spec.ts` dùng tab mới không có cờ để kiểm tra lần đầu.

Các kiểm tra mới bao gồm:

- Popup cuộn nội bộ, giữ focus, luồng hướng dẫn thực tế cho hai vai trò; quay lại, refresh và đóng/mở tab.
- Giải mã pixel QR bằng `jsqr`, so sánh URL gốc, kiểm tra copy và mở đích quét trong tab mới.
- Không tràn ngang ở 320 × 568, 390 × 844 và 844 × 390 trên trang đầu, gửi, workspace, theo dõi, danh sách/chi tiết reviewer, chi tiết yêu cầu, audit và Verify. Popup QR nằm trong viewport và cuộn được.
- Luồng gửi, hội thoại, bổ sung, chuyển nhân viên, quyết định, audit và Verify chạy trên Chromium desktop và cấu hình điện thoại Pixel 7. Đây là browser emulation, không phải bằng chứng đã kiểm tra mọi điện thoại thật hoặc Safari/iOS.

Ảnh chụp/video và báo cáo có timestamp được tạo cục bộ trong `artifacts/`, `test-results/` và `submission/`; không thay thế bằng chứng release lịch sử trong commit này.

## Hiệu chỉnh mũi tên Phòng ban — 22/09/2026

Base: `cdb40e326a87918de2547bd4d2af93292313ce23`. Sửa có AI assistance: đưa điểm neo từ khung chứa cả Phòng ban/ID sang riêng ô chọn Phòng ban; chỉ tự chuyển bước khi ô bắt buộc có giá trị. Mã nguồn thay đổi tại component thông tin nhân viên, trang workspace và cấu hình/bộ điều khiển hướng dẫn.

Test mới đã tái hiện lỗi trên bản base: khung đỏ bao ô ID và đầu mũi tên không nằm ở Phòng ban. Sau sửa, kiểm tra hình học đầu mũi tên/khung đỏ, resize, thao tác ID và lựa chọn Phòng ban trống đều đạt ở cả hai chế độ gửi; kích thước gồm desktop, Pixel 7, 320 × 568 và 844 × 390. Đã xem ảnh chụp desktop/mobile.

Kiểm tra trên bản sao riêng, mock/memory: 355 unit/integration tests đạt; lint, typecheck và production build đạt; E2E desktop 36 đạt, mobile 35 đạt và 1 ca ghi video bỏ qua theo cấu hình sẵn. `npm audit` báo 0 lỗ hổng. Kết quả này kiểm chứng bản local, không phải xác nhận một deployment Vercel.
