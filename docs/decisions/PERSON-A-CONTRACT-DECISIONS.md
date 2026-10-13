> Nhật ký quyết định theo phiên bản, gồm quyết định mới v5.14. Các số đo lịch sử chỉ áp dụng cho SHA ghi tại đó. Xem [mục lục](../README.md) và [rà soát sau tích hợp](../INTEGRATION-AUDIT-2026-10-14.md).

# Quyết định contract Member A — vòng v5.12

Ngày 12/10/2026 ICT. Nguồn: người dùng chỉ dẫn “hãy chạy theo quyết định của
bạn” sau báo cáo 18 mismatch còn lại. Người dùng giao quyền chọn contract trong
phạm vi này. Đây là policy mô phỏng của dự án, không phải xác nhận của owner
VNG. AI hỗ trợ quyết định/triển khai; human cross-review của B/C chưa có.

Base: `755f0982c90a045867620bfd67561d7b6a9de1dc`; working tree sạch,
branch `codex/person-a-benchmark`. Giữ nguyên input, Ground Truth và expected.

## Quyết định trước triển khai

1. VPN_SETUP thuộc ACCESS_REQUEST cần service, source, target, environment,
   duration và reason; không yêu cầu symptom/urgency của luồng chẩn đoán.
   Cấp quyền VPN vẫn đi qua Network/reviewer; không mở thêm đường AUTO.
2. DATABASE_PROVISION cần system, environment, CPU, RAM, disk, duration và
   reason. Không hỏi permission/resourceScope như xin quyền database có sẵn.
   Thiếu sizing/TTL giữ ESCALATE/MISSING_INFO; đủ facts vẫn cần DBA xem xét.
3. Quyền Jira/Confluence cần targetSystem, resourceScope (project/space/page),
   accessType, duration và reason. Không bắt buộc môi trường hạ tầng cho quyền
   nội dung tài liệu. Các production/security signal rõ vẫn giữ ưu tiên.
4. Git push branch/code được hiểu là Write khi được yêu cầu rõ, không bị phủ
   định. “collaborator” đơn thuần chưa xác định mức quyền. Jira User hoặc
   Browse/Create/Transition Issue được hiểu là standard; Confluence Editor/edit
   là write, view là read-only, comment là standard. Mapping không xác minh
   approval và không mở rộng whitelist AUTO; quyền write nội dung vẫn reviewer.
5. Thời hạn phải là khoảng thời gian dương có đơn vị hoặc timestamp ISO có
   múi giờ. “sprint”, “thứ Sáu”, “sáng mai” thiếu mốc ticket/calendar thì hỏi
   bổ sung; không lấy thời điểm chạy benchmark để suy ra ngày hết hạn.
6. Provider, quota và disk vẫn bắt buộc cho sandbox hiện có. Không tự mặc định
   chúng từ chữ “sandbox/default”, không nới giới hạn tài nguyên.
7. Giữ server-side approval verification đúng resource/quyền/thời hạn. Không
   tạo approval record cho các claim trong fixture để tăng exact-match.
8. Các nhãn AUTO gốc có thể tiếp tục mismatch với contract này. Ghi rõ xung đột
   nhãn/evidence; không đổi expected. Chưa coi development là held-out.

Rà soát sau commit e991b64: yêu cầu đủ facts nhưng nằm ngoài whitelist AUTO
phải chuyển team đã biết với AUTH-VPN-001, AUTH-DB-PROVISION-001 hoặc
AUTH-COLLAB-001, thay vì hỏi lại policy owner bằng AUTH-005. Rule này chạy sau
whitelist AUTO hiện có; không làm case đang được phép AUTO chuyển sang ESC.
Structured VPN_SETUP với requestKind ACCESS_REQUEST đi qua contract cấp quyền;
VPN_SETUP không yêu cầu cấp quyền vẫn giữ chẩn đoán/hướng dẫn.
Structured DATABASE_PROVISION với operation=provision dùng cùng sizing
contract khi requestKind là CONFIGURATION_CHANGE; không tạo CONFLICT giả
chỉ vì requestKind được khai báo đúng thao tác.

## Tiêu chí kiểm tra

- Câu hỏi đúng mục đích cấp quyền/cấp tài nguyên; mapping dựa trên evidence.
- Negation, admin/root, production, bypass, destructive và approval sai scope
  vẫn bị chặn; không có expected ESC chuyển AUTO hoặc exact-pass regression.
- 6 quyết định đã chốt ở v5.10/v5.11 vẫn khớp expected gốc.
- Baseline/candidate giữ dataset/evaluator digest; typecheck/lint/tests/build đạt.
- Ghi từng thay đổi ngoài cohort A và mọi thử nghiệm bị loại trong handoff.

