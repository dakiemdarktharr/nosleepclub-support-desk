# Quyền/quota demo và 39 mismatch — 14/10/2026

**89/128 → 89/128 (69,53125%), vẫn 39 mismatch.** Đây là development synthetic,
mock-no-api-call, memory-demo, Node 24.18.0; không phải held-out hoặc accuracy
production. Giữ nguyên Ground Truth và manifest. Không kết luận 9,5/10.

- Base: `72557a2c16fdcc677b66bb113f48b66e8795b70b`, main đã fetch/xác minh.
- Commit code đo lại: `06f4dc8548613ae65401ab55d3b5fb4ddce29ed2`;
  runtimeDirty=false, evaluator dirty=false. Commit báo cáo sau đó chỉ thay tài liệu.
- Policy: support-guidance-v5.15 → support-guidance-v5.16.
- Worktree độc lập sạch trước sửa; không truy cập/ghi đè checkout người dùng.
  Ba commit main mới về slide/đổi tên tài liệu được fast-forward trước sửa.
- AI assistance được ghi nhận; Git identity không phải bằng chứng human review.

## Thay đổi và lý do

Theo [13 quyết định trực tiếp](decisions/DEMO-AUTHORITY-CONTRACT.md): đề xuất
TTL có xác nhận; Jira Developer/standard agent theo ticket/hàng đợi được giao;
sổ Mongo demo cho entitlement/approval/quota, owner chỉ DEMO-SANDBOX.

Policy vẫn là authority cuối. Tên role cần bằng chứng assignment server-side;
không có bằng chứng thì không AUTO. Test phát hiện khác biệt chuẩn hóa tên
role có thể làm nhánh edit-ticket bỏ qua assignment; đã sửa và thêm regression.
Một assertion synthetic cũ về role chưa định nghĩa được cập nhật theo câu 5;
vẫn yêu cầu duration và không AUTO. Không đổi bất kỳ expected label legacy.

Mongo demo ghi request/decision/usage và audit cùng transaction, có unique
index, schema validation, idempotency và version CAS. Chặn tự duyệt, IT chưa
được gán owner, ID vô hiệu hóa và quyền hết hạn. Không có memory fallback.
CLI bootstrap opt-in không chạy trong lượt này; không thay dữ liệu production.

Sửa ba liên kết tài liệu bị hỏng do main đổi tên USER-TEST-FINDINGS, giữ nguyên
nội dung feedback của chủ repo.

## So sánh development

| Chỉ số | Base | Bản sửa |
| --- | --- | --- |
| Exact-match | 89/128 | 89/128 |
| Expected routine bị chuyển người | 8/34 | 8/34 |
| Expected routine được hỏi thêm | 26/34 | 26/34 |
| Expected escalation được hỏi thêm | 2/94 | 2/94 |
| Expected escalation thành AUTO | 0 | 0 |
| Coverage / readback memory | 128/128 | 128/128 |

Hai trace thay đổi: `gt-routine-014-jira-dataops-board` và
`xcf-routine-008-facilities-jira-maintenance` không còn thiếu accessType,
vẫn thiếu duration. Action/bucket/rules của cả 128 ca không đổi. Không có
exact-pass regression mới; bất đồng nhãn GPU cũ vẫn được giữ.

39 case vẫn thuộc các nhóm: 25 thiếu facts, 8 approval chưa xác minh, 1 ticket
nhiều yêu cầu, 3 bất đồng Security/Authority, 2 GPU hỏi facts trước quota.
Danh sách gốc và lý do từng case ở [báo cáo v5.15](MISMATCH-REVIEW-2026-10-14.md);
bản này cập nhật hai trace Jira, không tuyên bố các nhãn khác đã được thẩm định.
[Metadata và 39 dòng trước/sau](AUTHORITY-REVIEW-2026-10-14.json) bỏ raw input/
evidence khỏi Git để không nhân bản thông tin có thể nhận diện trong fixture.

