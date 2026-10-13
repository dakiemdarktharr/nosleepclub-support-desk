# Rà soát 38 mismatch và regression GPU — 14/10/2026

Đã sửa lỗi parser có bằng chứng, giữ nguyên Ground Truth. **Exact-match giảm 90 → 89/128**, còn **39 mismatch**; không che regression mới. Số ca mang nhãn routine bị chuyển người giảm **18 → 8/34**. Đây là fixture development đã được dùng để sửa code, không phải accuracy tổng quát.

- Base: `fb76162ca38a936f741522b6cdc172a6e8fa7830`, trùng main được fetch/đối chiếu trước khi sửa.
- Commit code được đo lại: `d585d02c898f4998e6c17d46937205fd9b1a76de`; policy `support-guidance-v5.15`; runtime/evaluator dirty=false.
- Ngày chạy: 14/10/2026; Node 24.18.0, model mock không gọi API, storage memory-demo. Các commit tài liệu tiếp theo không thay runtime.
- Làm trong clean detached worktree của clone độc lập; không thao tác checkout có thay đổi của người dùng. Không thay dữ liệu nguồn, nhãn hay expected output cũ.
- Dataset SHA-256: `e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`; evaluator hash giữ nguyên. [Metadata và toàn bộ 39 case](MISMATCH-REVIEW-2026-10-14.json).

## Kết quả trước/sau

| Chỉ số | Base v5.14 | Code v5.15 |
| --- | --- | --- |
| Exact-match: action + bucket + rule nếu có | 90/128 (70,31%) | 89/128 (69,53%) |
| Mismatch | 38 | 39 |
| Expected routine → escalation | 18/34 (52,94%) | 8/34 (23,53%) |
| Expected routine → hỏi bổ sung | 16/34 | 26/34 |
| Expected escalation → hỏi bổ sung | 1/94 (1,06%) | 2/94 (2,13%) |
| Expected escalation → AUTO | 0 | 0 |
| Coverage / readback | 128/128 | 128/128 |

Binary FNR tính NEEDS_INFORMATION là negative; hai ca hỏi bổ sung chưa cấp tài nguyên. Readback chỉ là bộ nhớ, không chứng minh Mongo restart. Cả 34 nhãn AUTO cũ vẫn khác kết quả hiện tại; không tự tạo proof để khớp nhãn.

## Lỗi implementation đã sửa

1. Phủ định sửa/edit/modify secrets không còn bị gán SECRET; credential lộ ra và câu yêu cầu secret ở vế sau vẫn bị chặn.
2. Lời khai người duyệt, thông tin laptop và mô tả scope hợp lệ gắn với yêu cầu trước; không thành OTHER/AUTH-005 hoặc yêu cầu thứ hai giả. Lời khai vẫn chưa xác minh và không cấp quyền.
3. Câu giới thiệu tên tài liệu Production DB không nối nhầm với động từ access ở trước. Thao tác database thực sự ở vế khác vẫn phải chuyển người.
4. Nhận corporate laptop là source đã khai báo; không mặc định đích mạng, duration hoặc xác minh thiết bị.

35 regression synthetic riêng kiểm tra cả hành vi đúng và phản ví dụ an toàn. Vòng đầu tái hiện 13 lỗi/24 test; vòng scope tiếp theo 6 lỗi/29 test; bản cuối 35/35 đạt. Không sửa expected cũ. Không đổi whitelist, quyền, quota, engine precedence hoặc source approval; tăng version để preview cũ được đánh giá lại.

## Regression và quyết định của chủ repo

Ca 11 GPU `gt-authority-008-eleven-gpu` đã nằm trong 38 mismatch, không phải ca thứ 39. Chủ repo xác nhận **hỏi đủ thông tin trước, sau đó kiểm tra quota/chuyển người phụ trách**. Ca này giữ INFO-001; không tái lập ngưỡng demo đã bỏ ở v5.14.

Ca 24 GPU `xcf-authority-009-creative-render-gpu` là **exact-pass regression mới**: trước đó câu Creative Director tạo một subrequest OTHER giả, khiến AUTH-005 vô tình khớp nhãn ESC. Sửa lỗi tách câu làm request chuyển sang hỏi provider/environment/GPU type/lifecycle/data classification. Input có khai báo FinOps pending, không có approval/quota đã xác minh; không có AUTO. Nhãn ESC vẫn giữ nguyên và ca được đưa vào adjudication cùng ca 11 GPU. [Quyết định có nguồn gốc](decisions/PERSON-A-CONTRACT-DECISIONS.md).

