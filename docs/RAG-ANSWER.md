# Duy Anh — câu trả lời, cache và ranh giới nguồn

## Đọc theo thứ tự

1. `src/domain/answer-safety.ts`: phát hiện một số instruction attack và nhận ra câu hỏi cần policy nội bộ. Đây là defense in depth, không là chứng minh miễn nhiễm injection.
2. `src/domain/text.ts`, `conversation.ts`: NFKC/zero-width normalization cho kiểm tra, không xóa raw input; policy vẫn có quyền cuối. Benign override được nhận diện vẫn có thể trả lời; nội dung nguy hiểm phía sau vẫn xét risk.
3. `src/lib/answer-cache.ts`: shared cache chỉ cho danh sách đóng các câu hỏi công khai, không có follow-up/PII. SHA key theo question/model/policy/corpus; HMAC bằng server key, TTL một giờ, giới hạn memory 100, Mongo TTL, gom request trùng trong cùng process. Production không có app-level daily model-call cap; request vẫn chịu rate limit của API intake và quota/rate limit của provider. Không hứa gom request giữa nhiều Vercel instances.
4. `src/lib/conversation-model.ts`: fallback dùng cùng ranker, validate evidence quote đúng article/web text, chỉ hiển thị source thuộc knowledgeIds đã dùng. Hosted web text có instruction pattern bị loại. Cache đọc lại vẫn revalidate.
5. `src/domain/contracts.ts`, `src/components/answer-bubble.tsx`: fields optional cacheHit/generatedAt/evidence/scopeNotice, API cũ vẫn đọc được. UI nói rõ câu trả lời được dùng lại hoặc thiếu policy nội bộ.
6. `tests/rag-answer.test.ts`, `tests/conversation.test.ts`, `tests/e2e/rag-policy.spec.ts`: grounding, nguồn giả, unicode/role spoof, cache/TTL/key rotation, budget, no-human-handoff và UI.

## Điều đã khắc phục và điều chưa thể khẳng định

- Một ID/URL hợp lệ không còn đủ: quote phải tồn tại trong tài liệu đã retrieval. Quote này là bằng chứng nguồn, không phải chain-of-thought.
- Việc quote đúng chưa chứng minh toàn bộ lời diễn giải được suy ra đúng. Cần đánh giá faithfulness bởi người review; không gọi validation này là fact-check tuyệt đối.
- Câu hỏi số ngày nghỉ/quota/quyền cá nhân nhận hướng dẫn xác định kèm boundary, không gọi model/web để đoán và không chuyển reviewer tự động. Chưa có policy nội bộ thật trong public demo.
- Câu hỏi công khai lặp lại trong allowlist có thể dùng cache đã ký; lỗi model/provider vẫn fallback rõ nguồn. Câu hỏi mới ngoài cache gọi model khi đủ cấu hình; không hứa AI luôn sẵn sàng.
- Model output safety vẫn là các lớp schema/risk/pattern. Thêm adversarial regression không bảo đảm chặn mọi cuộc tấn công; không mở tool thực thi.
- Không gọi OpenAI/Mongo production trong QA gói này. Các kết quả live cũ của main không phải bằng chứng live cho code mới.

## Review và kiểm thử

Thành viên tự giải thích cache key/signature, xác nhận không có raw personal input trong cache, thử đổi model/expiry/key, thêm attack case của mình. Ghi kết quả thật và phần chỉnh sửa thực tế, không chỉ đổi git author của code AI.

`npm test -- tests/rag-answer.test.ts tests/conversation.test.ts`; `npm run test:e2e -- tests/e2e/rag-policy.spec.ts`.

Policy candidate 5.1 invalidates previews produced by 5.0; ask the user to preview again before submitting stale decisions.
