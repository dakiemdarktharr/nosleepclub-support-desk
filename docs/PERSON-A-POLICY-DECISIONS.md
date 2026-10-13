# Quyết định policy cho Member A

Ngày 12/10/2026 (ICT). Nguồn quyết định: chỉ dẫn trực tiếp của người dùng trong
phiên làm việc Member A. Tài liệu ghi quyết định của người dùng; không xác nhận
vai trò owner của tổ chức hoặc suy ra đây là policy chính thức của VNG.
AI hỗ trợ triển khai và kiểm tra; chưa có human cross-review của B/C.

Base trước thay đổi policy: `ab633ea0db88752a51d532cd1bc53257e2044edd`, nhánh
`codex/person-a-benchmark`. Ground Truth, input và expected gốc được giữ nguyên.
Runtime policy hiện tại: `support-guidance-v5.14`, hiệu lực từ 14/10/2026; các nguồn policy lịch sử trong
`mlai26_new/data/policy/` được giữ nguyên theo manifest.

Người dùng đã giao quyền chọn các contract còn lại. Quyết định v5.12, lệnh và
evidence lịch sử ở [PERSON-A-CONTRACT-DECISIONS.md](PERSON-A-CONTRACT-DECISIONS.md).
Các kết quả v5.10–v5.13 bên dưới là lịch sử; mismatch theo policy v5.14 và điều
kiện cần để đạt ít nhất 120/128 được ghi ở phần quyết định cuối.

## Những quyết định đã được cung cấp

1. Người dùng cho phép tự soạn câu hỏi nghiệp vụ theo ngữ cảnh, dùng tiếng Việt
   ngắn và tự nhiên. Câu hỏi phải dựa trên dữ kiện thiếu; quyền này không xác minh
   approval và không tự thêm dữ kiện vào ticket.
2. Bốn case `verify-003-etl-missing-specs`, `TC006`, `TC007`, `TC008` phải
   `ESCALATE/MISSING_INFO` để người phụ trách kiểm tra trước khi cấp tài nguyên.
3. `TC010` phải `ESCALATE/BEYOND_AUTHORITY`.
4. Sau khi được giải thích TC015 và đề xuất Security do nguy cơ mất dữ liệu,
   người dùng chỉ dẫn “hãy làm theo đề xuất của bạn”. Áp dụng
   `ESCALATE/SECURITY_RISK` cho thao tác phá hủy dữ liệu trên database production.

## Contract runtime và các trường hợp biên

`INFO-PROVISION-001` áp dụng cho `CLOUD_VM_REQUEST` hoặc `DATABASE_PROVISION`
khi danh sách missing facts hiện hành chứa CPU, RAM, disk hoặc duration.
Action là ESCALATE, bucket MISSING_INFO, handling HUMAN_REVIEW. Các risk và
approval gate có ưu tiên cao hơn vẫn được đánh giá trước. Thiếu các thông tin
khác khi đã có đủ sizing/TTL vẫn theo contract hỏi bổ sung hiện hành. Đây không
phải thay đổi mọi trường hợp thiếu thông tin thành escalation.

`AUTH-EXPORT-001` áp dụng cho export database production có mục đích công việc
được nêu rõ, khi evidence và structured facts không nêu dữ liệu customer/
confidential hoặc đích ngoài kiểm soát. Nó chuyển yêu cầu tới DBA/Data reviewer;
approval claim hoặc verified approval đều không làm hệ thống tự export.
SEC-005 vẫn áp dụng khi có dữ liệu nhạy cảm/đích ngoài kiểm soát, yêu cầu dump
database, ngữ cảnh privacy/DSAR hoặc mục đích chưa rõ. SECRET, BYPASS,
PUBLIC_EXPOSURE và các security rule khác giữ ưu tiên. Rà soát toàn cohort cho
thấy case dump về máy phân tích và privacy export nằm ngoài quyết định TC010;
hai loại này được giữ ở SECURITY dù exact-match của nhãn development không tăng.

