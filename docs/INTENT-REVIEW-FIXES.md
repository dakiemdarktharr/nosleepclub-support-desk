# Rà soát nhận diện ý định và hội thoại

Base GitHub main: `a4f7ff2a1e15b0defa411b189fbe1d2bd3883095`.
Thực hiện có AI assistance trong worktree riêng; không suy ra human review.

## Phạm vi và contract trước sửa

Giữ model chính nhận diện freeform, kể cả câu kể không có dấu hỏi. Giữ deterministic policy là authority, sentiment sau câu trả lời, các API và Verify. Không gọi model trả phí hoặc Mongo production.

Các lỗi đã tái hiện bằng 5 regression mới, đều thất bại trên base:

1. `continueConversation` nối ngữ cảnh và câu mới bằng dấu cách. Phủ định ở cuối câu trước có thể vô hiệu dấu hiệu rủi ro của câu mới. Ví dụ giả lập: “Hướng dẫn sử dụng cloud, không” rồi “mở public port 3389” mất `PUBLIC_EXPOSURE`. Contract: nếu câu mới có rủi ro hoặc thao tác nghiệp vụ độc lập, đánh giá riêng câu đó; ngữ cảnh cũ vẫn nằm trong lịch sử/audit.
2. Model trả `conversation` hoặc `work` nhưng vẫn trả nhãn máy in và loại SAFE_DIAGNOSTIC được nhận, dù trái contract trong prompt. Contract: hai route này phải có `serviceGroup=OTHER`, `intentLabel=UNKNOWN_SUPPORT_REQUEST`, `requestKind=OTHER`; sai tổ hợp phải fail safely, không tạo canonical chat/work.
3. Field tùy chọn đã xóa còn key rỗng khiến route work bị từ chối; field rỗng còn ghi đè dữ kiện model có evidence. Contract: loại field rỗng/chỉ khoảng trắng khỏi dữ liệu phân tích; không bỏ field đã điền, metadata nhân viên vẫn giữ trong input lưu trữ.

Không chỉnh fixture Ground Truth hoặc kỳ vọng policy gốc để làm test đạt. Kết quả model trong regression được tiêm vào, không phải đánh giá độ chính xác OpenAI thật.


## File và hành vi sau sửa

- src/services/conversation.ts: câu tiếp nối có risk hoặc yêu cầu thao tác được đánh giá độc lập. Câu chat an toàn vẫn giữ ngữ cảnh; originalQuestion, phản hồi và audit được bảo toàn.
- src/services/support.ts: bỏ field rỗng/chỉ khoảng trắng khỏi analysisInput; dùng cùng input này để kiểm tra route work mock. Không sửa input gốc đã lưu.
- src/lib/support-model.ts: kiểm tra tổ hợp route/catalog; prompt ghi rõ tên từng field để tránh nhầm thứ tự.
- src/domain/policy-source.ts: version support-guidance-v5.7 vô hiệu preview và khóa answer cache cũ. Không đổi nội dung rule hoặc precedence.
- tests/model-intent-routing.test.ts và tests/conversation.test.ts: thêm tổng cộng 6 unit/integration regression, gồm kiểm tra mock nhất quán, input không bị sửa và lịch sử câu hỏi gốc còn nguyên.
- tests/e2e/conversation.spec.ts: thêm luồng từ UI hỏi tiếp đến API/audit, kiểm tra PUBLIC_EXPOSURE và SECURITY_RISK trên desktop/mobile.
- tests/security-control-bypass.test.ts và tests/support-api.test.ts: chỉ đồng bộ version kỳ vọng từ v5.6 sang v5.7; giữ nguyên action, bucket và rule kỳ vọng.
- RUNBOOK.md và docs/MODEL-INTENT-ROUTING.md: cập nhật vận hành và giới hạn của bản sửa.

## Kiểm tra local

- npm test: 589 bài đạt, 37 file; 1 bài benchmark opt-in/1 file skip theo cấu hình sẵn có. Không đo lại benchmark hoặc gọi OpenAI.
- npm run lint, npm run typecheck, npm run build: đạt. Build cũng kiểm tra lint/types trên source cuối.
- node --test scripts/mongo-smoke-guard.test.mjs: 11/11 đạt.
- SUPPORT_E2E_PRODUCTION=true npm run test:e2e -- --project=chromium: 62/62 đạt; chạy tiếp --project=mobile: 61 đạt, 1 bài quay video chỉ dành desktop được skip. Tổng cộng 123 E2E đạt.
- git diff --check: đạt.
- SHA-256 của 305 file sửa/chưa track ở checkout gốc trùng snapshot đầu lượt; không nhập các thay đổi đó vào worktree này.

Unit test dùng output model tiêm vào; E2E dùng production build local, AI mock, memory-demo và server riêng 127.0.0.1:3227. Mongo/OTP/model keys không được dùng. Build hoàn tất trước E2E; desktop và mobile chạy tuần tự, mỗi lượt khởi động server riêng.

## Giới hạn còn lại

Chưa kiểm thử API OpenAI thật, độ chính xác nhận diện trên dữ liệu mới, token/chi phí/latency thật hoặc Mongo production. Model trả quote đúng vẫn có thể hiểu sai nghĩa; bộ kiểm tra này phát hiện mâu thuẫn cấu trúc, không chứng minh phân loại ngữ nghĩa đúng. Câu nhiều mệnh đề vẫn có thể bị chuyển reviewer thận trọng theo thiết kế hiện hành. Không đổi Ground Truth, không nâng cap/reset counter và không deploy thủ công. Push thành công không chứng minh Vercel chạy đúng commit.
