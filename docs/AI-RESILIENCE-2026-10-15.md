# Khôi phục AI và hướng dẫn dự phòng — 15/10/2026

Base tích hợp: `aa19fb82b5321599a881331d12ba418b992c8220` trên main.
Policy mới: `support-guidance-v5.18`. Bản sửa cũ tại base `454497f` được đọc
và tích hợp chọn lọc; không thay các contract quyền/approval/quota của v5.17.
AI assistance: Codex và các agent điều tra, viết code, kiểm thử; đây không
phải phản hồi của người dùng thật hoặc đánh giá held-out.

## Nguyên nhân và hợp đồng sửa

- Production từng trả OpenAI 401; việc có tên provider/model trong health
  không chứng minh inference. Chưa đủ bằng chứng xác định key cũ bị thu hồi,
  sai định dạng hay sai account. Key thay thế được kiểm tra riêng qua kênh
  an toàn; deployment mới và inference mới mới chứng minh khôi phục runtime.
- Wire contract cũ buộc model lặp nhiều hằng định tuyến và giá trị suy diễn.
  Contract strict mới giới hạn từng service/intent/action; server cấp hằng
  dư thừa và lấy entity từ quote literal được kiểm chứng. Không tin model
  tự dịch giá trị. Không nhận quote giả, field sai dịch vụ, field trùng,
  dữ liệu bí mật hoặc nhãn làm mất kiểm tra quyền của yêu cầu gốc.
- DNS khái niệm khác thay DNS/mở port; VPN ngắt kết nối khác xin mở cổng.
  GUIDANCE và SAFE_DIAGNOSTIC chỉ tương đương trên guide đã được policy cho
  phép. Mơ hồ còn lại hỏi thêm; CONFLICT cần dữ kiện mâu thuẫn thật.
- Câu làm rõ restart giữ lịch sử reset; câu mô tả lại đúng triệu chứng
  không thành yêu cầu thứ hai. Yêu cầu độc lập vẫn phải tách. “Nhờ nhân viên
  hỗ trợ” tạo HANDOFF, giữ hướng dẫn và input gốc.
- Prose tùy chọn sai schema, quote, bước hoặc safety được bỏ toàn bộ. Không
  tái sử dụng một phần prose sai trong hướng dẫn dự phòng. Preview,
  clarification và phản hồi tiếp dùng cùng cơ chế.

## Ba tầng dự phòng

| Tầng | Khi nào dùng | Giới hạn và dấu vết |
| --- | --- | --- |
| AI được cấu hình | Lỗi tạm thời timeout, 429, 5xx | Tối đa 2 attempts trong tổng 12 giây mỗi call extraction/prose; tối đa 1.000 completion tokens mỗi attempt. Sentiment vẫn tối đa 1 attempt. Bộ đếm `AI_TEST_MAX_ATTEMPTS` chỉ bảo vệ môi trường test; Production hiện không có hạn mức ngày ở cấp ứng dụng, vẫn chịu quota/rate limit của OpenAI. Không retry 401, refusal, schema/evidence lỗi; không tự đổi model/credential. Chưa có model phụ riêng được xác minh. |
| Hướng dẫn server | Tác vụ chỉ đọc được xác định độc lập, đủ dữ kiện và có template/corpus đã kiểm duyệt | Kiểm tra cả input gốc, risk, ambiguity, subrequest và policy. Không dùng khi extraction bị từ chối an toàn/sai schema/bằng chứng hoặc chưa rõ thao tác. Không cấp quyền hay thực thi hạ tầng. Hiển thị source deterministic và fallbackReason. |
| Hàng đợi con người | Không đủ điều kiện hai tầng trên, hoặc policy yêu cầu thẩm quyền | Giữ vấn đề gốc, facts, câu hỏi, rule, lịch sử và audit. FAIL-* cho lỗi dịch vụ/model khác AUTH-* cho thẩm quyền. Đưa vào queue demo không có nghĩa đã gửi thông báo tới người thật. |