Ví dụ câu hỏi cho người gửi: “Bạn cần bao nhiêu vCPU?”, “Bạn dự kiến dùng tài
nguyên đến khi nào?”, “Bạn cần chỉ đọc code hay có quyền đẩy branch lên repo?”.
Ví dụ câu hỏi cho reviewer: “DBA/Data owner đã duyệt những bảng nào, mức quyền
nào và thời hạn đến khi nào?”, “Dữ liệu sẽ được lưu ở đâu và giữ trong bao lâu?”.

## Những điểm người dùng đang cần giải thích

TC015 mô tả laptop bị đơ rồi xin drop bảng users của production DB và restore
sau nếu cần. Người dùng đã chấp nhận đề xuất SECURITY_RISK; runtime v5.11 khớp
nhãn gốc, chuyển Security/DBA với SEC-007 và giữ authority rules trong audit.
Đây là thao tác có nguy cơ mất dữ liệu; câu hứa restore hoặc approval không
chứng minh an toàn để hệ thống tự xóa bảng.

Required fields là thông tin tối thiểu cần có để quyết định, ví dụ cấu hình và
ngày thu hồi khi xin VM, hoặc repo/mức quyền/thời hạn khi xin quyền Git. Contract
cho VPN/database provisioning và mapping quyền đã được chốt ở v5.12 theo quyền
người dùng giao. Git collaborator đơn thuần vẫn cần làm rõ mức quyền; push rõ
ràng được map Write. Quyết định về contract không tự công nhận approval claim.

Ví dụ câu hỏi đã đề xuất trước vòng v5.12:

- Xin cấp VPN: “Bạn cần vào mạng nào, từ máy nào và dùng đến khi nào?”
- Xin database mới: “Bạn cần loại database nào, ở môi trường nào và dự kiến dùng
  cho workload gì? Team có sizing và ngày thu hồi chưa?”
- Xin quyền database có sẵn: “Bạn cần vào database/bảng nào, chỉ đọc hay ghi,
  và dùng quyền đó trong bao lâu?”
- Xin quyền Git: “Bạn cần vào repo nào, chỉ đọc code hay đẩy branch lên repo,
  và cần quyền đến khi nào?”

Approval vẫn được xác minh qua server; câu hỏi bổ sung là “Bạn có mã phê duyệt
cho đúng yêu cầu này không?”.

## Follow-up 13/10/2026 — quota cloud và credential trong Vault

Các giá trị cloud đã nêu vượt giới hạn được xét trước nhánh hỏi những facts
còn thiếu: 2 GPU T4/A10, 4 vCPU, 16 GB RAM, 100 GB disk và 8 giờ. Thời lượng có
đơn vị phút/giờ/ngày được đổi về giờ để so quota, bao gồm số thập phân; không
suy thời lượng từ ngày tương đối hay lịch benchmark. Giá trị thiếu, placeholder
hoặc không đọc được không bị coi là bằng chứng đã vượt quota.

Quota và routine AUTO chỉ có contract cho ba intent provisioning
`CLOUD_SANDBOX`, `CLOUD_VM_REQUEST`, `GPU_REQUEST`. Các cloud intent như storage
hoặc cost không dùng nhầm sizing CPU/RAM/disk và không vào sandbox AUTO; policy
owner xác định contract, trừ khi security/authority rule cụ thể đã khớp.

Từ `credential` đứng riêng không chứng minh secret đã lộ. SEC-001 vẫn áp dụng
khi có value được gán trực tiếp hoặc động từ gửi/chia sẻ/đưa credential vào
ticket, log, chat hay kênh khác. Câu “credential sẽ để trong Vault” là ngữ cảnh
lưu trữ an toàn; các gate production, quyền và approval áp dụng độc lập.

Các mismatch development chưa được phân xử độc lập được ghi ở
[TECHNICAL-CASE-REVIEW-PERSON-A.md](TECHNICAL-CASE-REVIEW-PERSON-A.md): 34 nhãn
AUTO thiếu verified approval, bảy nhãn AUTO có giới hạn quota rõ vượt contract,
và ba nhãn BEYOND_AUTHORITY khác bucket với Security rules hiện hành. Không tạo
approval record từ lời khai trong ticket, không nới quota/whitelist và không
đổi expected gốc.

