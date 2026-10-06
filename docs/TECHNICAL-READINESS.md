# Readiness kỹ thuật — 07/10/2026 (ICT)

**Exact-match development vẫn 56/128 (43,75%). Không có bằng chứng đạt 9,5/10.**
Đã sửa hai lỗi extraction có regression, loại advisory moderate bằng nâng parser
có kiểm tra tương thích, và bổ sung integration entry point cho Mongo restart.
Advisory high vẫn còn; Mongo thực, held-out độc lập và tác động người dùng chưa
được xác minh. Đây là công việc có AI assistance, không phải human review.

## Revision và phạm vi

- Base GitHub main được kiểm tra lại: `e2cc41424f76702ff7117905bddff2f811307e70`.
  [CI base](https://github.com/dakiemdarktharr/vng-support/actions/runs/37516799055)
  đạt; không lấy CI base làm kết quả của candidate.
- Code candidate: `fbcbd6f81c237f6087f89405879f7cff84954366`.
  Benchmark đo lại tại `2026-10-06T20:10:25.641Z` (07/10 ICT).
  Báo cáo tài liệu được commit sau code.
- Dùng worktree mới, detached từ đúng base. Checkout gốc vẫn ở
  `codex/support-v3-migration`, HEAD
  `d797f3c5d25bbc07c9ddc4746669534fbbebd61d`; snapshot 308 mục
  modified/untracked trước làm, gồm nội dung ngoài VNG Support.
  Đối chiếu cuối lượt: cả 308 mục và hash nội dung không thay đổi.
  Remote main kiểm tra lại vẫn ở base; worktree khác không bị sửa.
- Chỉ commit local. Không push, merge, deploy, đổi Git identity, gọi model tính
  phí, dùng production Mongo/credentials hoặc mang thay đổi cũ vào worktree.
- Không đổi Ground Truth, input fixture, expected action/bucket/rule, registry,
  quota, ngưỡng an toàn hay thứ tự policy. Hai assertion version metadata được
  cập nhật; policy version v5.8 → v5.9 để vô hiệu preview/cache sau sửa parser.
- Artifact có trace/PII chưa xác minh, timestamp, UUID, ảnh/video và CSS sinh ra
  chỉ giữ local; không đưa vào commit.

## Baseline mới và kết quả sau sửa

Baseline chạy lại trên **base sạch**, không dùng lại số ngày 03/10.
Lệnh `npx vitest run tests/support-verify.test.ts`; baseline ghi
`2026-10-06T19:48:54.129Z` (07/10 ICT). Windows, Node v24.18.0,
provider `mock`, model `mock-no-api-call`, storage `memory-demo`.
API submission và GET readback trong cùng process; không phải Mongo durability.

| Chỉ số | Base v5.8 | Candidate v5.9 |
| --- | ---: | ---: |
| Exact action + bucket + expected rule nếu có | 56/128 (43,75%) | 56/128 (43,75%) |
| Mismatch | 72 | 72 |
| Prediction coverage | 128/128 | 128/128 |
| Readback cùng memory process | 128/128 | 128/128 |
| Expected routine thành ESCALATE | 33/34 | 32/34 |
| Expected routine thành NEEDS_INFORMATION | 1/34 | 2/34 |
| Expected ESCALATE thành AUTO_APPROVE | 0/94 | 0/94 |
| Expected ESCALATE thành NEEDS_INFORMATION | 1/94 | 1/94 |
| Binary FNR | 1/94 (1,06%) | 1/94 (1,06%) |
| Unnecessary escalation theo nhãn development | 33/34 (97,06%) | 32/34 (94,12%) |
| Ca exact-pass cũ bị regression | — | 0 |

Binary positive là ESCALATE; NEEDS_INFORMATION tính negative. Đây là định nghĩa
metric, không có nghĩa hỏi bổ sung là tự cấp quyền. Tập legacy không có expected
NEEDS_INFORMATION. Binary FN duy nhất `gt-missing-007-dbt-runner`:
expected ESCALATE/MISSING_INFO, actual NEEDS_INFORMATION/MISSING_INFO; cần chuyên
gia phân xử semantics, không tự đổi nhãn.

Confusion matrix candidate (base chỉ khác hàng AUTO: INFO=1, ESC=33):

| Expected ↓ / Actual → | AUTO_APPROVE | NEEDS_INFORMATION | ESCALATE |
| --- | ---: | ---: | ---: |
| AUTO_APPROVE | 0 | 2 | 32 |
| NEEDS_INFORMATION | 0 | 0 | 0 |
| ESCALATE | 0 | 1 | 93 |

Hai case đổi trace; không case nào chuyển từ mismatch thành exact-match:

| Case | Base → candidate | Giải thích |
| --- | --- | --- |
| verify-001-github-access | ESCALATE/BEYOND_AUTHORITY → NEEDS_INFORMATION/MISSING_INFO; subrequest 3 → 2; bỏ AUTH-005 | Câu cảm ơn hoàn chỉnh bị coi là task OTHER. Sau sửa vẫn thiếu dữ kiện/verified approval (INFO-001, INFO-005); không đủ căn cứ AUTO. |
| verify-003-etl-missing-specs | Giữ ESCALATE/BEYOND_AUTHORITY và INFO-001, INFO-005, AUTH-005; subrequest 3 → 2 | Bỏ task giả từ câu cảm ơn, nhưng clause provision khác còn chưa ánh xạ. Không bỏ clause đó để nâng điểm. |

## Điều tra và regression

**Lỗi implementation đã xác nhận:**

1. Clause chỉ có câu cảm ơn làm phát sinh task OTHER/AUTH-005. Chỉ bỏ clause
   khớp toàn bộ một câu cảm ơn giới hạn, giữ raw input/evidence. Không bỏ clause
   có thao tác kèm theo. VPN guidance + courtesy trở lại routine; chuyển tiền,
   tắt MFA hoặc mở RDP public cạnh lời cảm ơn vẫn escalation.
2. Regex approval lấy suffix `GIT-1001` thay vì toàn mã `DEMO-GIT-1001`,
   làm registry từ chối mã hợp lệ. Giữ toàn mã có giới hạn; không chấp nhận
   suffix nằm trong token dài. Registry cũ vẫn kiểm tra đúng resource/scope,
   TTL và trạng thái. Mã khác, resource khác hoặc vượt thời lượng vẫn AUTH-007.
   Lỗi này không được exercise bởi 128 fixture gốc; không nhận là cải thiện
   benchmark. Regression mới dùng dữ liệu synthetic, không thay GT.

`tests/technical-readiness.test.ts`: 15 test mới. Lượt đầu trước sửa có 6/12
test fail, xác nhận lỗi; bộ hoàn chỉnh sau sửa đạt 15/15.

**Các mismatch còn lại chưa được kết luận là lỗi:**

- INFO-001/INFO-005: có thể thiếu dữ kiện thật hoặc mất context khi chia task.
  Claim “đã duyệt” không chứng minh approval trong registry.
- AUTH-007: từ chối scope/TTL/approval không xác minh là đúng gate hiện hành;
  chuyên gia phải đối chiếu input và nhãn trước kết luận over-escalation.
- AUTH-005: có clause/tác vụ chưa ánh xạ. Không an toàn nếu bỏ mọi unknown
  fragment. Cần xác nhận từng câu là metadata hay yêu cầu độc lập.
- SEC/AUTH: giữ risk/authority precedence; nhiều expected bucket legacy có thể
  mâu thuẫn rule hiện hành. Chưa có adjudicator, không tự tạo nhãn “đúng”.

[Xem danh sách 72 case cần phân xử](TECHNICAL-CASE-REVIEW.md). Mỗi row JSON local
có expected/actual, policy/rules, evidence, reason, missing fields, câu hỏi và
subrequest. Diagnostic signals là đầu mối điều tra, không phải nhãn chuyên gia.

72 mismatch: 36 ca có 2 subrequest, 35 có 3, 1 có 4.
Nhóm bucket: ROUTINE→MISSING_INFO 2; ROUTINE→BEYOND_AUTHORITY 30;
MISSING_INFO→BEYOND_AUTHORITY 30; BEYOND_AUTHORITY→SECURITY_RISK 6;
SECURITY_RISK→BEYOND_AUTHORITY 1; ROUTINE→SECURITY_RISK 2;
MISSING_INFO→MISSING_INFO 1 (khác action).
Rule trong mismatch có thể trùng nhóm: INFO-001 61, INFO-005 53,
AUTH-005 62, AUTH-007 21, AUTH-002 9, AUTH-001 8, SEC-005 4,
SEC-001 3, SEC-003 1, AUTH-008 1, GUIDE-007 1, INFO-EVIDENCE-001 1.

## Khả năng tái lập và tách dữ liệu

Reporter hiện xuất SHA code, runtime digest/dirty, Node, policy, provider/model,
storage; dataset ID/version qua hash, split, nguồn pack, input transform và
evaluator hash/dirty. Tất cả case có hash input + expected.

- Dataset: `legacy-original-128`, development, `not-independently-adjudicated`.
- Dataset SHA-256: `e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`.
- Hai pack: official-original và ground-truth-original. Adapter employeeFixture
  chỉ bổ sung department/employee ID synthetic nếu thiếu.
- Base runtime digest: `8ef9ca3e0dc14cbb620cce5055b4421e8e36b21924effb02e43877cb119de6e5`.
- Candidate runtime digest: `99c51c72e697cdb8de3ec5c2233b2a7dffc0aedd3b73f523caf65b742a66557e`,
  `runtimeDirty=false`.
- Evaluator SHA-256: `71c404b66badc9e951245ddebd7a1d5f29369ecbe004f4308656c47b00820ef9`,
  `dirty=false`.
- Baseline cũ chưa có dataset/evaluator digest. So sánh ghi
  `legacy-baseline-digest-unavailable-labels-only`; không backfill metadata
  giả vào bản ghi gốc. Test checksum fixture gốc và diff cho thấy input/GT không
  bị chỉnh sửa; đây là bằng chứng riêng.

Trong clean checkout đúng SHA, cấu hình mock/memory và model budget 0 theo
[RUNBOOK](../RUNBOOK.md). Chạy benchmark ở base trước sửa, sao chép artifact
thành file baseline mới (từ chối ghi đè), rồi chạy lại ở candidate:

```powershell
npx vitest run tests/support-verify.test.ts
node -e "const fs=require('node:fs');fs.copyFileSync('artifacts/original-fixture-evaluation.json','artifacts/technical-baseline.json',fs.constants.COPYFILE_EXCL)"
# Sau khi chuyển sang candidate trong checkout sạch riêng:
npx vitest run tests/support-verify.test.ts
node scripts/development-report.mjs artifacts/original-fixture-evaluation.json --baseline artifacts/technical-baseline.json --out artifacts/technical-comparison.json
```

Lượt này có local `artifacts/technical-baseline.json`,
`artifacts/technical-baseline-report.json` và
`artifacts/technical-code-comparison.json` (128 case, đo trên SHA code);
không commit raw trace chưa rà soát riêng tư.
`--out` từ chối ghi đè. Reporter từ chối nhãn/case-set khác và từ chối input/hash
khác khi cả hai bản có digest. Thay đổi explanation thuần túy không tính vào
changedCases; mục này so action/bucket/rules/missing fields/subrequest.

Development không trở thành held-out nhờ đổi tên. Held-out và nhãn adjudicated
độc lập đều **NOT COLLECTED**; dùng [protocol sẵn có](INDEPENDENT-EVALUATION-PROTOCOL.md).
Không tạo người tham gia, nhãn, phản hồi hoặc số đo tác động.

## Dependency advisories

Audit lại trên đúng tree: baseline 9 package entries (7 high, 2 moderate);
candidate **7 high, 0 moderate**. Không phải 7 lỗ hổng độc lập.

- Sửa `postcss-selector-parser 6.1.4 → 7.1.6` bằng override chính xác trong
  package.json; lockfile chỉ đổi entry đó. Đây là **override qua major**,
  không mô tả như semver patch. Đọc [release v7](https://github.com/postcss/postcss-selector-parser/releases/tag/v7.0.0)
  và [bản vá 7.1.6](https://github.com/postcss/postcss-selector-parser/releases/tag/7.1.6);
  [advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
  CSS toàn dự án qua Tailwind + autoprefixer trước/sau byte-identical,
  63.702 byte, SHA-256 `4e9cc6248b9507544251c0459a54ebfddf14cd98ab8f2394040924cbac75894a`.
  Lint/types/build/unit/E2E xác minh tương thích trên dự án hiện tại.
- High còn lại: [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
  ảnh hưởng braces ≤3.0.3; npm latest vẫn 3.0.3 lúc kiểm tra.
  Bảy package: braces, chokidar, micromatch, fast-glob, tailwindcss,
  @next/eslint-plugin-next, eslint-config-next.
  npm đề xuất Tailwind 4 hoặc hạ eslint-config-next về 14; đây không phải vá
  tương thích cho stack Next 15/Tailwind 3. Không dùng audit fix --force, thay
  parser/glob bằng package không tương thích hoặc thêm ignore để báo xanh.
- `npm audit --omit=dev --json`: 0 advisory. Kết quả này không xóa rủi ro
  build/lint/dev toolchain; full audit vẫn **FAIL (7 high)**.
  Chưa chứng minh exploitability hay miễn nhiễm. Chỉ build source tin cậy và
  lập migration riêng/đợi upstream đã vá; [upstream issue](https://github.com/micromatch/braces/issues/70).

## Mongo persistence

**persistenceVerification=NOT_PERFORMED**. Không có mongod/Docker/môi trường
Mongo cô lập sẵn dùng; không kết nối database thật. Adapter/mock không chứng minh
durability. Support lưu request + audit nhúng với version CAS; đường unavailable
fail-closed vẫn giữ nguyên, không đổi storage các chức năng khác.

`npm run test:persistence` là integration opt-in sau build. Khi cả URI/ACK test
vắng mặt: 1 skip có lý do rõ. Cấu hình một phần/unsafe hoặc chạy đã opt-in mà
lỗi phải fail. CI gọi entry này nhưng không cấu hình Mongo nên sẽ skip; chưa có
hosted CI cho candidate local.

Harness đọc request/audit sau restart app, thực hiện reviewer STOP với hai CAS
cạnh tranh (200/409), restart app lần hai rồi đối chiếu request/audit API/direct
Mongo. Kiểm tra Mongo unavailable trả 503, không fallback. Chỉ sau tất cả
assertion mới báo APP_RESTART_VERIFIED. Không restart mongod, không kiểm chứng
identity transactions/replica set hoặc production durability.

Operator phải dựng instance Mongo **disposable riêng**, loopback port27028,
data directory mới, không tunnel/credential/dữ liệu production. Trong clean
checkout không .env riêng, bỏ biến MONGODB_URI/MONGODB_DB/VERCEL từ môi trường,
build với mock/budget0 rồi chạy:

```powershell
$env:SUPPORT_TEST_MONGO_ACK='isolated-local-synthetic'
$env:SUPPORT_TEST_MONGO_URI='mongodb://127.0.0.1:27028/'
npm run test:persistence
```

Script tự chọn database UUID mới, không xóa dữ liệu. Giữ log có SHA/Node/Mongo
version/DB name và các assertion; không lưu URI/credential. Xem
[runbook chi tiết](FEEDBACK-EVIDENCE-REVIEW.md#reproducible-mongo-evidence).
Kiểm thử identity cần replica set disposable riêng và kế hoạch khác; harness
Support không đủ chứng minh transaction/index của identity.

## Kiểm tra

Full checks chạy trên đúng nội dung candidate trước commit; benchmark đo lại
trên commit code. Local Windows, synthetic, mock/memory, không model API.
Build xong mới chạy Playwright production server riêng 127.0.0.1:3227,
`reuseExistingServer=false`, desktop/mobile tuần tự.

| Lệnh | Kết quả |
| --- | --- |
| npm test | 628 pass, 1 skip opt-in benchmark; 39 file pass/1 skip |
| node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs | 15 pass (11 guard, 4 reporter) |
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm run build | PASS |
| npm run test:persistence | 0 pass, 1 skip; NOT_PERFORMED |
| SUPPORT_E2E_PRODUCTION=true npm run test:e2e -- --project=chromium | 67 pass |
| SUPPORT_E2E_PRODUCTION=true npm run test:e2e -- --project=mobile | 66 pass, 1 skip quay video chỉ dành desktop |
| npm audit --json | FAIL: 7 high, 0 moderate |
| npm audit --omit=dev --json | 0 advisory; chỉ production dependency tree |
| git diff --check (file thuộc task) | PASS |

Lượt chạy regression trước sửa thất bại được dùng tái hiện lỗi, không che kết quả.
Không sửa test để giảm yêu cầu, không forced-click hay tăng timeout E2E.
Các test UI có route mocks ở luồng identity; không phải OTP/Mongo thật.

## Việc chủ repo/chuyên gia cần thực hiện

1. Chỉ định người hiểu policy phân xử 72 case bằng input/rule/evidence và nhãn
   gốc; ưu tiên U (task/context), A/V (verified approval), Q (hỏi thêm vs chuyển
   tiếp). Giữ nhãn cũ và bản adjudication riêng với lý do, không tune held-out.
2. Nhờ người độc lập tạo/đóng băng held-out trước xem output; dùng protocol
   sẵn có. Thu phản hồi bằng văn bản và consent của ít nhất ba người dùng thật,
   đo hoàn thành tác vụ/lỗi/thời gian theo cùng protocol.
3. Cung cấp môi trường Mongo disposable và chạy integration trên SHA ghi nhận.
   Nếu cần bằng chứng identity, dùng replica set, kiểm tra transaction/rollback,
   uniqueness/concurrency và restart riêng.
4. Theo dõi braces upstream hoặc phê duyệt lượt migration Tailwind/ESLint có
   kiểm tra tương thích; full audit hiện chưa sạch.
5. Chỉ định model/provider và ngân sách được phép trước live evaluation; log
   revision/model/storage và lỗi. Chưa có live-model quality bằng lượt này.
   Quyết định SSO/team RBAC và đánh giá riêng tư trước dữ liệu thật.

Không tăng điểm overall từ số lượng test. Các nhóm rubric chất lượng quyết định
và đánh giá độc lập/tác động vẫn thiếu bằng chứng; chưa đủ cơ sở kết luận 9,5/10.
