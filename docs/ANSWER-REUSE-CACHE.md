# Cache câu trả lời và hướng giải quyết

## Hợp đồng

- Đầu vào: yêu cầu mới đã kiểm tra/redact, facts của chính yêu cầu đó và quyết định policy hiện hành.
- Đầu ra: câu trả lời cùng các bước giải quyết đã lưu, hoặc chạy luồng tạo câu trả lời bình thường khi không khớp/hết hạn/cache lỗi.
- Bốn nhóm FAQ VPN/Wi-Fi/máy in dùng grammar cùng đối tượng và triệu chứng. Cache lưu nội dung trả lời thực tế, không chỉ hash mẫu.
- Hướng dẫn có ngữ cảnh công khai như VPN trên Windows/macOS hoặc lỗi timeout có khóa riêng theo triệu chứng và nền tảng. Không dùng phần trăm trùng từ để bỏ qua dữ kiện khác.
- Bản trả lời được kiểm tra trước khi lưu và mỗi lần dùng lại; TTL 7 ngày. Policy, intake, mẫu hướng dẫn, provider hoặc model đổi sẽ vô hiệu hóa cache tương ứng.
- Cache chỉ chứa hướng dẫn đọc/kiểm tra an toàn. Không chia sẻ PII, tên tài nguyên riêng, quyền, approvals, secrets, yêu cầu nhiều việc, câu chưa rõ hoặc phản hồi tiếp tục xử lý lỗi. Verify/fault injection được cách ly.
- Luôn dựng facts, evidence và quyết định cho yêu cầu mới; không sao chép trạng thái hoặc audit của người gửi cũ. Cache hit có provenance riêng, không ghi như một lượt gọi model mới.

## Lưu trữ và kiểm chứng

FAQ dùng `v3_support_shared_faq`; câu trả lời AI có ngữ cảnh dùng `v3_support_guidance_cache` với chữ ký server và Mongo TTL. Dùng cấu hình Mongo Support hiện có. Khi Mongo lỗi coi là miss; không tạo kho fallback Production. Chế độ local không Mongo chỉ có bộ nhớ trong process.

Kiểm thử phải chứng minh nội dung và các bước cũ được trả lại, không gọi model khi cache đủ điều kiện trúng, tách khác triệu chứng/nền tảng, TTL/invalidation, cache bị sửa, lỗi lưu trữ và giữ handoff/follow-up. Dữ liệu kiểm thử và HTTP model đều giả lập; không suy ra chi phí hoặc độ trễ Production từ số đo local.