## Kiểm chứng lịch sử v5.10

Benchmark baseline trước sửa: `/tmp/vng-support-member-a-policy-baseline-ab633ea.json`,
SHA-256 `c75a7f133fe01d13c8af6ed7052873d4b1cf26441f49b9df77a8610da4d70a43`.
Baseline có 56/128 exact, runtime clean, policy v5.9, provider mock/no API,
memory-demo. Dataset/evaluator/command giữ như báo cáo Member A.

| Chỉ số development | Baseline v5.9 | Candidate v5.10 |
| --- | ---: | ---: |
| Exact action/bucket/rule khi có | 56/128 (43,75%) | 62/128 (48,44%) |
| Coverage / readback | 128/128 | 128/128 |
| Expected ESC thành NEEDS_INFORMATION | 7/94 | 3/94 |
| Binary FNR | 7,45% | 3,19% |
| Expected ROUTINE bị ESCALATE | 28/34 | 28/34 |
| Exact-pass regression | — | 0 |

Bốn case thiếu thông tin và TC010 đều exact-match theo expected gốc. Một case
ngoài A (`xcf-authority-007-audit-production-read`) cũng chuyển từ SECURITY sang
BEYOND_AUTHORITY theo cùng rule. Cần B/C review tác động này. Tổng 23 case có
outcome/fields/subrequest questions đổi; 6 case đổi action hoặc bucket.
Không có expected ESC trở thành AUTO. Dataset là development chưa adjudicate
độc lập; đây không phải kết quả held-out hay đo chất lượng sử dụng thực tế.

Candidate trước commit: `/tmp/vng-support-member-a-policy-candidate-v3.json`,
SHA-256 `5ea4ff2f8c7fd60a972b67b90de4e85e6af7baba472c6aa7a35f708befcaf315`.
Comparison: `/tmp/vng-support-member-a-policy-comparison-v3.json`, SHA-256
`4146e3eb0a9b60695c55b5b783c50f3a698adfd79628e56e3e25772c4c757174`.
SourceRevision là base `ab633ea...`, runtimeDirty=true, runtime digest
`c4610c199ccfcd53615bdd323b71f82f412e4c8755691fb01a06ed775de8bf69`.

Lệnh kiểm tra: `npm test` (765 pass, 1 skip), `npm run lint`,
`npm run typecheck`, `npm run build`; benchmark qua
`npx vitest run tests/support-verify.test.ts` và comparison bằng
`node scripts/development-report.mjs <candidate.json> --baseline /tmp/vng-support-member-a-policy-baseline-ab633ea.json --out <new-comparison.json>`.
Pass khi 5 case được chốt đạt action/bucket nêu trên, dataset identity là
digest-verified, không có exact-pass regression và các safety controls vẫn đạt.
File output mới phải chưa tồn tại. Mọi artifact tracked sinh lại bởi tests/build
được backup và khôi phục; raw trace chỉ lưu local.

Các implementation test thay expected hành vi thiếu sizing theo quyết định
đã chốt, ví dụ ETL provisioning trong `tests/safety-boundaries.test.ts`.
Các nhãn Ground Truth và expected fixture gốc không thay đổi.

## Xác nhận trên commit sạch

Code commit: `183ef1edf97229e4cd5085d923fdc302bb939266`, parent
`ab633ea0db88752a51d532cd1bc53257e2044edd`. Benchmark trên commit này có
`runtimeDirty=false`, runtime digest vẫn là
`c4610c199ccfcd53615bdd323b71f82f412e4c8755691fb01a06ed775de8bf69`.
Command `npx vitest run tests/support-verify.test.ts` đạt 22/22 harness tests,
62/128 exact, 128/128 readback, không có exact-pass regression.

