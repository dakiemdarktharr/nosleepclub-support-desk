# Nội dung dự thi và checklist bằng chứng

Bản nháp có AI assistance, dựa trên code và kiểm tra local. Đối chiếu bản
brief trong repo tại base `c2a8320`; chưa có xác nhận BTC về bản brief mới hơn.
Rubric 20/25/15/15/25 của chủ repo là rubric readiness riêng, không thay bảng
chấm điểm chính thức trong brief.

## Deliverables

| Bắt buộc | Trạng thái / phần còn thiếu |
| --- | --- |
| Live URL, public repo và lịch sử commit | Có URL/repo; health chỉ đọc được kiểm tra. Candidate lượt này chỉ local, chưa triển khai. |
| Verify chung 4 ca và Đề A 5 ca (3 routine/2 escalation), input mới | Có code và E2E mock/memory; chưa chạy live có ghi dữ liệu/model trong lượt này. |
| Ít nhất 15 Ground Truth, policy rõ ràng | Có fixture synthetic được giữ nguyên; bất đồng semantics nhãn cũ cần adjudicate. |
| 3 nhân sự thật, chức danh và phản hồi bằng văn bản | **NOT COLLECTED**; owner tuyển người, thu consent và văn bản riêng. |
| Ít nhất 1 cải tiến từ phản hồi và bất cập thực tế | **NOT COLLECTED**; không gán regression AI thành phản hồi người dùng. |
| Held-out độc lập, missed/unnecessary escalation | **NOT COLLECTED**; [protocol](INDEPENDENT-EVALUATION-PROTOCOL.md). |
| 5 slide đúng cấu trúc | Nội dung nháp bên dưới; chưa có deck cuối được đội thi duyệt. |
| Video ≤3 phút | Script bên dưới; E2E tạo video local/mock, chưa phải video nộp cuối được duyệt. |
| Build log 1 trang | [Bản ghi lượt này](BUILD-LOG-READINESS.md); đội thi bổ sung lịch sử thực tế, không backdate. |
| Điều chỉnh ngưỡng dựa trên feedback | Có evaluator/đề xuất ngưỡng offline; chưa có activation tự động, dữ liệu thật hoặc authorization production. |

## Năm slide — không thêm slide thứ sáu

### Slide 1 — Vấn đề hiện trạng

IT Helpdesk cần xử lý việc thường quy và dừng đúng lúc khi thiếu dữ kiện, ngoài
policy hoặc cần thẩm quyền. Chuyển tất cả cho người xử lý làm mất tự chủ; tự
cấp quyền thiếu căn cứ làm mất an toàn. Đây là giả thuyết sản phẩm, chưa có
số đo workload của nhân viên VNG. Mục tiêu: hướng dẫn rõ, chuyển tiếp có lý do.

### Slide 2 — Đầu vào → xử lý → đầu ra và quyền con người

Mô tả/danh mục → validate/redact → extraction → deterministic policy → hướng
dẫn / hỏi thêm / reviewer. Model không tự cấp quyền. Người gửi xác nhận lưu;
reviewer ghi lý do, hỏi bổ sung, Stop/Override trong giới hạn server. Audit ghi
actor, thời gian, rule, evidence, trạng thái; Stop không hoàn tác hạ tầng thật.

### Slide 3 — Tác động và cách đo

Tác động người dùng: **NOT COLLECTED**, chưa được tuyên bố tiết kiệm thời gian.
Trình bày protocol ba người, nhiệm vụ trước/sau được đảo thứ tự, onboarding tách
riêng, lỗi/handoff/bỏ cuộc/gánh nặng/ỷ lại/giảm phối hợp. Development 128 fixture
đã lộ cho đội phát triển: dùng số của [báo cáo readiness](COMPETITION-READINESS.md),
không dùng làm accuracy held-out. Kèm numerator/denominator và SHA.

### Slide 4 — Kiến trúc, thật và mô phỏng

Next.js/React/TypeScript, policy có version, API và audit; RAG BM25 trên corpus
có nguồn, không dùng embeddings/vector DB. OpenAI có cấu hình runtime; health
live báo provider nhưng chưa đo chất lượng model trong lượt này. Support có
Mongo hoặc memory-demo; identity chỉ Mongo. CI/local chạy mock/memory.
IAM/cloud/database actions mô phỏng; public reviewer và ID-only không là
production authentication. Mọi dữ liệu demo synthetic, không chứng minh là
policy chính thức hoặc hệ thống được VNG chấp thuận.

### Slide 5 — Giới hạn và rủi ro

Fixture legacy mismatch cao; approval được caller nói không phải approval đã
xác minh. Chưa có held-out, user study, live-model evaluation hoặc restart
Mongo evidence. Redaction theo mẫu, chưa ẩn danh tên/địa chỉ tự do. Team RBAC,
retention và identity provider chưa được quyết định. Ngưỡng chỉ đề xuất offline.
Ưu tiên tiếp: adjudication policy/nhãn → thu thập độc lập → kiểm chứng Mongo và
model trên môi trường được phép → chốt video/deck và evidence riêng.

## Script video tối đa 3 phút

- 0:00–0:20: trang đầu → Dành cho nhân viên; nói rõ demo/môi trường và SHA.
- 0:20–1:00: Kiểm thử → Đề A → chạy một lần; chỉ ra 3 AUTO/2 ESCALATE,
  action, bucket, rule, thời gian. Nếu kết quả khác, giữ lỗi trong video.
- 1:00–1:35: mở case escalation, evidence, câu hỏi và nơi tiếp nhận; mở lịch sử.
- 1:35–2:10: nhập tình huống mới ngoài pack; giải thích nếu hỏi thêm hoặc fail-safe.
- 2:10–2:35: reviewer Stop có lý do và audit (workflow mô phỏng).
- 2:35–2:55: nói giới hạn trên Slide 5, phân biệt development với user evidence.

Quay mộc trên dữ liệu synthetic. Không che lỗi, không dựng phản hồi người dùng,
không hiện secrets/tab cá nhân. Owner duyệt bản cuối, đo duration thực trước
nộp. Live Verify có ghi DB và có thể tính phí API: cần cấu hình/budget được
chủ repo cho phép; không tự chạy chỉ vì có live URL.