Trace lưu model được gọi, attempts, latency và lý do retry/fallback; audit
giữ cả nguồn extraction và nguồn hướng dẫn. Không lưu key, upstream error
body hoặc chain-of-thought. Sentiment không cấp quyền, tự đóng hồ sơ hay
quyết định bàn giao. DNS dự phòng dùng bài khái niệm dựa trên
[tài liệu Cloudflare](https://www.cloudflare.com/learning/dns/what-is-dns/),
không đưa hướng dẫn thay cấu hình mạng.

## Kiểm chứng có thể lặp lại

`tests/support-resilience.test.ts` kiểm tra outage, không lặp credential401,
không gọi web cùng key sau outage, prose sai, clarification, tiếp nối,
HANDOFF và đọc lại. `tests/model-fallback-transport.test.ts` fault-inject
transport; không cố tình phá key Production. Các test intent/routing kiểm
tra quote/field, semantic downgrade, yêu cầu nhiều tác vụ, phủ định và
phạm vi quyền. `tests/e2e/production-acceptance.spec.ts` giữ nguyên input
người dùng, chạy browser desktop/mobile trong môi trường local mock/memory.

Lệnh thông thường: `npm test`, `npm run lint`, `npm run typecheck`,
`npm run build`; sau build mới chạy E2E. Lệnh live opt-in được ghi trong
[RUNBOOK](../RUNBOOK.md). Script local live dùng bộ nhớ, không tạo hồ sơ
Production. Bằng chứng UI Production phải ghi riêng SHA/deployment,
response/audit, ID thử nghiệm và kết quả cleanup; không suy ra từ local.

## Giữ các kết quả không thuận lợi

Ground Truth gốc giữ nguyên. Case `v3-model-offline` trong bộ lịch sử
`extended-v3` (không thuộc `judge-15`) vẫn kỳ vọng
ESCALATE/FAIL-001; v5.18 trả hướng dẫn VPN đã kiểm duyệt khi đủ căn cứ nên
evaluator ghi FAIL đúng nghĩa khác kỳ vọng. Test kiểm tra mismatch
này, không đổi nhãn fixture. Bộ Đề A 5 ca, bộ 15 và 128 fixture development vẫn đo
riêng, không trộn với 8 tiêu chí trải nghiệm của lượt sửa này.

Lần thử live local đầu đã có 3 timeout ở extraction (printer, VPN, restart)
và sử dụng fallback; không gọi đây là AI thành công. Các probe sau có
inference thật cho printer/VPN và phát hiện ambiguity reset đã được giải
quyết nhưng model còn nhắc lại. Prompt sửa rõ chỉ trả mơ hồ chưa giải quyết;
probe restart mới đi đúng hướng dẫn. Bằng chứng local không thay kiểm tra
Production sau triển khai. Health tiếp tục ghi NOT_CHECKED vì endpoint
không tự gọi model.

Lượt candidate local ngày 15/10: `npm test` đạt 1.135 test, 1 Mongo opt-in
skip; lint, typecheck và build đạt. Ba script guard/report/docs đạt 18 test;
kiểm tra liên kết tài liệu đạt 61 file. Một lượt suite trước đó bị timeout
5 giây ở batch 128 case khi quá nhiều worker tranh CPU. Giới hạn 4 worker
đã cho phép chạy lại toàn suite thành công, giữ nguyên timeout và assertion.
`npm run test:persistence` skip có lý do: chưa có Mongo cô lập được xác nhận,
`persistenceVerification=NOT_PERFORMED`; không thử kết nối production.

E2E trên production build local, mock/memory, server riêng `127.0.0.1:3227`:
Chromium đạt 83/83; mobile đạt 82, skip 1 bài quay video chỉ dành desktop.
Build và E2E chạy tuần tự. Lượt desktop đầu đạt 82/83 do test mới nhầm
`extended-v3` với `judge-15`; đã đối chiếu membership, bỏ ghi chú sai và
khôi phục assertion đúng của bộ 15, rồi build/chạy lại toàn bộ thành công.
Không thay fixture hoặc expected để xử lý lỗi này.

128 fixture development vẫn đạt 89/128 exact-match (69,53%), 39 mismatch,
coverage và read-back 128/128. Có 8 ca nhãn routine bị chuyển tiếp, 26 ca
routine được hỏi thêm; 2 ca nhãn escalation được hỏi thêm và 0 ca nhãn
escalation được tự duyệt. Đây là mock/memory trên dữ liệu chưa được thẩm
định độc lập, không phải điểm AI live hay kết quả người dùng thật.

Mongo restart/durability độc lập, quyền IAM/ITSM thật, xác thực production,
held-out độc lập và phản hồi của 3 người dùng thật không được chứng minh
bằng lượt kiểm thử kỹ thuật này. Không tuyên bố readiness 9,5/10.
