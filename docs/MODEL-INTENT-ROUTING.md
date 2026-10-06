# Nhận diện ý định freeform bằng model chính

Bổ sung `support-guidance-v5.7`: route `conversation`/`work` chỉ hợp lệ cùng `serviceGroup=OTHER`, `intentLabel=UNKNOWN_SUPPORT_REQUEST`, `requestKind=OTHER`; server từ chối output mâu thuẫn. Ô tùy chọn đã xóa không ghi đè evidence hoặc làm lỗi route. Câu tiếp nối có rủi ro/thao tác được đánh giá độc lập với ngữ cảnh cũ. Bằng chứng sửa lỗi tại [INTENT-REVIEW-FIXES](INTENT-REVIEW-FIXES.md); số đo v5.6 bên dưới là lịch sử, không phải số đo lại của v5.7.

## Luồng và quyết định

Trước thay đổi, `extractIntake()` trong `src/domain/text.ts` dùng các mẫu chữ để gắn service/intent. `analyze()` trong `src/services/support.ts` cho `workEvidencePlan()` và `conversationRoute()` chọn nhánh trước model. `extractWithModel()` trong `src/lib/support-model.ts` chỉ gọi model cho một số ticket, rồi từ chối hướng dẫn tự động nếu baseline là `UNKNOWN_SUPPORT_REQUEST`. Ví dụ câu kể “The print queue is stuck on my workstation” không khớp mẫu máy in và không được model mở đường hướng dẫn.

Với `AI_PROVIDER=openai`, freeform đã redact đi qua một lần gọi `AI_MODEL` để nhận diện. Output theo Zod strict gồm route `support|conversation|work`, nhãn thuộc catalog, loại yêu cầu, entities, risk signals, missing fields, ambiguities, và `intentEvidence` trích nguyên văn kèm evidence cho `intentLabel`. Server kiểm tra nhãn, field, quote, entity, môi trường và redaction; risk được hợp nhất với baseline và tính lại từ nhãn/dữ kiện. Model không trả quyết định policy. Kết quả mơ hồ, thiếu quote, sai schema hoặc lỗi gọi model chuyển reviewer. Sau đó deterministic policy quyết định; chỉ nhánh `AUTO_APPROVE` dạng hướng dẫn mới gọi model lần hai để trả lời. Câu trả lời vẫn qua kiểm tra knowledge/source, prose và safety sẵn có.

`AI_PROVIDER=mock` giữ bộ phân loại cũ để test/demo offline, được gắn nguồn `mock`; đây không phải bằng chứng model thật nhận diện đúng. Structured form tiếp tục đi thẳng vào policy. Các risk guard có thể dừng ticket nguy hiểm trước khi gọi model. Trường hợp “reset máy” đã khớp `DEVICE_RESET_GUIDANCE` vẫn hỏi rõ restart hay factory reset bằng `INFO-RESET`, vì tự suy diễn ở đây có thể gây mất dữ liệu. Regex trong `conversationEligible()` chỉ từ chối route chat khi có thao tác/quyền hoặc dấu hiệu tấn công; nó không chọn nhãn hội thoại. `workEvidenceForKind()` dùng loại công việc do model trả về, chỉ trích path/dòng để hỏi artefact chính xác. Phân đoạn subrequest và risk từ input được giữ nguyên khi chuyển canonical; nhiều mệnh đề có thể bị chuyển reviewer thận trọng, kể cả câu phủ định không nguy hiểm.

## Phương án

| Phương án | Độ trễ và chi phí | Điều kiện an toàn |
| --- | --- | --- |
| Hai lần gọi: nhận diện, policy, rồi trả lời | Ticket được hướng dẫn có thêm một round trip model; ticket bị chặn chỉ tốn lần nhận diện hoặc không gọi. Prompt trả lời chỉ chạy với route, evidence và policy đã xác nhận. | Phù hợp kiến trúc retrieval và kiểm tra câu trả lời hiện có. |
| Một lần gọi cả nhận diện và bản nháp | Tiết kiệm một round trip khi được trả lời, nhưng sinh bản nháp cả cho ticket bị chặn. Muốn dùng nguồn knowledge/web phải retrieval trước khi biết route hoặc bỏ kiểm tra nguồn hiện tại. | Bản nháp phải bị bỏ sau policy và kiểm tra evidence/prose; đổi luồng này có thêm rủi ro lộ nội dung không đủ bằng chứng. |

Chọn hai lần gọi. Không có API key trong môi trường local nên chưa đo được độ trễ/chi phí OpenAI thật. Kỳ vọng latency của ticket an toàn tăng xấp xỉ một lần gọi nhận diện; không đưa ra ngưỡng mili giây production khi chưa có baseline thật. Preview hợp lệ được cache 10 phút và submit dùng lại canonical/answer; version `support-guidance-v5.6` vô hiệu preview cũ. Không retry ở adapter model.

## Số đo local

Windows, Node bundled, Next 15.5.25, synthetic input, mock/memory. `node scripts/measure-support-latency.mjs` trên Next dev tại `127.0.0.1:3227`, 5 warmup, 15 tuần tự, burst 5: trước sửa p50/p95 preview **20.87/35.44 ms**, sau sửa **30.15/47.11 ms**. Số này gồm HTTP+JSON, dev server và mock, có nhiễu hot reload; không chứng minh thay đổi độ trễ production.

Trong PowerShell, `$env:SUPPORT_INTENT_BENCH='1'; npm test -- tests/intent-stage-benchmark.test.ts --reporter=verbose --silent=false` đo 30 mẫu sau 5 warmup, chạy riêng không có lint/test khác: baseline `extractIntake` **0.034/0.059 ms**, baseline policy **0.008/0.039 ms**, nhận diện model với output injected trả ngay **0.117/0.197 ms**, policy sau nhận diện **0.005/0.013 ms**, tạo câu trả lời chat mock **2.828/3.426 ms** (p50/p95). Các số chỉ là chi phí xử lý local; không chứa thời gian network, suy luận OpenAI, Mongo hay tải production. Đo OpenAI thật bằng synthetic input và giới hạn request trước khi đặt SLO; báo riêng p50/p95 cho nhận diện và trả lời.

## Giới hạn kiểm chứng

Unit tests tiêm output model để kiểm tra hợp đồng và đường policy, không kiểm chứng độ chính xác ngôn ngữ của OpenAI. Chưa gọi API thật, chưa đo token hoặc chi phí thật. Baseline risk/segmenter vẫn có thể từ chối quá thận trọng một câu nhiều mệnh đề. Nếu model phân loại sai mà quote vẫn đúng, server không thể chứng minh tương đương ngữ nghĩa chỉ bằng quote; policy, nhãn an toàn và bộ kiểm tra câu trả lời giới hạn tác động, nhưng cần một bộ đánh giá model thật bằng dữ liệu synthetic đa ngôn ngữ trước phát hành. Không có thay đổi sentiment hậu câu trả lời, triển khai hạ tầng hay production data.
