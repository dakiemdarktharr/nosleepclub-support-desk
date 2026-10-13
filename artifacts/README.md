# Báo cáo kiểm thử và dữ liệu đối chiếu

Thư mục này lưu manifest, báo cáo và ảnh chụp được tạo ở các lần kiểm tra khác nhau. Xem commit, metadata và nội dung từng báo cáo để xác định bản source được kiểm tra; file có trong repository không mặc nhiên là kết quả của HEAD hiện tại.

`migration-baseline-manifest.json` giữ checksum của policy và fixture gốc. Bộ test `tests/support-verify.test.ts` đối chiếu các file trong `mlai26_new/data/` với manifest này. Không sửa expected output hay checksum để che lỗi.

Các lần chạy test có thể cập nhật `e2e-results.json`, báo cáo evaluation, ảnh chụp và video. Kiểm tra diff trước khi commit; không tự đưa timestamp, UUID và output mới vào thay cho bằng chứng cũ.

Cách chạy kiểm tra nằm trong [RUNBOOK](../RUNBOOK.md). Báo cáo Markdown lịch sử đã được dọn khỏi cây thư mục hiện tại và vẫn có thể tra cứu trong lịch sử Git. Thay đổi source có AI assistance; kết quả tự động không xác nhận human review hoặc quyền tác giả.

## Output local và bằng chứng được giữ

`original-fixture-evaluation.json`, `rag-retrieval-evaluation.json`, `e2e-results.json`, ảnh `*-chromium.png`/`*-mobile.png` của test và `verify-persisted.png` được tạo lại khi chạy kiểm thử và đã bỏ theo dõi Git. Không dùng ảnh/JSON của lần chạy trước như kết quả mới. Các mẫu ignore là tên cụ thể, không ẩn manifest hoặc mọi JSON.

Manifest migration và các JSON/ảnh live lịch sử vẫn được giữ; chúng không chứng minh phiên bản hiện tại đang hoạt động. Metrics tổng hợp có phạm vi rõ trong [báo cáo rà soát](../docs/REPO-AUDIT-2026-10-14.md). Raw benchmark chứa nội dung fixture chỉ giữ local sau khi rà soát PII.
