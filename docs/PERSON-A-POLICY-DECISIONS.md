# Quyết định policy cho Member A

Ngày 12/10/2026 (ICT). Nguồn quyết định: chỉ dẫn trực tiếp của người dùng trong
phiên làm việc Member A. Tài liệu ghi quyết định của người dùng; không xác nhận
vai trò owner của tổ chức hoặc suy ra đây là policy chính thức của VNG.
AI hỗ trợ triển khai và kiểm tra; chưa có human cross-review của B/C.

Base trước thay đổi policy: `ab633ea0db88752a51d532cd1bc53257e2044edd`, nhánh
`codex/person-a-benchmark`. Ground Truth, input và expected gốc được giữ nguyên.
Runtime policy tại thời điểm ghi quyết định: `support-guidance-v5.12`; các nguồn policy lịch sử trong
`mlai26_new/data/policy/` được giữ nguyên theo manifest.

Người dùng đã giao quyền chọn các contract còn lại. Quyết định v5.12, lệnh và
evidence mới nhất ở [PERSON-A-CONTRACT-DECISIONS.md](PERSON-A-CONTRACT-DECISIONS.md).
Các benchmark v5.10/v5.11 bên dưới là lịch sử; 18 expected AUTO vẫn chưa đủ
approval/thời hạn theo runtime hiện hành, không đổi nhãn gốc.

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

Commit hiện chỉ ở local, chưa push/mở PR, chưa có B/C human cross-review.
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

### Giới hạn và quyết định còn mở

- Rule phụ thuộc service/environment/destructive signal đã được extraction
  xác định; chưa mở rộng mọi cách diễn đạt DELETE/TRUNCATE hoặc ngữ cảnh mơ hồ.
- Benchmark development chưa adjudicate độc lập. Chưa chạy E2E, Mongo thật,
  provider thật, held-out hoặc người dùng thật.
- 18 expected AUTO cần quyết định về verified approval, required fields, TTL,
  provider/quota và mapping quyền Git/Jira/Confluence; không tự đổi expected hay
  nới gate để tăng điểm. TC015 không còn là quyết định đang chờ.
- B/C cần review diff và scope SEC-007, các biên production/staging/thiết bị,
  cùng tác động audit-production-read của vòng v5.10. Chưa có human review;
  commit chỉ ở local trên branch A, chưa push, mở PR hoặc deploy.