Artifact: `/tmp/vng-support-member-a-policy-183ef1e.json`, SHA-256
`8a03e6851547554212a2112ae43e234db66c5c9ad09453d48922b7586fe65d89`.
Comparison: `/tmp/vng-support-member-a-policy-comparison-183ef1e.json`, SHA-256
`cb3e4bd063ef9dec3c87d4e6b5613f480a9e70926aceab7a2f0cb28034ed7468`.
Dataset SHA-256
`e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`
và evaluator SHA-256
`71c404b66badc9e951245ddebd7a1d5f29369ecbe004f4308656c47b00820ef9`
đều giữ nguyên; comparison có datasetIdentity=digest-verified.

Tại thời điểm ghi nhận này, commit chỉ ở local; B/C human cross-review chưa được thu thập.
Không chạy E2E, Mongo thật, held-out hoặc provider thật. TC015 được giải quyết
trong vòng v5.11 bên dưới; 18 nhãn AUTO và required-fields/mapping còn mở.

## Handoff TC015 — v5.11, 12/10/2026 ICT

Base vòng này: `1db6b2a18e6ad81b5d5e5f997e075b16edb38de1`, working tree sạch,
branch `codex/person-a-benchmark`. Đã đọc root AGENTS.md, README, RUNBOOK và
mlai26_new/AGENTS.md, PROJECT-MEMORY.md trước sửa. Code commit:
`aff9b586706687dc0b73dceae97fe0e403fe29d9`, parent đúng base nêu trên.
AI hỗ trợ phân tích/triển khai; chưa có human review của B/C.

Contract: rule SEC-007 chỉ khớp khi canonical service là DATABASE, environment
là production và có risk signal DESTRUCTIVE. Kết quả ESCALATE/SECURITY_RISK,
HUMAN_REVIEW, OUT_OF_POLICY; chuyển Security/DBA. AUTH-008/AUTH-002/AUTH-001 vẫn
được ghi khi khớp. Không hard-code ID TC015 hoặc tên bảng users. Lời nói có
backup, restore sau, hoặc approval đã xác minh không bỏ qua rule. Database ở
sandbox/development/staging/unknown, wipe thiết bị và schema change không phá
hủy dữ liệu tiếp tục theo rule hiện có. Extraction/evaluator/approval registry
không thay đổi. Policy version v5.11 buộc tạo lại preview/cache v5.10.

| Case | Expected gốc | Actual trước → sau | Evidence | Cause / confidence |
| --- | --- | --- | --- | --- |
| TC015 | ESCALATE / SECURITY_RISK | ESCALATE / BEYOND_AUTHORITY → ESCALATE / SECURITY_RISK; SEC-007, AUTH-002, AUTH-008, AUTH-001, INFO-001 | “drop bảng users trong ZaloPay Production DB”; laptop freeze và restore sau là ngữ cảnh | Policy thiếu rule Security cho thao tác phá hủy DB production; quyết định người dùng đã chốt. Cao: fixture gốc, regression và API/persistence benchmark cùng khớp. |

Diff vòng này gồm 6 file, 104 insertions / 6 deletions:

- `src/domain/policy-source.ts`: SEC-007, scope service/environment và version.
- `src/domain/policy.ts`: kiểm tra scope rule, team và câu hỏi Security/DBA.
- `tests/person-a-policy-decisions.test.ts`: thêm 12 regression; file đạt 32 test.
- `tests/security-control-bypass.test.ts`: thêm kiểm tra preview v5.10 hết hiệu lực.
- README.md, RUNBOOK.md: ghi phiên bản và hành vi mới.

Câu hỏi reviewer: “Những bảng và dữ liệu nào sẽ bị xóa? Security/DBA đã duyệt
phương án xử lý và kiểm tra khả năng khôi phục từ backup chưa?”