## Handoff trên commit sạch

Code cuối: `433382bbd840f96e594cc91319a4ac8810bdb5ea`, sau các bước triển khai
`e991b648f264d9eacc3607eb7dbf8f66f7f73a18` và
`163f1faa81a40dacef582b385ee6fa6332fe47fa`. Không amend hoặc viết lại history.
Diff code/decision từ base 755f098 đến 433382b: 10 file, 430 insertions,
16 deletions; phần lớn dòng thêm là regression và tài liệu.

- `policy-source.ts`: FACT-VPN-001, FACT-DB-PROVISION-001, FACT-COLLAB-001;
  mapping quyền; AUTH-VPN-001, AUTH-DB-PROVISION-001, AUTH-COLLAB-001.
- `policy.ts`: chọn facts theo intent/kind/system, kiểm tra duration, audit
  contract, chuyển team đã biết sau khi whitelist AUTO không áp dụng.
- `text.ts`: giữ dấu/số thập phân của duration, map quyền có khẳng định,
  trích project/space/page và mục đích VPN; giữ đúng intent ở structured intake.
- `catalog.ts`, `questions.ts`: cung cấp fields và câu hỏi phù hợp loại yêu cầu.
- Test mới: 55 regression; thêm một kiểm tra preview v5.11 hết hiệu lực.
- README/RUNBOOK/decision log ghi policy v5.12 và quyền người dùng giao.

Các vòng sửa có căn cứ gồm: giữ duration âm thay vì biến thành số dương;
không lấy “5 hours” từ “8.5 hours”; chặn ngày ISO không tồn tại; không map quyền
bị phủ định; chuyển request đủ facts về đúng team; phân biệt structured VPN
access với diagnostics và DB provision operation với DB access.
Thời hạn cloud dạng thập phân vẫn ngoài safe path hiện có và chuyển reviewer;
không mở thêm whitelist AUTO. Không có thử nghiệm làm giảm exact-pass được giữ.

### Kết quả trước–sau

| Chỉ số | Baseline v5.11 | Candidate v5.12 |
| --- | ---: | ---: |
| Exact development | 63/128 (49,22%) | 63/128 (49,22%) |
| Coverage / readback | 128/128 | 128/128 |
| Expected ESC thành AUTO | 0/94 | 0/94 |
| Expected ESC thành NEEDS_INFORMATION | 3/94 | 3/94 |
| Expected AUTO bị ESCALATE | 28/34 | 28/34 |
| Exact-pass regression | — | 0 |
| Case A khớp expected | 6/24 | 6/24 |
| Tổng entries missing fields trong lô A | 101 | 87 |
| Full tests | 778 pass, 1 skip đã lưu | 834 pass, 1 skip |
| Lint / typecheck / build | Pass đã lưu | Pass |

Missing-field count là số liệu chẩn đoán, không phải accuracy độc lập. 22 case
đổi rules/fields/yêu cầu con theo comparator: 10 trong A, 12 ngoài A. Không có
action/bucket nào đổi trong 128 case. Sáu quyết định đã chốt ở các vòng trước
vẫn đạt. 18 expected AUTO đều chưa có approval verified; một số còn thiếu
TTL/provider/quota/disk hoặc facts cho từng resource. Theo contract đã chọn,
chưa đủ điều kiện AUTO; chưa kết luận nhãn gốc sai.

Một test skip đã có từ trước: `intent-stage-benchmark.test.ts` chỉ chạy khi
SUPPORT_INTENT_BENCH=1. Không thêm skip. Không chạy E2E, Mongo thật, provider
thật, held-out hoặc người dùng thật. Benchmark là mock/no API, memory-demo,
Node v26.0.0, legacy-original-128, development chưa adjudicate độc lập.

### Provenance và artifact local

- Baseline trên SHA 755f098:
  `/tmp/vng-support-member-a-contract-baseline-755f098.json`, SHA-256
  `7a3d422fb94d49ae575daff31ffc7f966df2b4eaef2040d92dc2bbe22b5cf9d8`.
- Candidate trên SHA 433382b:
  `/tmp/vng-support-member-a-contract-completed-committed.json`, SHA-256
  `096a872b33f4ff0b4dab0f8065a46740e48a56aee9781613c8d6a4887a7774a7`.
- Comparison:
  `/tmp/vng-support-member-a-contract-comparison-completed.json`, SHA-256
  `a6c2ccd45d302a733a6d3f46ab56958bea1e95c04c09c9800b49f4332d6862ed`.

