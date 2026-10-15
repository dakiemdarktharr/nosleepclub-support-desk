# Chất lượng câu trả lời và thời gian phản hồi — 15/10/2026

Base: `8b1c3f9dd294a309b40d5ca4767cd801e734827a`, Production/main cùng
policy v5.18 trước sửa. Candidate v5.20 giữ business policy, Ground Truth,
model `gpt-6-luna`, authority và evidence checks. AI assistance: Codex cùng
các agent viết/rà soát code và kiểm thử; không phải phản hồi người dùng thật.

## Bốn vấn đề và tiêu chí nghiệm thu

| Vấn đề / nguyên nhân | Thay đổi / vị trí | Regression và nghiệm thu |
| --- | --- | --- |
| R1: hazard gate giữ quyết định an toàn nhưng baseline không lấy port; câu hỏi reviewer cố định hỏi lại dữ kiện | `network-facts.ts`, `text.ts`, `support-model.ts`, `policy.ts`: trích fact literal trước gate, hợp nhất có kiểm tra, hỏi trường còn thiếu | 3389 được giữ với evidence; vẫn SEC-002/Security; không suy ra TCP/production/owner. Source port không trở thành destination. Conflict không tự chọn một giá trị. |
| R2: template máy in chung không dùng triệu chứng đã biết | `guidance.ts`: phân biệt jam/offline/hết giấy/sai máy; jam dừng job, đọc cảnh báo, yêu cầu tài liệu đúng model, chỉ in thử sau khi ready | Kiểm tra phủ định/hết kẹt, không bịa hãng/cách tháo; hướng dẫn và audit giữ nguyên qua HANDOFF/reload. |
| R3: gọi model diễn đạt lại template đầy đủ, VPN có thêm 6–12 giây | `reviewed-guidance.ts`, `support.ts`, `support-model.ts`: bỏ paraphrase riêng cho câu kiểm tra VPN đơn giản đã xác định; reuse SDK client, không đổi model/retry cap | Extraction/policy/validation vẫn chạy. Câu chi tiết, tác vụ mới, quyền và follow-up không đi đường rút gọn. Source deterministic, generationReason riêng, không giả fallback hay source OpenAI. |
| R4: answer model phân loại lại cùng một taxonomy với routing | `conversation.ts`, `conversation-model.ts`: context.label do server chốt; strict schema chỉ cho nhãn đó; normalize nhãn enum hợp lệ sau đầy đủ validation | DNS/greeting/everyday/technical/company policy/recovery; answer/audit/cache cùng taxonomy. Nhãn ngoài enum, evidence giả/thiếu và nội dung nguy hiểm vẫn bị từ chối. |

## Contract dữ kiện mạng

Schema hiện có một `entities.port` cho cổng kết nối đích, không thêm trường
song song. Port hợp lệ là số nguyên 1–65535. Không suy protocol từ số port.
Source port được giữ trong evidence, không dùng làm destination port. Các
dải/nhiều port giữ quote và yêu cầu xác nhận/tách phạm vi vì contract một cổng
không biểu diễn chúng; không chọn một phần để tự thông qua. Giá trị ngoài
phạm vi, thập phân và dữ kiện raw/structured mâu thuẫn cần làm rõ.

`CONFLICT` chỉ cho dữ kiện xung đột thật; danh sách/dải cổng tự nó không phải
xung đột thẩm quyền. Risk/authority precedence vẫn giữ. Câu hỏi Security dựa
trên `missingFields` sau hợp nhất và vẫn hỏi phương án hạn chế phơi lộ,
người phê duyệt và thời hạn, không xác nhận đã mở cổng.

## Contract nhãn conversation

`canonical.intentLabel=CHAT_GENERAL_GUIDE` là nhãn intent trong namespace
Support. `canonical.conversation.label=GENERAL_GUIDE` là category dùng trong
retrieval, cache và câu trả lời. `assistance.answer.label` có cùng ngữ nghĩa
với conversation label; không phải nhãn sentiment/approval. Server cung cấp
category cho model; response dùng lại category đó sau schema/evidence/safety
validation. Không thay toàn bộ enum hoặc cho label model thay routing.

Audit ANSWER sử dụng answer.label đã thống nhất. Cache key có context.label,
model, policy version và reviewed corpus; hit vẫn revalidate. Policy v5.20
không dùng cache/preview của version cũ. Không mở rộng cache sang input riêng tư.
Cache hit trả `Assistance.source=cache`, giữ `generatedAt` và evidence đã
lưu, không gắn trace inference mới. API, audit và UI cùng phân biệt cache
với OpenAI vừa trả lời; UI cũng nhận `cacheHit` của hồ sơ cũ.

## Đo lường và phạm vi tối ưu