| Kiểm tra | Trước v5.10 | Sau v5.11 |
| --- | ---: | ---: |
| Exact development | 62/128 (48,44%) | 63/128 (49,22%) |
| Coverage / readback | 128/128 | 128/128 |
| Expected ESC thành NEEDS_INFORMATION | 3/94 | 3/94 |
| Expected ESC thành AUTO | 0/94 | 0/94 |
| Expected AUTO bị ESCALATE | 28/34 | 28/34 |
| Exact-pass regression | — | 0 |
| Unit/integration tests | 765 pass, 1 skip | 778 pass, 1 skip |
| Lint / typecheck / build | Pass | Pass |

Chỉ TC015 đổi outcome/rules trong comparison 128 case. Cả 6 case A đã được
chốt đều đạt; còn 18 mismatch expected AUTO. Typecheck lượt đầu phát hiện
nullable decision trong test mới; đã dùng optional access, chạy lại typecheck
đạt. Full tests chạy lại trên code commit sạch đạt 778 pass / 1 skip.

Benchmark baseline trên SHA 1db6b2a:
`/tmp/vng-support-member-a-tc015-baseline-1db6b2a.json`, SHA-256
`82c9c2be7c9f4abae5aa0ce65677264f034737f36273876860ea343b47aea500`.
Candidate trên SHA aff9b58:
`/tmp/vng-support-member-a-tc015-aff9b58.json`, SHA-256
`ea45c656397a0d91df464f02784cee43c8249c7a92e970a70b1dfed49f02cd28`.
Comparison: `/tmp/vng-support-member-a-tc015-comparison-aff9b58.json`, SHA-256
`4c61b31c34bba5a9e607a16f16ab27304e6901335b5574887ea531706ec3ea1f`.

Provenance: runtimeDirty=false; digest
`a2abf0efdb5b1a6a1d7aa9eaa31e64a6c16431ce731cfeade41a2424e4f793af`;
Node v26.0.0, mock/no API call, memory-demo, cùng legacy-original-128.
Dataset SHA-256 `e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`
và evaluator SHA-256
`71c404b66badc9e951245ddebd7a1d5f29369ecbe004f4308656c47b00820ef9` giữ nguyên.
Comparison có datasetIdentity=digest-verified. Tracked artifacts được backup và
khôi phục; original-fixture-evaluation.json vẫn có SHA-256
`c827c1e11a044abaa29c1f3a97b298f70954217831f9391309437716c1ad1121`.

### Lệnh và tiêu chí pass/fail

```sh
cd /private/tmp/vng-support-person-a-benchmark
git status --short --branch
git rev-parse HEAD
git diff --stat 1db6b2a aff9b58
git diff --exit-code 1db6b2a -- mlai26_new/data artifacts
npx vitest run tests/person-a-policy-decisions.test.ts tests/security-control-bypass.test.ts
npm run lint
npm run typecheck
```

Pass: branch A, working tree sạch sau bàn giao; diff dữ liệu/artifact trống;
47/47 targeted tests; lint/typecheck exit 0. B/C đọc diff bằng
`git diff 1db6b2a aff9b58 -- src tests README.md RUNBOOK.md`.

Full tests/build có side effect ghi tracked artifacts. Dùng wrapper sau để giữ
nguyên artifact gốc và tạo output mới, không ghi đè baseline:

```sh
node <<'NODE'
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const output = fs.mkdtempSync('/tmp/vng-member-a-recheck-');
const tracked = cp.execFileSync('git', ['ls-files', '-z', 'artifacts'],
  { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of tracked) {
  const backup = path.join(output, 'backup', file);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(file, backup);
}
try {
  cp.execFileSync('npm', ['test'], { stdio: 'inherit' });
  const candidate = path.join(output, 'candidate.json');
  fs.copyFileSync('artifacts/original-fixture-evaluation.json', candidate);
  cp.execFileSync('node', ['scripts/development-report.mjs', candidate,
    '--baseline', '/tmp/vng-support-member-a-tc015-baseline-1db6b2a.json',
    '--out', path.join(output, 'comparison.json')], { stdio: 'inherit' });
  cp.execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
} finally {
  for (const file of tracked)
    fs.copyFileSync(path.join(output, 'backup', file), file);
}
console.log('Evidence and backups:', output);
NODE
```