Candidate runtimeDirty=false, evaluator dirty=false; runtime digest
`2f738c0f001f78f9475a239a9e3713ee1e896f9c69c529a2964542c00b23745f`.
Dataset SHA-256 `e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`;
evaluator SHA-256 `71c404b66badc9e951245ddebd7a1d5f29369ecbe004f4308656c47b00820ef9`.
Comparison datasetIdentity=digest-verified. Input/expected, evaluator và
approval registry không đổi. Tracked artifacts được backup/restore sau mỗi
lượt; original-fixture-evaluation.json giữ SHA-256
`c827c1e11a044abaa29c1f3a97b298f70954217831f9391309437716c1ad1121`.

### Lệnh kiểm tra và pass/fail

```sh
cd /private/tmp/vng-support-person-a-benchmark
git status --short --branch
git diff --exit-code 755f098 -- mlai26_new/data artifacts src/services/approvals.ts
git diff 755f098 433382b -- src tests README.md RUNBOOK.md
npx vitest run tests/person-a-contract-decisions.test.ts tests/person-a-policy-decisions.test.ts tests/security-control-bypass.test.ts
npm run lint
npm run typecheck
```

Pass: branch A, clean sau bàn giao; protected diff trống; 103/103 targeted tests,
lint/typecheck exit 0. Source mới có 55 contract tests, 32 policy-decision tests,
16 security-control/preview tests. Sáu case đã chốt giữ nguyên expected/actual.

Full tests/build dùng wrapper để giữ artifact gốc và tạo output mới:

```sh
node <<'NODE'
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const output = fs.mkdtempSync('/tmp/vng-member-a-contract-recheck-');
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
    '--baseline', '/tmp/vng-support-member-a-contract-baseline-755f098.json',
    '--out', path.join(output, 'comparison.json')], { stdio: 'inherit' });
  cp.execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
} finally {
  for (const file of tracked)
    fs.copyFileSync(path.join(output, 'backup', file), file);
}
console.log('Evidence and backups:', output);
NODE
```

Pass: 834 pass / 1 skip, build exit 0; exact=63/128, readback=128,
datasetIdentity=digest-verified, regressedExactPass=[], không action/bucket đổi.
Nếu dataset/evaluator khác hoặc regression xuất hiện, điều tra trước bàn giao.

### Cross-review và giới hạn còn lại

12 case ngoài A cần B/C review:

- gt-routine-013-confluence-kafka-docs; gt-routine-014-jira-dataops-board;
  gt-missing-008-postgres-uat.
- xcf-routine-001-hr-confluence-onboarding; xcf-routine-002-finance-vpn-month-end;
  xcf-routine-003-legal-jira-dsar; xcf-routine-005-salesops-jira-crm.
- xcf-routine-007-customer-care-vpn; xcf-routine-008-facilities-jira-maintenance;
  xcf-routine-009-audit-confluence-controls; xcf-routine-011-eventops-vpn;
  xcf-routine-012-executive-confluence-boardpack.

Lexical extraction/mapping chưa bao phủ mọi cách diễn đạt, URL tài nguyên hay
calendar/sprint; structured intake dùng giá trị quyền canonical. Timestamp
kiểm tra format/ngày hợp lệ; verification approval vẫn do server registry.
Không tạo record cho approval claim gốc. 18 nhãn AUTO cần evidence approval đúng
scope và formal adjudication riêng; contract không còn chờ quyết định. B/C cần
review diff/biên và tác động audit-production-read của v5.10. Chưa có human
cross-review; commit chỉ ở local trên branch A, chưa push/mở PR/deploy.

## Follow-up 13/10/2026 — GPU quota precedence

Trong benchmark fresh ngày 13/10, parser nhận được `GPU_REQUEST` và quantity
11 nhưng nhánh MISSING_INFO chạy trước rule quota; kết quả làm mất authority
gate dù số lượng đã vượt rõ giới hạn demo. Giữ nguyên giới hạn đã chốt: tối đa
2 GPU T4/A10. Khi quantity GPU được nêu rõ lớn hơn 2 hoặc GPU type được nêu rõ
ngoài T4/A10, áp dụng `AUTH-QUOTA`/`BEYOND_AUTHORITY` trước câu hỏi missing
facts. Nếu chỉ thiếu quantity hoặc type mà chưa có bằng chứng vượt giới hạn,
request tiếp tục qua contract MISSING_INFO hiện tại. Security, approval-failure
và request chưa ánh xạ vẫn giữ các gate đứng trước quota.