Preview trả `data.diagnostics` và header `Server-Timing`, không log nội dung
người gửi, định danh, quote, URI hay secret. Các stage: validationAuth,
inputValidation, extraction, policy, retrieval, generation, outputValidation,
persistence và sentiment. Stage chưa chạy không xuất; số 0 chỉ là duration
đã đo/làm tròn. `totalMs` là thời gian server đến lúc tạo response, khác
HTTP+JSON client bao gồm mạng. Không cộng stage để suy tổng nếu có phần
chạy song song; stage là thời gian của công việc tương ứng.

Mỗi model call có purpose/model/attempts/latency/retryReason/failureReason;
usage chỉ ghi token khi provider trả usage. Token của timeout không có
response là unknown, không coi bằng 0. `cachedInputTokens` là prompt-cache
provider, khác answer cache của app. Answer cache ghi not_applicable,
not_eligible, miss hoặc hit. Snapshot request sử dụng AsyncLocalStorage,
không dùng global biến chứa dữ kiện/response giữa người dùng.

`modelCalls` đo Chat Completions của extraction/assistance/sentiment, chưa
đo Responses web search; bốn input latency này không cần web search.
Transport thành công không tự chứng minh output hợp lệ: lỗi schema/evidence
sau inference phải đọc thêm canonical.model và assistance.fallbackReason.

`processInvocation=reused` chỉ chứng minh module đã xử lý request trước;
`first_observed` không chứng minh cold start Vercel, nên `coldStart=unknown`.
Model giữ `gpt-6-luna`. Retry vẫn tối đa 2 attempts trong 12 giây mỗi
extraction/prose, sentiment 1; không retry 401/refusal/invalid evidence.
SDK client dùng lại khi credential/config/transport không đổi; Mongo đã có
connection pool dùng lại. Không thêm cache riêng tư hoặc bỏ validation.

Đường rút gọn chỉ dành cho initial VPN diagnostic gồm triệu chứng và câu
hỏi kiểm tra cơ bản, khi template đủ bước Internet → profile → ghi mã lỗi
→ thử lại một lần. Không gắn `source=openai`: source deterministic và
`generationReason=REVIEWED_TEMPLATE_SUFFICIENT`, lưu cả audit. Extraction
vẫn là model nếu đã gọi model; lỗi extraction không bị tối ưu này bỏ qua.
`handlingMode=LLM_ASSIST` vẫn là loại quy trình do policy chọn, không phải
bằng chứng có inference trong bước trả lời. Dùng source/model trace và
generationReason để xác định cách câu trả lời thực sự được tạo.

V5.20 bổ sung nhận diện câu “Giải thích chi tiết cách kiểm tra.” là yêu cầu
diễn giải cùng vấn đề, thay vì một tác vụ độc lập gây AUTH-005. Lỗi đã tái
hiện tại cả base v5.18 và bản giữa v5.19. Chỉ nhận câu bổ sung có cấu trúc
giới hạn; không bỏ phần yêu cầu thao tác mới, quyền hoặc nội dung rủi ro.
Câu chi tiết này vẫn dùng diễn giải AI có validation, không lấy đường rút
gọn dành cho VPN cơ bản.

## Baseline Production mới trước sửa

Ngày 15/10/2026, SHA 8b1c3f9, model gpt-6-luna, Mongo vng_main; 20 preview
tuần tự, 5 mỗi input printer/VPN/DNS/reset, một warm-up riêng không tính.
Đo HTTP đến JSON đầy đủ. Nearest-rank: sort, pXX = phần tử ceil(XX*n).
Không tải đồng thời, không đổi câu; không tạo ticket. 21 preview (kể cả
warm-up) đã dọn exact ID sau lưu bằng chứng.

| Nhóm | n | p50 ms | p95 ms |
| --- | ---: | ---: | ---: |
| Toàn bộ | 20 | 5001 | 15345 |
| Máy in | 5 | 3776 | 6897 |
| VPN | 5 | 12469 | 15475 |
| DNS | 5 | 5799 | 5922 |
| Reset mơ hồ | 5 | 1821 | 2937 |

HTTP 200 cả 20, một VPN prose timeout/fallback; giữ trong phân bố tổng.
VPN extraction 3152–3893 ms; prose 5978–12005 ms. DNS có một nhãn answer
EVERYDAY khác context GENERAL_GUIDE. Không có cache hit; base chưa xuất đủ
stage/token nên không bịa số đo các phần này. Cold state unknown. n=5 mỗi
nhóm có p95 bằng max; không suy SLA hoặc khả năng chịu tải.

Kết quả sau sửa phải ghi bằng artifact mới trên đúng commit/deployment,
tối thiểu 20 request bổ sung cùng cách đo, tách source/fallback/cache và
trạng thái process quan sát được. Một lần gọi nhanh không chứng minh p95.
Mục tiêu p50 ≤ 5 giây/p95 ≤ 8 giây là mục tiêu thực nghiệm, chưa là kết quả
được xác nhận chỉ từ commit hoặc kiểm thử local.