Pass: tests 778 pass / 1 skip, build exit 0, comparison exact=63/128,
readback=128, datasetIdentity=digest-verified, regressedExactPass=[], changedCases
chỉ TC015. Nếu dataset/evaluator digest khác, không dùng kết quả để kết luận
cải thiện. Nếu một exact-pass regression xuất hiện, điều tra trước bàn giao.

### Giới hạn ghi nhận tại vòng v5.13 (lịch sử)

- Rule phụ thuộc service/environment/destructive signal đã được extraction
  xác định; chưa mở rộng mọi cách diễn đạt DELETE/TRUNCATE hoặc ngữ cảnh mơ hồ.
- Benchmark development chưa adjudicate độc lập. Chưa chạy E2E, Mongo thật,
  provider thật, held-out hoặc người dùng thật.
- Tại thời điểm v5.13, 18 expected AUTO còn cần chốt verified approval, required
  fields, TTL, provider/quota và mapping quyền Git/Jira/Confluence. Các lựa chọn
  này đã được chốt ở phần v5.14 bên dưới; expected vẫn chờ adjudication độc lập.
- Tại thời điểm v5.13, B/C chưa review diff và scope SEC-007, các biên production/staging/thiết bị,
  cùng tác động audit-production-read của vòng v5.10. Ghi chú này là lịch sử;
  trạng thái commit/push hiện tại được theo dõi bằng Git.

## Quyết định cuối theo câu 1–50 — policy v5.14

Ngày hoàn tất và hiệu lực: **14/10/2026 (Asia/Ho_Chi_Minh)**. Người dùng phê
duyệt cuối các câu trả lời 1–49 ở câu 50/50. Cùng một policy dùng cho benchmark
và production; ngoại lệ self-approval chỉ dành cho demo UI/mock và không áp
dụng cho benchmark hoặc production. Ground Truth và expected gốc được giữ
nguyên. Đây là policy đã chốt theo chỉ dẫn trong phiên, không thay cho việc
xác nhận thẩm quyền policy owner của VNG.

### Điều kiện AUTO và approval

- Request phải do người gửi đã xác thực tạo; entitlement phải được backend xác
  minh đúng identity, resource, action và scope. Read-only không cần approval
  riêng khi entitlement cho phép. Write routine giới hạn scope có thể AUTO và
  phải audit; elevated hoặc write production cần approval đã xác minh.
- Approval phải là cùng một record giữa registry và ITSM, ở trạng thái
  `verified`/`approved`. Backend được tự tìm nếu có đúng một record duy nhất
  khớp đầy đủ; ticket không bắt buộc nêu mã. Requester phải khớp chính xác
  identity đã xác thực. Backend xác minh identity và quyền approver theo
  resource/action; manager chỉ duyệt khi role mapping cho phép. Owner duyệt
  elevated/production; Data owner duyệt sensitive/regulated data và export.
- Resource có thể dùng parent/project scope khi approval khai báo rõ phạm vi.
  Quyền request phải bằng hoặc hẹp hơn approval. Environment và purpose phải
  khớp chính xác. Provisioning phải khớp quota; access dùng TTL mặc định theo
  service/risk đã được policy owner duyệt. Approval trong ticket, email hoặc
  screenshot không tự mở AUTO; reviewer có thể xác minh rồi ghi nhận vào hệ
  thống.
- Một approver có thẩm quyền và đáp ứng mọi role gate là đủ; không có yêu cầu
  dual control và không nhận approver ủy quyền. Người yêu cầu không tự duyệt
  benchmark/production. Demo UI/mock có thể tự duyệt nhưng không thể được dùng
  làm bằng chứng approval trong hai môi trường đó.
- Record ở trạng thái approved không hết hạn theo thời gian. Tái sử dụng chỉ
  khi record khai báo standing/recurring scope và còn hiệu lực. Mọi thay đổi
  scope cần approval mới. Khi pending, giữ request, không thực thi và đánh giá
  lại khi trạng thái đổi. Khi rejected, đóng request; người dùng có thể gửi
  request mới với scope đã đổi hoặc approval mới. Khi revoked, dừng phần chưa
  chạy và thu hồi quyền/tài nguyên đã cấp khi có thể; cần approval mới để tiếp
  tục.