## Phân loại mọi mismatch

- 25 ca thiếu facts bắt buộc: giữ câu hỏi cụ thể; sau khi đủ facts vẫn cần entitlement/approval/quota theo contract.
- 8 ca approval không xác minh được: giữ AUTH-007; reference trong fixture không thay thế registry/ITSM đáng tin cậy.
- 1 ca thật sự có hai tài nguyên: giữ yêu cầu tách đơn.
- 3 ca nhãn Authority nhưng input khớp Security: bypass phê duyệt, dump về máy phân tích hoặc DSAR/PII. Giữ Security precedence.
- 2 ca GPU: bất đồng nhãn ESC với contract hỏi facts trước quota unavailable; chưa adjudicate độc lập.

**Không có AUTH-005 giả hoặc INFO-SINGLE giả còn lại trong 38 case ban đầu.** 12 case có trace đổi, 11 thuộc cohort mismatch cũ và 1 là regression mới; phần còn lại giữ nguyên. Không tuyên bố đã loại bỏ mọi lỗi parser ngoài cohort này.

| Case | Expected | Trước → sau | Rule sau | Facts thiếu / lý do giữ mismatch |
| --- | --- | --- | --- | --- |
| `verify-001-github-access` | AUTO/ROUTINE | INFO → INFO | INFO-001 | duration; MISSING_REQUIRED_FACTS |
| `verify-002-small-sandbox` | AUTO/ROUTINE | ESC → ESC | AUTH-007 | provider, resourceLifecycle, dataSensitivity; UNVERIFIABLE_APPROVAL |
| `TC001` | AUTO/ROUTINE | INFO → INFO | INFO-001, FACT-VPN-001 | duration; MISSING_REQUIRED_FACTS |
| `TC002` | AUTO/ROUTINE | INFO → INFO | INFO-001 | provider, resourceLifecycle, dataSensitivity; MISSING_REQUIRED_FACTS |
| `TC003` | AUTO/ROUTINE | INFO → INFO | INFO-001 | duration; MISSING_REQUIRED_FACTS |
| `TC004` | AUTO/ROUTINE | INFO → INFO | INFO-SINGLE-REQUEST-001 | singleRequest; MULTIPLE_RESOURCE_REQUESTS |
| `TC005` | AUTO/ROUTINE | ESC → ESC | AUTH-007 | provider, resourceLifecycle, dataSensitivity; UNVERIFIABLE_APPROVAL |
| `gt-routine-001-github-monorepo` | AUTO/ROUTINE | INFO → INFO | INFO-001 | duration; MISSING_REQUIRED_FACTS |
| `gt-routine-002-confluence-rdp-runbook` | AUTO/ROUTINE | INFO → INFO | INFO-001, FACT-COLLAB-001 | duration; MISSING_REQUIRED_FACTS |
| `gt-routine-003-jira-firewall-review` | AUTO/ROUTINE | INFO → INFO | INFO-001, FACT-COLLAB-001 | duration; MISSING_REQUIRED_FACTS |
| `gt-routine-004-vpn-data-oncall` | AUTO/ROUTINE | INFO → INFO | INFO-001, FACT-VPN-001 | duration; MISSING_REQUIRED_FACTS |
| `gt-routine-005-sandbox-webhook` | AUTO/ROUTINE | ESC → ESC | AUTH-007 | provider, resourceLifecycle, dataSensitivity; UNVERIFIABLE_APPROVAL |
| `gt-routine-006-sandbox-dbt-parser` | AUTO/ROUTINE | ESC → ESC | AUTH-007 | provider, disk, resourceLifecycle, dataSensitivity; UNVERIFIABLE_APPROVAL |
| `gt-routine-007-github-blockchain-audit` | AUTO/ROUTINE | INFO → INFO | INFO-001 | duration; MISSING_REQUIRED_FACTS |
| `gt-routine-008-jira-game-incident` | AUTO/ROUTINE | INFO → INFO | INFO-001, FACT-COLLAB-001 | duration; MISSING_REQUIRED_FACTS |
| `gt-routine-009-confluence-prod-db-sop` | AUTO/ROUTINE | INFO → INFO | INFO-001, FACT-COLLAB-001 | duration; MISSING_REQUIRED_FACTS |
| `gt-routine-010-vpn-qa-network` | AUTO/ROUTINE | INFO → INFO | INFO-001, FACT-VPN-001 | duration; MISSING_REQUIRED_FACTS |
| `gt-routine-011-sandbox-k3s` | AUTO/ROUTINE | ESC → ESC | AUTH-007 | provider, resourceLifecycle, dataSensitivity; UNVERIFIABLE_APPROVAL |
| `gt-routine-012-github-actions-read` | AUTO/ROUTINE | ESC → INFO | INFO-001 | provider, duration; MISSING_REQUIRED_FACTS |
| `gt-routine-013-confluence-kafka-docs` | AUTO/ROUTINE | INFO → INFO | INFO-001, FACT-COLLAB-001 | duration; MISSING_REQUIRED_FACTS |
| `gt-routine-014-jira-dataops-board` | AUTO/ROUTINE | INFO → INFO | INFO-001, FACT-COLLAB-001 | accessType, duration; MISSING_REQUIRED_FACTS |
| `gt-routine-015-sandbox-otel` | AUTO/ROUTINE | ESC → ESC | AUTH-007 | provider, disk, resourceLifecycle, dataSensitivity; UNVERIFIABLE_APPROVAL |
| `gt-authority-001-pubg-prod-write` | ESC/BEYOND_AUTHORITY | ESC → ESC | SEC-003, AUTH-002, AUTH-001 | system, resourceScope; SECURITY_BUCKET_LABEL_CONFLICT |
| `gt-authority-007-production-dump` | ESC/BEYOND_AUTHORITY | ESC → ESC | SEC-005, AUTH-002, AUTH-001 | system, resourceScope, operation, dataSensitivity, destination; SECURITY_BUCKET_LABEL_CONFLICT |
| `gt-authority-008-eleven-gpu` | ESC/BEYOND_AUTHORITY | INFO → INFO | INFO-001 | provider, environment, duration, gpuType, resourceLifecycle, dataSensitivity; GPU_FACTS_BEFORE_QUOTA |
| `xcf-routine-001-hr-confluence-onboarding` | AUTO/ROUTINE | ESC → INFO | INFO-001, FACT-COLLAB-001 | duration; MISSING_REQUIRED_FACTS |
| `xcf-routine-002-finance-vpn-month-end` | AUTO/ROUTINE | INFO → INFO | INFO-001, FACT-VPN-001 | target, environment, duration; MISSING_REQUIRED_FACTS |
| `xcf-routine-003-legal-jira-dsar` | AUTO/ROUTINE | ESC → INFO | INFO-001, FACT-COLLAB-001 | duration; MISSING_REQUIRED_FACTS |
| `xcf-routine-004-procurement-github-sbom` | AUTO/ROUTINE | ESC → INFO | INFO-001 | duration; MISSING_REQUIRED_FACTS |
| `xcf-routine-005-salesops-jira-crm` | AUTO/ROUTINE | ESC → INFO | INFO-001, FACT-COLLAB-001 | duration, reason; MISSING_REQUIRED_FACTS |
| `xcf-routine-006-marketing-sandbox-webhook` | AUTO/ROUTINE | ESC → ESC | AUTH-007 | provider, resourceLifecycle, dataSensitivity; UNVERIFIABLE_APPROVAL |
| `xcf-routine-007-customer-care-vpn` | AUTO/ROUTINE | ESC → INFO | INFO-001, FACT-VPN-001 | target, duration; MISSING_REQUIRED_FACTS |
| `xcf-routine-008-facilities-jira-maintenance` | AUTO/ROUTINE | ESC → INFO | INFO-001, FACT-COLLAB-001 | accessType, duration; MISSING_REQUIRED_FACTS |
| `xcf-routine-009-audit-confluence-controls` | AUTO/ROUTINE | ESC → INFO | INFO-001, FACT-COLLAB-001 | duration; MISSING_REQUIRED_FACTS |
| `xcf-routine-010-comms-sandbox-preview` | AUTO/ROUTINE | ESC → ESC | AUTH-007 | provider, disk, resourceLifecycle, dataSensitivity; UNVERIFIABLE_APPROVAL |
| `xcf-routine-011-eventops-vpn` | AUTO/ROUTINE | ESC → INFO | INFO-001, FACT-VPN-001 | target, environment, duration; MISSING_REQUIRED_FACTS |
| `xcf-routine-012-executive-confluence-boardpack` | AUTO/ROUTINE | ESC → INFO | INFO-001, FACT-COLLAB-001 | duration; MISSING_REQUIRED_FACTS |
| `xcf-authority-004-privacy-zalo-export` | ESC/BEYOND_AUTHORITY | ESC → ESC | SEC-005, AUTH-002, AUTH-001 | system, resourceScope, operation, dataSensitivity, destination; SECURITY_BUCKET_LABEL_CONFLICT |
| `xcf-authority-009-creative-render-gpu` | ESC/BEYOND_AUTHORITY | ESC → INFO | INFO-001 | provider, environment, gpuType, resourceLifecycle, dataSensitivity; GPU_FACTS_BEFORE_QUOTA |

