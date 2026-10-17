# Duyệt thủ công hồ sơ hỗ trợ

Base: `19d526910c62b9ef1798c9fcae4a888c40b5f900`. Phạm vi: nút duyệt, API cập nhật hồ sơ, audit và kiểm thử.
Tích hợp thêm commit sentiment `e3bff3e` từ GitHub main trước khi kiểm tra và commit thay đổi này.


## Thay đổi nghiệp vụ

Theo yêu cầu trực tiếp của người dùng, khi hồ sơ đã chuyển cho nhân viên, **Duyệt yêu cầu** luôn khả dụng ở hai trạng thái `ESCALATED` và `NEEDS_INFORMATION`. Thiếu dữ kiện, cảnh báo bảo mật, vượt thẩm quyền hoặc bản nháp Luna chưa xong không khóa thao tác duyệt. Đây là thay đổi có chủ đích của hợp đồng human review cũ; expected của các test review được cập nhật theo hợp đồng này. Ground Truth, quyết định tự động và policy không đổi.

## Hợp đồng

- `POST /api/review/:id` nhận `{ version, action: "APPROVE", reason?: string }`. Không bắt buộc nhập tin nhắn; mặc định gửi “Nhân viên hỗ trợ đã duyệt yêu cầu.”.
- Ghi nguyên tử trạng thái `APPROVED_BY_HUMAN`, tăng version và một audit `APPROVE` với actor, thời điểm, trạng thái trước/sau, giải thích duyệt thủ công và tin nhắn đã redact. Trang theo dõi đọc lại trạng thái và tin nhắn đã lưu.
- Giữ nguyên canonical facts, decision, rule IDs, evidence, missing fields và approval status do policy đánh giá. Nhân viên duyệt hồ sơ không tạo bằng chứng xác minh DBA/IAM, không gọi model hay thực thi thay đổi hạ tầng.
- Hoàn tất mô phỏng (`FULFILL`) và điều chỉnh trạng thái (`OVERRIDE`) giữ các guard dữ kiện/thẩm quyền/bảo mật. Duyệt hồ sơ không tự đánh dấu đã giải quyết.
- Quyền truy cập reviewer hiện có, kiểm tra version, origin, schema và rate limit vẫn áp dụng. Khi đang lưu thao tác thì khóa nút tạm thời để tránh gửi trùng; sau khi đã duyệt hoặc đóng thì không duyệt lặp. Hai tab cùng version chỉ ghi được một lần.
- Bản nháp hỏi thông tin trả về muộn sau khi duyệt bị bỏ qua. Soạn/chọn bản nháp và gửi tin nhắn không tự duyệt hồ sơ.

## Kiểm thử

- [API và service](../tests/reviewer-approval.test.ts): thiếu dữ kiện, bảo mật, vượt thẩm quyền, yêu cầu người hỗ trợ, handoff, trạng thái người gửi, audit duy nhất, retry, hồ sơ đã đóng và quyền API.
- [Trình duyệt](../tests/e2e/reviewer-approval.spec.ts): duyệt với ô tin nhắn trống, reload, trang người gửi, duyệt khi Luna đang soạn và bỏ qua bản nháp cũ, trên desktop/mobile.
- Các regression review workflow, judge feedback, intake boundary và reviewer messages tiếp tục kiểm tra policy/risk không đổi và fulfillment còn bị chặn khi chưa đủ điều kiện.

Triển khai và kiểm thử có hỗ trợ AI (Codex). Dữ liệu synthetic, provider mock và bộ nhớ local; không suy ra kiểm chứng model live, MongoDB hoặc human review từ kết quả hay Git identity.
