# Gửi tin nhắn từ nhân viên hỗ trợ

Base commit: `25e3c393d29c9b081be893495d6deb7c415b5d85`.

Hợp đồng duyệt đã cập nhật theo yêu cầu mới: **Duyệt yêu cầu** dùng được với mọi hồ sơ đang chờ nhân viên hoặc chờ bổ sung. Nhân viên bấm duyệt sẽ chuyển trạng thái sang `APPROVED_BY_HUMAN`; không cần nhập tin nhắn hoặc chờ AI. Policy và dữ kiện ban đầu vẫn giữ nguyên. Viết/gửi lời nhắn không tự duyệt hồ sơ. Xem [hợp đồng duyệt thủ công](HUMAN-REVIEW-APPROVAL.md).

Nút **Gửi cho người gửi** gửi nội dung trong ô **Tin nhắn cho người gửi**, dù được chọn từ gợi ý hay tự nhập. Thao tác giữ nguyên trạng thái và quyết định policy. **Gửi yêu cầu bổ sung** vẫn là thao tác riêng, chuyển sang `NEEDS_INFORMATION` để người gửi bổ sung rồi phân tích lại. Hướng dẫn và bản nháp vẫn chỉ gửi khi nhân viên bấm nút xác nhận.

## Hợp đồng

- `POST /api/review/:id`: `{ version, action: "SEND_MESSAGE", reason }`. Tin nhắn được trim, dài 1–2.000 ký tự và đi qua redaction hiện có.
- Chỉ gửi khi trạng thái là `AUTO_APPROVED`, `NEEDS_INFORMATION`, `ESCALATED` hoặc `APPROVED_BY_HUMAN`. Hồ sơ chưa phân tích xong/đã kết thúc không nhận tin mới qua thao tác này.
- API giữ quyền reviewer demo, kiểm tra origin, rate limit và version. Gửi tin không gọi AI hoặc thực thi thay đổi hạ tầng.
- Một lần cập nhật atomically tăng version và thêm event `SEND_MESSAGE`, gồm actor, thời điểm, trạng thái trước/sau giống nhau và `senderMessage`. Policy, canonical facts và lịch sử hướng dẫn không đổi.
- Trang theo dõi đọc `senderMessage` từ lịch sử, tự cập nhật khi tab đang mở/online và giữ tin sau reload. Đây là gửi trong ứng dụng, không có email, push notification hoặc xác nhận đã đọc.
- Ô soạn chỉ xóa khi server xác nhận thành công; lỗi giữ nội dung. Hai lần gửi cùng version chỉ một lần được lưu; lần còn lại trả conflict và cần tải lại hồ sơ.

## Phạm vi thay đổi và kiểm chứng

Thay đổi giới hạn ở domain review action, service review, giao diện reviewer, tài liệu sử dụng và regression tests. Giữ nguyên Ground Truth, policy và cấu hình triển khai.

`tests/reviewer-messages.test.ts` kiểm tra lưu/đọc tin, trạng thái và policy không đổi, duyệt thủ công độc lập với gửi tin, phiên bản, redaction, giới hạn nội dung, hồ sơ đã đóng và quyền API. `tests/e2e/reviewer-messages.spec.ts` kiểm tra chọn gợi ý/tự soạn mà không tự duyệt, polling/reload bên người gửi, gửi lỗi và thử lại trên desktop/mobile.

Kết quả lịch sử của thay đổi gửi tin nhắn (trước cập nhật duyệt thủ công):

- `npm test`: 1.503 pass, 1 skip; chạy ngoài Windows sandbox sau khi lượt trong sandbox bị chặn ghi cache Vitest (`EPERM`, chưa chạy test).
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:docs` và `git diff --check`: đạt.
- Ba bộ script `mongo-smoke-guard`, `development-report`, `check-docs`: 18/18 đạt.
- E2E production build, bốn bộ `reviewer-messages`, `batch-support`, `it-review`, `ux-review`: desktop 11/12 đạt ở lượt đầu; ca còn lại lỗi locator trùng với Next.js route announcer, sửa locator và chạy lại đạt 1/1. Mobile đạt 12/12. Không đổi nội dung kỳ vọng.
- `npm run test:persistence`: skip do chưa cấu hình MongoDB thử nghiệm riêng; không kết nối MongoDB.

Triển khai và kiểm thử có hỗ trợ AI (Codex). Dữ liệu kiểm thử là giả lập local với provider mock và bộ nhớ tạm; không phải kiểm chứng AI/MongoDB hoặc gửi tin trên Production. Không suy ra human review từ Git identity.