## Kiểm tra và tái lập

- `npm test`: 900 pass, 1 opt-in Mongo skip; 48 test files pass, 1 skip.
- `npx vitest run tests/support-verify.test.ts` trên commit code: 22 pass; xuất đủ 128 case với nhãn gốc và đọc lại audit.
- `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs scripts/check-docs.test.mjs`: 18 pass.
- `npm run lint`, `npm run typecheck`, `npm run build`: PASS.
- `$env:SUPPORT_E2E_PRODUCTION='true'; npm run test:e2e -- --project=chromium`: 73 pass.
- `$env:SUPPORT_E2E_PRODUCTION='true'; npm run test:e2e -- --project=mobile`: 72 pass, 1 video-only skip. Cả hai dùng production build local, mock/memory, server riêng 127.0.0.1:3227; chạy sau build và lần lượt.
- `npm run test:persistence`: 1 skip có lý do; `persistenceVerification=NOT_PERFORMED`, không kết nối database.
- `npm run check:docs`: 57 Markdown files PASS; `git diff --check`: PASS. Kiểm tra JSON xác nhận 39 case duy nhất, 38 mismatch base, 12 trace đổi, dataset/evaluator không đổi và metrics nhất quán.

Giữ baseline ở file riêng trước khi chạy trên bản sửa; không dùng artifact cũ làm kết quả HEAD:

