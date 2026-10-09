# Tiến Khoa — quản trị knowledge cho VNG Support

## Vì sao không import web hoặc tài liệu nội bộ thẳng vào Mongo

Demo có reviewer công khai, chưa có phân quyền đọc tài liệu. Chỉ sử dụng kiến thức được phép công khai. Bài viết VNG công khai không chứng minh quyền lợi/quota của một nhân viên. Không tạo chính sách giả để lấp khoảng trống; không gọi đó là chính sách thật. Chưa có tài liệu nội bộ được xác minh trong gói này.

## Quy trình thêm/sửa bài

Xác nhận giải quyết rõ ràng của người dùng tạo một gợi ý tri thức gắn với ticket đã giải quyết, hiển thị trong bộ lọc **Gợi ý tri thức cần rà soát** của reviewer. Nhãn sentiment positive đơn thuần không tạo gợi ý hoặc đóng ticket. Đây chưa phải knowledge được duyệt: không có API public nào ghi trực tiếp câu trả lời AI hoặc nội dung ticket vào corpus/retrieval. Người phụ trách cần kiểm tra nguồn, scope và safety, sau đó biên tập thành revision mới theo các bước bên dưới.

1. Xác định câu hỏi thực tế và nguồn gốc. Có URL gốc, quyền công bố, phạm vi public/project, ngày kiểm tra và người review thật. Không đưa secret/PII vào file hay fixture.
2. Viết hướng dẫn ngắn bằng lời của nhóm, phân biệt thông tin được nguồn hỗ trợ và lời khuyên chung. Nguồn công khai Google không bảo đảm khôi phục được tài khoản; thông tin VNG công khai không là approval.
3. Thêm bài trong knowledge-extra.ts hoặc revision mới trong knowledge.ts. Mỗi ID là một revision bất biến. Không sửa nội dung đã lưu dưới cùng ID: tạo ID mới và thêm ID cũ vào supersededKnowledgeIds khi cần.
4. Chỉ khi có xác nhận được phép công khai mới chuyển tài liệu công ty thành đoạn hướng dẫn public đã review; nếu chưa có, giữ câu trả lời nêu giới hạn. Phân quyền nội bộ thật cần dự án triển khai private và kiểm tra ACL trước retrieval, không nằm trong public demo này.
5. Người thứ hai kiểm tra nguồn, scope, safety và expiry. Ghi tên/ngày review thật trong PR/commit note. File manifest hiện tại là code đã review; public API không được ghi knowledge.
6. Thêm câu thử paraphrase, câu gần giống nhưng không đúng chủ đề, typo và câu ngoài phạm vi. Chạy `npm test -- tests/rag-retrieval.test.ts`, rồi full QA.
7. Khi deployment đã được chủ dự án cho phép: retrieval đầu tiên upsert revision mới; Mongo giữ bản cũ. Chỉ document có nội dung khớp corpus đã review mới được dùng; known ID nhưng answer/URL bị đổi cũng bị loại.

## Khi hết hạn / mất nguồn

Không kéo dài expiry tự động. Kiểm tra lại nguồn rồi tạo revision mới. Bài hết hạn không được lấy; hỏi làm rõ hoặc dùng general guidance rõ giới hạn. Cache answer gói Duy Anh được khóa theo corpus/policy/model; revision thay đổi làm cache key đổi.

## Nguồn tham khảo đã đọc ngày 21/09/2026

- Google recovery: https://support.google.com/accounts/answer/7682439?hl=en
- Google recovery tips: https://support.google.com/accounts/answer/7299973?hl=en
- VNG public people strategy: https://vng.com.vn/news/enterprise/chien-luoc-phat-trien-con-nguoi.html
- GreenNode documentation discovery: https://docs.greennode.ai/ (không được dùng làm chứng cứ quota nội bộ).
- Software/GPU preparation/browser/how-to của gói là hướng dẫn tổng quát do AI soạn và cần thành viên review; không gắn nhãn chính sách VNG hoặc tài liệu nhà phát hành chưa kiểm chứng.


## Storage-boundary fix on base 92d140a

MongoDB generic TypeScript types do not validate stored documents. Before comparing a record to the reviewed corpus, `rankKnowledge` now validates each record and nested source with a runtime schema. Invalid records are skipped independently; one malformed `sources` object cannot discard valid matches from the same query. Returned records contain only validated fields.

The existing exact-content/revision comparison, expiry and review-date checks remain. A structurally valid but edited answer is still rejected. No public write endpoint, corpus revision, policy entitlement or Mongo data migration is added. Malformed documents are not deleted or repaired automatically. Source review and authorized storage remediation remain human tasks.

Tests `knowledge-boundary.test.ts` and `knowledge-storage-boundary.test.ts` use synthetic rows and a fake Mongo boundary. They prove local rejection/filtering behavior, not live Mongo integrity or universal protection. `createConversationAnswer` retains its existing local-corpus fallback for actual storage outages.