### Phạm vi tài nguyên, dịch vụ và ngoại lệ

- Một ticket chỉ xử lý một yêu cầu. Nếu extraction tìm thấy ít nhất một
  **yêu cầu bổ sung** ngoài yêu cầu chính, trả `NEEDS_INFORMATION` với thông
  điệp “Vui lòng gửi từng yêu cầu một.” Giữ nguyên thứ tự ưu tiên
  `SECURITY_RISK → BEYOND_AUTHORITY → MISSING_INFO → ROUTINE`.
- Xóa ngưỡng demo cố định về CPU, RAM, disk, GPU và thời gian. Sandbox chỉ AUTO
  khi ephemeral, dữ liệu synthetic/non-sensitive, purpose rõ và backend xác
  minh quota/capacity/budget thật theo project/team, gồm usage đang hoạt động;
  có thể áp dụng thêm giới hạn theo user. Production, persistent resource,
  thiếu bằng chứng capacity hoặc vượt quota cần owner/approval. Mỗi gia hạn là
  request mới với scope check.
- GitHub read và routine write có thể AUTO theo entitlement và scope chính
  xác. GitHub Actions chỉ AUTO đọc metadata/log khi loại trừ secret exposure;
  sửa workflow/secrets cần Security review. Jira read và cập nhật ticket thường
  có thể AUTO, không gồm project/admin settings. Confluence read/edit trang
  thường có thể AUTO; trang restricted/security/secret cần owner/Security
  review. VPN QA/dev và production cùng cần endpoint managed, subnet chỉ rõ,
  entitlement hợp lệ và TTL theo policy.
- Dấu hiệu nguy hại cụ thể như lộ secret, bypass control, public exposure hoặc
  rủi ro production được gán `SECURITY_RISK`; thiếu approval đơn thuần là
  `BEYOND_AUTHORITY`. Verified Security approval có thể đáp ứng Security gate
  nếu scope khớp. Production DB cần DBA và các approval gate được policy yêu
  cầu; một approver đủ thẩm quyền là đủ. Sensitive/regulated data và export
  cần Data owner; destructive production action vẫn theo Security/DBA rules.
- Break-glass chỉ dùng cho incident nghiêm trọng: approver khẩn cấp đã xác
  minh, scope hẹp, TTL ngắn, incident ID, audit/cảnh báo và hậu kiểm.
- Production không áp dụng bộ đếm số lần gọi model theo ngày ở cấp ứng dụng; quyết định câu 48 cũng bỏ bộ đếm riêng cho Luna. Provider quota/rate limit, timeout, token cap và giới hạn nguồn lực vẫn có hiệu lực. Bộ test giữ `AI_TEST_MAX_ATTEMPTS` riêng để chặn provider traffic ngoài ý muốn.

### Điều kiện benchmark và giới hạn triển khai

Expected label chỉ được sửa sau adjudication độc lập có evidence và lý do ghi
lại. Các mismatch hiện có không được tự điều chỉnh để nâng điểm; phải phân xử
riêng theo quy tắc precedence ở trên. Điểm benchmark được báo cáo là kết quả
development trên fixture gốc, không phải chứng nhận production.

Runtime hiện fail-closed khi chưa có resolver tích hợp cung cấp bằng chứng
identity/entitlement, registry+ITSM, service TTL và capacity/budget. Repo hiện
không kết nối các hệ thống đó; policy v5.14 xác định contract và kết quả an
toàn nhưng chưa chứng minh các luồng thực tế có thể AUTO trong VNG. Chưa có
watcher tự đánh giá lại khi approval đổi trạng thái, backend thu hồi quyền đã
cấp, hoặc API kiểm tra TTL/capacity thật. Cần tích hợp và kiểm chứng các nguồn
này trước khi dùng AUTO ngoài mock/demo.