```powershell
npx vitest run tests/support-verify.test.ts
node scripts/development-report.mjs artifacts/original-fixture-evaluation.json --baseline artifacts/baseline-fb76162.json --out artifacts/comparison-v5.15.json
```

`--out` từ chối ghi đè; comparator kiểm tra case IDs, expected và dataset digest. Báo cáo local chứa evidence/reason/questions theo case; bản công khai chỉ giữ IDs/rules/facts để tránh công bố nguyên văn fixture có thể chứa PII. JSON công khai không chứa request UUID hoặc timestamp churn.

## Việc cần người phụ trách và giới hạn

1. Người có chuyên môn adjudicate 39 case theo contract v5.14/v5.15 trong tập phiên bản riêng; đặc biệt 2 GPU và 3 Security/Authority. Không ghi đè Ground Truth legacy.
2. Xác định nguồn xác thực requester, entitlement, registry/ITSM và capacity theo project/team, cùng TTL và role mapping (Developer/standard agent). Thiếu nguồn thì routine access không thể AUTO an toàn. Cung cấp contract và dữ liệu test giả lập, không gửi credentials vào chat.
3. Thu thập held-out độc lập và kiểm chứng tác động người dùng theo [protocol](INDEPENDENT-EVALUATION-PROTOCOL.md). Chưa có bằng chứng mới trong lượt này; không suy ra điểm 9,5/10.
4. Mongo restart/live model/deployment không được kiểm chứng trong lượt này. Không đổi dependency hoặc chạy npm audit mới; kết quả advisory ở báo cáo tích hợp trước chỉ là lịch sử.

AI assistance: Codex thực hiện phân tích, code, regression và tài liệu. Chỉ quyết định thứ tự thiếu facts/quota nêu trên được chủ repo trả lời trong lượt này; không suy ra human adjudication từ commit identity.