## Chất lượng và nguồn

Rà soát kỹ thuật dựa vào input, template/corpus, assertion safety/evidence và
ảnh thực tế; không dùng riêng LLM judge. Chấm 7 tiêu chí: đúng thông tin,
đúng câu hỏi, đủ bước, an toàn/quyền, nguồn phù hợp, không bịa, rõ ràng.

Máy in trước: “kiểm tra ... không báo kẹt giấy” dù input đã xác nhận kẹt.
Sau: ghi nhận đang kẹt, dừng gửi job, đọc mã/vị trí lỗi; chưa biết model thì
hỏi model trước mở khay/nắp; chỉ in thử sau hết cảnh báo. Quy trình vật lý
khác theo máy: [HP 9730](https://support.hp.com/us-en/document/ish_8845255-8845299-16)
và [Canon](https://oip.manual.canon/USRMA-0281-zz-SS-enUS/contents/09010000.html)
được tham khảo để không áp dụng một thao tác bật/tắt/kéo giấy chung cho mọi
model. App không đoán hãng hoặc tạo đường dẫn tài liệu của máy chưa biết.

VPN sau vẫn đủ 4 bước kiểm tra an toàn, thêm câu hỏi mất kết nối sau bao lâu,
OS/mã lỗi và Internet có mất cùng lúc; nêu khả năng, không khẳng định nguyên
nhân. Chi tiết bổ sung vẫn có thể hỏi tiếp. Hiệu năng tốt hơn chỉ được công
nhận khi câu trả lời sử dụng được đã qua validation.

## Tái lập và giới hạn

Chạy `npm test`, lint/typecheck/build, guard/report/docs checks. E2E chạy
production build local tại 127.0.0.1:3227 mock/memory, sau build và tuần tự.
Các test mới: network-port-extraction, guidance-quality,
conversation-label-contract, preview-performance và acceptance E2E.
Kiểm tra local bản giữa v5.19/f19c55c ngày 15/10: `npm test` 1234 pass, 1 optional
intent benchmark skip; lint, typecheck, build đạt. Node guard/report/docs
tests 18 pass, `check:docs` 62 Markdown đạt. Production-build E2E local:
Chromium 83 pass; mobile 82 pass, 1 bài quay video desktop skip.
`test:persistence` skip rõ `NOT_PERFORMED` vì chưa có URI/ack Mongo cô lập;
không dùng database Production để chứng minh restart.

Bộ 128 development mock/memory vẫn 89/128 (69,53%), 39 mismatch, coverage
128/128. Không có ca từng exact-pass bị regression; 8 routine-label chuyển
tiếp, 26 hỏi thông tin; 2 escalation-label hỏi thông tin, 0 tự phê duyệt.
Dataset và evaluator digest không đổi. Số liệu không phải accuracy held-out.
Fault injection chỉ local; không sửa key Production. Lưu cả lần fail và
lần rerun đúng; không sửa Ground Truth để nâng điểm.
Assertion nguồn của unit test VPN đơn giản và cache được cập nhật theo
contract mới có chủ đích; thêm đối chứng VPN có platform vẫn gọi phần
diễn giải. Các bài fault injection prose dùng vòng hỏi tiếp để vẫn thực sự
đi qua model và kiểm tra loại bỏ output sai. Không đổi input/expected của
bộ 128 development, Đề A hoặc các tình huống nghiệm thu Production.
CI f19c55c phát hiện bài token telemetry giả lập HTTP vẫn bị guard 0-live-call
chặn; v5.20 cô lập thêm reservation trong đúng unit test đó. Không sửa cap,
guard runtime hoặc kỳ vọng token. Kết quả CI lỗi được giữ trong evidence.
V5.20 chạy local với cùng env mock/memory và `AI_TEST_MAX_ATTEMPTS=0` như CI:
1240 unit/integration pass, 1 optional benchmark skip; lint/typecheck/build
và docs check đạt. Hai spec acceptance/support liên quan chạy lại trên
server riêng theo mỗi project: desktop 17/17, mobile 17/17 pass. Lần thử
gộp hai project chung server dừng Verify tại 1/4 ở lượt mobile, phù hợp
với việc dùng chung cửa sổ intake 30/phút; giữ lỗi trong log và không nâng
hoặc reset cap. Workflow CI vốn chạy hai project riêng, như lần rerun.

Production UI/API cần xác minh lại 11 tình huống, known/missing/conflict
port, metadata DNS và cleanup exact ID. Kết quả local không phải live.
Mongo restart, held-out độc lập, feedback 3 người thật, thông báo nhân viên
thật và IAM/cloud execution không được chứng minh bởi kiểm thử này.