Đây là thứ tự áp dụng của quota hiện hữu; không nới giới hạn, AUTO whitelist,
hoặc approval verification. Regression dùng yêu cầu 11 GPU gốc và parser-level
negative controls. Kết quả benchmark/evidence và 15 trace ngoài cohort được ghi
trong [TECHNICAL-CASE-REVIEW-PERSON-A.md](../archive/TECHNICAL-CASE-REVIEW-PERSON-A.md),
cập nhật 13/10. Chưa có human B/C review.

## Follow-up 13/10/2026 — policy v5.13

Giữ nguyên quota demo và approval registry. `AUTH-QUOTA` chạy trước MISSING_INFO
khi request `CLOUD_GPU` nêu rõ CPU > 4, RAM > 16 GB, disk > 100 GB hoặc thời
lượng tương đương trên 8 giờ; GPU quantity/type tiếp tục theo giới hạn hiện có.
Phút, giờ, ngày và số thập phân được quy đổi về giờ. Một GPU type placeholder
như `unknown` không phải bằng chứng vượt giới hạn. Thời lượng không thể quy đổi
như ISO timestamp vẫn cần policy owner xác nhận cách áp dụng quota.
Quota và routine AUTO áp dụng cho `CLOUD_SANDBOX`, `CLOUD_VM_REQUEST` và
`GPU_REQUEST`. Cloud storage/cost và intent chưa có contract riêng được chuyển
policy owner thay vì hỏi VM sizing hoặc dùng sandbox AUTO; security/authority
rules cụ thể tiếp tục được đánh giá trước.

`SECRET` không còn phát ra chỉ vì từ `credential` xuất hiện trong câu lưu trữ
Vault. Gán value hoặc yêu cầu tiết lộ credential vẫn bị SEC-001 chặn.

Kiểm tra: 194/194 targeted tests; full suite 856 pass / 1 pre-existing skip;
lint, typecheck, build và 15/15 development-report/Mongo guards đạt. Benchmark
so với fresh base b069f22: 63/128 → 91/128 exact, 128/128 readback, không có
expected ESC thành AUTO hoặc NEEDS_INFORMATION và không có exact-pass regression.
So với candidate v5.12, bốn trace đổi; một mismatch `gt-authority-005` được sửa,
`TC002` giờ nhận AUTH-QUOTA vì TTL 48 giờ vượt giới hạn 8 giờ. Tỷ lệ expected
routine bị escalated tăng 28/34 → 29/34; đây là nhãn/contract conflict đã giữ
nguyên, không tính là cải thiện chất lượng. Chi tiết hash và trace nằm trong
[technical review](../archive/TECHNICAL-CASE-REVIEW-PERSON-A.md).

Các giới hạn còn lại: toàn bộ 34 expected AUTO đều không có verified approval
(6 pending, 28 unverifiable); bảy trong số đó nêu thời lượng hoặc CPU vượt quota
hiện tại. Ba expected BEYOND_AUTHORITY còn xung đột với Security bucket rules.
Dataset development chưa adjudicate độc lập và chưa có B/C human cross-review.
Không push, mở PR, merge hay deploy trong lượt này.

## Quyết định cuối theo câu 1–50 — policy v5.14

Ngày hiệu lực: 14/10/2026 (Asia/Ho_Chi_Minh). Câu 50/50 xác nhận các lựa chọn
1–49 là phê duyệt cuối; cùng policy áp dụng cho benchmark và production, còn
self-approval chỉ dành cho UI/mock demo. Routine access cần entitlement xác
minh; approval elevated/production phải khớp cùng record registry+ITSM, requester,
approver role, resource, quyền, environment, purpose và TTL/quota. Mọi scope
change cần approval mới; pending chờ và đánh giá lại, rejected đóng request,
revoked dừng và thu hồi khi có thể.

Policy bỏ ngưỡng demo cố định, dùng quota/capacity/budget thật cộng dồn theo
project/team; sandbox AUTO chỉ khi ephemeral, dữ liệu synthetic/non-sensitive,
purpose rõ và quota được xác minh. Một yêu cầu bổ sung trong ticket làm dừng với
`NEEDS_INFORMATION` và câu “Vui lòng gửi từng yêu cầu một.” Break-glass cần
approver khẩn cấp xác minh, scope hẹp, TTL ngắn, incident ID, audit/cảnh báo và
hậu kiểm. Quy tắc dịch vụ cụ thể và giới hạn tích hợp được ghi ở
[policy decisions](PERSON-A-POLICY-DECISIONS.md); benchmark labels chưa được đổi
khi chưa có adjudication độc lập.