Dataset SHA-256 giữ nguyên:
`e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`.
Evaluator SHA-256 giữ nguyên:
`8c749d3f9668ebc412f398cf517d81042ed03deb2bf6c688b95506dd2eb404a3`.

Tái lập trên SHA code nêu trên, từ checkout riêng sạch:

```powershell
npx vitest run tests/support-verify.test.ts
node scripts/development-report.mjs artifacts/original-fixture-evaluation.json --out ..\authority-recheck-summary.json
```

Lệnh thứ nhất đã chạy lại trên commit: 22 pass, xuất 128 kết quả development.
Lệnh thứ hai yêu cầu output chưa tồn tại. Full trace nằm ở artifact local
ignored; báo cáo Git chỉ giữ case ID, expected/actual, rules, facts và provenance.
Muốn dùng `--baseline`, giữ **raw artifact** của baseline ở đường dẫn riêng
trước khi đo bản sửa; CLI không nhận summary làm baseline.

## Kiểm tra

- `npm test`: 934 pass, 1 opt-in Mongo skip; 50 files pass / 1 skip.
- `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs scripts/check-docs.test.mjs`: 18 pass.
- `npm run lint`, `npm run typecheck`, `npm run build`: pass trước E2E.
- E2E production build local: desktop **76 pass**, mobile **75 pass / 1 skip**
  (bài quay video chỉ dành desktop), chạy tuần tự sau build tại port 3227.
  Lần desktop đầu 75 pass / 1 fail do test mới tìm role alert ở hướng dẫn tĩnh;
  sửa locator theo DOM thực tế, giữ kiểm tra lỗi Mongo động, chạy lại toàn bộ đạt.
- `npm run check:docs`: 59 Markdown files pass; `git diff --check`: pass.
- `node --check scripts/demo-authority-bootstrap.mjs`: pass cú pháp;
  không chạy bootstrap/không ghi database thật.
- `npm run test:persistence`: 1 skip, **persistenceVerification=NOT_PERFORMED**;
  không có URI/ack test cô lập, không thử kết nối.
- Sandbox Windows chặn SWC canonicalize/cache rename ở lần đầu. Chạy lại
  ngoài sandbox thành công, không bỏ qua lỗi hoặc sửa expected để tránh lỗi.
- Không gọi model live, không chạy npm audit mới (không thay dependencies),
  không kiểm chứng deployment hoặc production Mongo. E2E dùng build local,
  mock/memory, port 3227; test Mongo adapter dùng transactional double.

## Giới hạn và việc chủ repo cần làm

1. Nếu muốn demo sổ mới: operator chọn database thử nghiệm riêng, gán IT demo
   theo RUNBOOK, ghi thời hạn hiệu lực snapshot. Chưa có dữ liệu này trên
   database thật từ lượt sửa; không gửi URI/secret vào chat.
2. Cung cấp nguồn ngân sách/đơn giá/capacity hợp lệ trước khi yêu cầu hệ thống
   tự xác minh chi phí. Hiện còn quota vẫn chuyển owner. Preflight không giữ
   chỗ/allocate và không tự giải phóng usage khi TTL hết.
3. Muốn dùng thật: xác minh identity và nối IAM/ITSM/capacity đáng tin cậy.
   Sổ ID-only demo không thay adapter thật; owner chỉ sandbox, chưa gán Git/Jira/
   Confluence/VPN. Không thêm proof vào fixture cũ chỉ để nâng điểm.
4. Người có chuyên môn adjudicate 39 nhãn với policy đã chốt, đặc biệt hai ca
   GPU, ba ca Security/Authority và yêu cầu nhiều tài nguyên; thu thập bộ độc
   lập riêng. Lượt này chưa thu thập held-out/đo tác động người dùng mới.
5. Chạy Mongo disposable replica-set để xác minh transaction/index/concurrency
   của sổ mới, và harness Support restart theo RUNBOOK. Kết quả mock không
   chứng minh durability.
