> Kết quả riêng tại base đã chốt và bản sửa v5.13. Chủ repo sau đó cho phép tích hợp main v5.14; xem [báo cáo mới](INTEGRATION-AUDIT-2026-10-14.md).

# Rà soát repo tại base đã chốt — 14/10/2026

**Đã sửa 3 lỗi xác nhận được và dọn tài liệu/output tự sinh. Exact-match development vẫn 63/128 (49,22%); không có bằng chứng để kết luận 9,5/10 hoặc đã hết mọi hạn chế.**

## Revision, môi trường và bảo toàn workspace

- Base bắt buộc: `b069f22b318a7caa3960eefdb5a3e69b7152e8e0`, đã xác minh qua GitHub repo `dakiemdarktharr/vng-support`. Làm việc trong clean detached worktree từ chính SHA này, không đổi sang main mới.
- GitHub main lúc bắt đầu rà soát: `e5bae44dba2fd04137e645f56cf92340711c9607`. [CI của main](https://github.com/dakiemdarktharr/vng-support/actions/runs/38444777928) thành công; đây không phải CI của candidate.
- Kiểm tra remote lần cuối phát hiện main mới `aa9ad2c8f9d83ced626212e0e99bbf2fd1c657d2` (`feat(policy): apply approved v5.14 support rules`), sửa 33 file gồm policy, model, services và tests. Không nhập commit này vào base chốt; số đo dưới đây không đánh giá v5.14.
- Workspace gốc được chỉ định không còn truy cập được trong môi trường này; worktree cũ còn file nhưng Git trỏ tới thư mục gốc đã mất. Không sửa, khôi phục, xóa hay stage bất kỳ file nào ở đó. Không thể xác nhận lại hash của các thay đổi người dùng từ lượt cũ; chỉ xác nhận lượt này không đụng vào chúng.
- Tạo clone riêng trong TEMP rồi worktree riêng. Không reset/clean/force-push, không đưa thay đổi cũ vào bản sửa. Không đổi Git identity, không dùng production credentials/Mongo, không gọi API model có phí.
- Windows, Node `v24.18.0`; unit/Verify/E2E dùng mock và memory-demo. Sentiment dùng fallback local; retrieval dùng corpus synthetic local. Công việc có AI assistance, không phải human review độc lập.

[Metrics JSON và 128 case](REPO-AUDIT-2026-10-14.json) ghi SHA nền, runtime digest/dirty, policy, dataset/evaluator hash và expected/actual/rule. Đây là phép đo candidate phát triển từ base, không giả mạo một SHA mới trong lúc source chưa commit. Raw trace/evidence chỉ giữ local vì fixture lịch sử chưa được kiểm chứng PII toàn diện.

## Lỗi sửa và phạm vi

| Lỗi xác nhận | Bản sửa | Regression |
| --- | --- | --- |
| “Vào được rồi nhưng lỗi lại xuất hiện” có thể đóng ticket | Chặn xác nhận hoàn tất khi phản hồi nói lỗi tái diễn; vẫn ghi sentiment riêng | 3 ca Việt/Anh, model positive không được tạo COMPLETED/knowledge candidate |
| Chuyển nhóm hỗ trợ giữ requestKind của nhóm cũ | Xóa loại yêu cầu khi đổi serviceGroup, giữ metadata nhân viên hiện có | E2E đổi ACCOUNT_ACCESS/ACCESS_REQUEST sang NETWORK_VPN/VPN_NOT_CONNECTING |
| PUBLIC_EXPOSURE và SECURITY_CONTROL cùng mang SEC-002 | SECURITY_CONTROL dùng SEC-008, bump policy v5.13 để vô hiệu preview cũ | Rule ID duy nhất; PUBLIC_EXPOSURE vẫn SEC-002 |

Ba thay đổi hành vi này được đối chiếu và lấy chọn lọc từ các bản sửa đã có trên main mới (`183342d`), áp dụng vào base người dùng chốt. Không nhập thay đổi bỏ production daily cap hoặc dữ liệu feedback cá nhân từ main. Đã giữ tên biến budget đúng với base (`AI_MAX_ATTEMPTS`), không mang theo biến test thuộc phiên bản mới.

Không thay Ground Truth, expected labels, fixture policy migration, dữ liệu nhân viên, bộ sentiment, dependency lock, approval registry, quota hay ngưỡng risk. Audit đổi mã rule để truy vết chính xác; không nới policy.

## Dọn repo và tài liệu

- Làm lại README theo đường dùng/demo → số đo → hai Mermaid workflow → identity/config → kiểm thử/giới hạn. Giữ bảng CSV đối chiếu, hướng dẫn quyền và provenance.
- Giữ nội dung sử dụng/module đầy đủ tại [USAGE](USAGE.md) và [ARCHITECTURE](ARCHITECTURE.md).
- Chuyển 21 báo cáo cũ vào `docs/archive/`, 2 quyết định vào `docs/decisions/`; thêm nhãn lịch sử và [mục lục](README.md). Sửa liên kết tương đối; không xóa brief, Ground Truth hoặc bằng chứng chỉ vì số đo cũ thấp.
- Bỏ theo dõi Git 14 output tự sinh (3 JSON, 11 ảnh), giữ bản local; thêm ignore theo tên cụ thể cho output E2E/video. Giữ manifest migration và bằng chứng live lịch sử. Không sửa lịch sử Git để “làm sạch” quá khứ.
- Thêm `npm run check:docs` và 3 test cho checker vào CI: kiểm tra local file links và conflict markers trong Markdown, bỏ qua ví dụ code fence. Không tuyên bố đã kiểm tra URL từ xa/heading anchor.
- Runbook không còn lệnh sao chép có thể ghi đè `.env.local` đang có; yêu cầu Node được đồng bộ 22.13+.

## Benchmark trước/sau

Chạy baseline thật trước sửa, lưu riêng rồi so sánh bằng `scripts/development-report.mjs`. Dataset `legacy-original-128`, SHA-256 `e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`, split development, nhãn chưa được thẩm định độc lập.

| Chỉ số | Base v5.12 | Candidate v5.13 |
| --- | ---: | ---: |
| Exact action + bucket + expected rule nếu có | 63/128 (49,22%) | 63/128 (49,22%) |
| Coverage / readback trong memory | 128/128 | 128/128 |
| Routine → escalation | 28/34 (82,35%) | 28/34 (82,35%) |
| Routine → hỏi thêm | 6/34 | 6/34 |
| Expected escalation → hỏi thêm | 3/94 (3,19%) | 3/94 (3,19%) |
| Expected escalation → auto-approve | 0/94 | 0/94 |
| Exact-pass bị regression | — | 0 |

Binary positive = ESCALATE; NEEDS_INFORMATION tính negative. Do đó 3 false negatives ở đây là hỏi thêm, không phải cấp quyền sai. Toàn bộ 34 ca expected routine chưa đạt routine: đây là hạn chế đáng kể của contract/dataset hiện tại, không được che bằng kết quả unit tests.

4 case đổi trace do tách mã rule; action/bucket và exact-pass giữ nguyên:

| Case | Thay đổi trace |
| --- | --- |
| `gt-security-006-public-jupyter` | Giữ SEC-002 public exposure; thêm SEC-008 security control |
| `xcf-security-002-finance-disable-edr` | SECURITY_CONTROL từ SEC-002 thành SEC-008 |
| `xcf-security-009-event-public-vnc` | Tách SEC-002/SEC-008 cho hai loại risk |
| `xcf-security-011-executive-bypass-mfa` | SECURITY_CONTROL từ SEC-002 thành SEC-008 |

65 mismatch: 6 ROUTINE→MISSING_INFO, 27 ROUTINE→BEYOND_AUTHORITY, 1 ROUTINE→SECURITY_RISK, 24 MISSING_INFO→BEYOND_AUTHORITY, 3 MISSING_INFO→MISSING_INFO khác action, 4 BEYOND_AUTHORITY→SECURITY_RISK. Theo subrequest: 21 case không có danh sách tách, 29 có 2, 15 có 3.

Các rule hay gặp trong mismatch (có thể chồng lặp): INFO-001 45, INFO-005 44, AUTH-005 36, AUTH-007 27. Chúng gợi ý thiếu facts, approval chưa xác minh hoặc task chưa ánh xạ; không tự chứng minh implementation sai. Claim “đã được duyệt” không phải server approval. Giữ quyết định an toàn và gửi từng case cho người phân xử; không sửa labels hoặc xóa unknown fragment để tăng điểm. [Quyết định contract trước đây](decisions/PERSON-A-CONTRACT-DECISIONS.md).

## Sentiment và RAG

- Sentiment: 16 ví dụ synthetic viết mới, 12 nhãn rõ đạt 12/12; 4 ambiguous (25%) giữ riêng. Coverage 100%. Support positive/neutral/negative = 4/5/3; precision/recall/F1 từng nhãn = 1 trên 12 nhãn nháp. Không phải phép đo Luna/OpenAI, không phải held-out, không dùng review Google Maps.
- Retrieval: 25 bài, 50 câu có nguồn + 4 câu ngoài corpus. Hit@1 = 46/50 (92%), recall@3 = 50/50, MRR = 0,96, unknown abstention = 4/4. Chạy lại thuật toán hiện tại; không có cải tiến RAG trong lượt này. Trường baseline trong artifact RAG là thuật toán đối chứng cũ chạy cùng corpus, không phải base SHA của task.
- Không chạy inference live, latency live, đánh giá tác động người dùng hoặc thu thập dataset mới.

## Lệnh và kết quả

| Lệnh | Kết quả thực chạy |
| --- | --- |
| `npm ci --ignore-scripts` | PASS; lock không đổi |
| `npm test` trước sửa | 834 PASS, 1 opt-in SKIP; 47 files PASS, 1 SKIP |
| `npm test` sau sửa | 837 PASS, 1 opt-in SKIP; 47 files PASS, 1 SKIP |
| `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs scripts/check-docs.test.mjs` | 18 PASS |
| `npm run check:docs` | 54 Markdown files PASS; không kiểm tra URL remote/anchors |
| `npm run lint` | PASS, chạy lại sau thêm checker |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:e2e -- --project=chromium` | 73 PASS, production build local, mock/memory |
| `npm run test:e2e -- --project=mobile` | 72 PASS, 1 SKIP quay video chỉ dành desktop |
| `npm run evaluate:sentiment` với `SENTIMENT_REPORT_OUT` | 3 tests PASS; metrics fallback ở trên |
| `npm run test:persistence` | 1 SKIP: thiếu URI/ack Mongo cô lập; NOT_PERFORMED |
| `npm audit --json` | Exit 1: 7 high, không moderate/critical; còn blocker dev tooling |
| `npm audit --omit=dev --json` | Exit 0: 0 advisory production tree |
| `git diff --check` | PASS |
| Diff dataset/manifest/CSV/sentiment/lock so với base | Không đổi |
| Tìm conflict markers trong tracked source | Không tìm thấy |

Lệnh so sánh (giữ baseline ở ngoài worktree, không ghi đè báo cáo):

```powershell
node scripts/development-report.mjs artifacts/original-fixture-evaluation.json --baseline ../baseline-development.json --out ../after-report.json
```

## Dependency và Mongo còn hạn chế

7 mục high cùng bắt nguồn từ [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): `braces`, `micromatch`, `fast-glob`, `chokidar`, `tailwindcss`, `@next/eslint-plugin-next`, `eslint-config-next`. Tại thời điểm kiểm tra, advisory ảnh hưởng braces ≤3.0.3, chưa có patched version; npm registry latest vẫn 3.0.3. Không dùng `npm audit fix --force`: gợi ý đổi major Tailwind hoặc downgrade ESLint config không phải bản vá tương thích đã kiểm chứng. Không thêm ignore/exception để che audit. Không xử lý pattern không tin cậy bằng chuỗi dev tooling này cho đến khi có bản vá hoặc migration đã kiểm thử.

Không có `mongod`/Docker trên PATH và không có URI/ack test cô lập. Guard từ chối production/credential/dotenv; integration skip đúng quy định. `persistenceVerification=NOT_PERFORMED`. Operator cần chuẩn bị Mongo local disposable riêng, rồi chạy [quy trình Mongo](../RUNBOOK.md#kiểm-tra-mongo-trong-môi-trường-thử-nghiệm-riêng). Identity transaction cần replica set/cluster riêng; test Support restart không tự chứng minh identity transaction/concurrency.

## Live, feedback và việc chủ repo cần làm

Chỉ đọc `/api/support/health`: `status=ok`, revision `e5bae44dba2fd04137e645f56cf92340711c9607`, policy v5.13, provider openai, storage MONGODB, durable=true, persistenceVerification=NOT_PERFORMED. Không gọi Verify hay model trên live, không sửa dữ liệu hoặc deploy. Health không chứng minh model inference thành công hoặc dữ liệu còn sau restart.

Main mới có báo cáo feedback ngày 13/10 với consent do chủ repo khai báo (`918bec5`); nó nằm ngoài base chốt. Không nói repo hoàn toàn chưa có feedback, nhưng cũng không suy ra đủ ba nhân sự helpdesk thực tế, độc lập hoặc tác động định lượng chỉ từ tài liệu đó. Không sao chép danh tính/phản hồi nguyên văn vào dataset của task.

1. Chuyên gia IT phân xử 65 mismatch dựa trên input/evidence gốc và policy; phân biệt lỗi parser, thiếu facts, xung đột contract và nhãn. Chốt nhãn trước khi đo tập held-out mới; không dùng held-out để tuning.
2. Chuẩn bị Mongo test cô lập và chạy restart/read-back; bổ sung kiểm chứng identity transaction/unique index/concurrency trên replica set thử nghiệm.
3. Tổ chức held-out độc lập và thử với ít nhất 3 người thuộc đúng nhóm sử dụng; ghi consent, role, SHA, môi trường, hoàn thành nhiệm vụ, thời gian và feedback. Hoàn thiện bằng chứng slide/video theo protocol; không bịa dữ liệu để lấp thiếu.
4. Quyết định xác thực production: ID-only/public reviewer là demo, có thể mạo danh. Chưa có SSO/team authorization đầy đủ; không đưa dữ liệu nhân viên thật vào demo.
5. Xác nhận cách tích hợp khi muốn xuất bản: main đã đi trước base bắt buộc. Không force-push bản phát triển từ base lên đè main; cần thống nhất giữ bản review riêng hoặc cho phép tích hợp các commit mới rồi kiểm tra lại.

Không có rubric độc lập đủ dữ liệu để đưa điểm overall đáng tin cậy. Các blocker về adjudication, bảo mật identity, Mongo restart, live inference và user impact ngăn kết luận 9,5/10.
