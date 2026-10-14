# Rà soát tiếp 39 mismatch — 14/10/2026

**Exact-match giữ 89/128 (69,53125%); vẫn 39 mismatch, không có exact-pass regression mới.**
Sửa lỗi dữ kiện ở 8 case không đồng nghĩa 8 case đã khớp nhãn. Đây là benchmark
development synthetic, mock-no-api-call, memory-demo; không phải held-out,
thử nghiệm người dùng hoặc bằng chứng model live.

- Base GitHub main: `8eb1f0973fa0500592d1fef96970c1206a824454`, đã fetch và đối chiếu.
- Commit code đo lại: `4a537625b615bd3408b7fc86d90122cbbd478d5d`;
  runtimeDirty=false, evaluator dirty=false. Commit báo cáo sau đó chỉ thay tài liệu.
- Policy v5.16 → v5.17: vô hiệu preview/cache cũ sau sửa extraction và chuẩn hóa.
  Không đổi bảng rule, ngưỡng, nguồn bằng chứng hay thứ tự risk/authority/facts.
- Worktree độc lập sạch trước sửa; không ghi vào checkout người dùng hoặc Mongo production.
- Có AI assistance; commit không phải chứng nhận human review.

## Lỗi đã sửa và bằng chứng

1. **Bỏ sót dữ kiện có trong câu:** nhận `synthetic data/schema/traces/leads`,
   “dữ liệu giả”, thời hạn viết bằng chữ như “trong ba ngày”, và mục đích
   “cần follow …”. Phân loại dữ liệu tự khai vẫn không phải PolicyEvidence
   đã xác minh. TTL không tự chứng minh resource sẽ tự xóa.
2. **Quyền read-only bị chuyển tiếp sai:** phép chuẩn hóa tạo `read only` nhưng
   safe path Jira/Confluence so với `read-only`. Sửa so khớp và bảng so sánh
   approval. Test với bằng chứng server giả lập đầy đủ được routine; bỏ bằng
   chứng hoặc đổi scope vẫn không AUTO. Không thêm bằng chứng vào fixture gốc.
3. **Clarification thời hạn bị tách thành tác vụ lạ:** câu trả lời trọn vẹn
   “4 giờ”/“bốn giờ” gắn với yêu cầu đang chờ. Service test kiểm tra cả audit;
   thiếu entitlement vẫn chuyển IAM, không còn AUTH-005 do fragment thời hạn.
4. **Thời hạn mơ hồ bị chọn một phần:** giữ “2–4 giờ” hoặc nhiều thời hạn khác
   nhau để hỏi rõ. “Đến cuối sprint/thứ Sáu” không bị thay bằng TTL mặc định;
   người gửi có thể bổ sung số giờ cụ thể. Hai thời hạn cụ thể mâu thuẫn vẫn
   được đánh dấu CONFLICT.
5. **Thao tác phá hủy DB bị nhận thành đọc:** `delete production database`
   nay nhận DESTRUCTIVE và vào rule Security/DBA hiện có. Rủi ro trong câu
   tiếp không bị nuốt bởi xử lý clarification; phủ định cục bộ vẫn được giữ.

Regression được tái hiện trước sửa, rồi bổ sung 42 test synthetic riêng.
Một assertion unit cũ cho `gt-routine-006-sandbox-dbt-parser` vốn mong parser
bỏ qua câu “synthetic schema” được sửa để kiểm tra dữ kiện tự khai này và
vẫn giữ các thiếu sót provider/disk/lifecycle, approval chưa verified, không
AUTO. **Không đổi Ground Truth, expected action/bucket hay manifest gốc.**

## So sánh đúng phiên bản

| Chỉ số | Base | Bản sửa |
| --- | --- | --- |
| Exact-match | 89/128 | 89/128 |
| Mismatch | 39 | 39 |
| Expected routine bị escalation | 8/34 | 8/34 |
| Expected routine được hỏi thêm | 26/34 | 26/34 |
| Expected escalation được hỏi thêm | 2/94 | 2/94 |
| Expected escalation thành AUTO | 0 | 0 |
| Coverage / readback memory | 128/128 | 128/128 |

Action, bucket và rule IDs của 128 case không đổi. Tám trace bớt thiếu dữ kiện:

| Case ID | Dữ kiện nay đọc được | Vẫn chưa đủ vì |
| --- | --- | --- |
| TC002 | dataSensitivity | Provider và lifecycle chưa rõ; chưa có quota/identity proof. |
| TC005 | dataSensitivity | Approval chưa xác minh; provider/lifecycle còn thiếu. |
| gt-routine-006-sandbox-dbt-parser | dataSensitivity | Approval chưa xác minh; provider/disk/lifecycle còn thiếu. |
| gt-routine-015-sandbox-otel | dataSensitivity | Approval chưa xác minh; provider/disk/lifecycle còn thiếu. |
| gt-authority-008-eleven-gpu | duration = 3 days | Provider, môi trường, loại GPU, lifecycle, classification còn thiếu; không suy ra quota. |
| xcf-routine-005-salesops-jira-crm | reason | Còn thiếu duration và bằng chứng quyền. |
| xcf-routine-006-marketing-sandbox-webhook | dataSensitivity | Approval chưa xác minh; provider/lifecycle còn thiếu. |
| xcf-routine-010-comms-sandbox-preview | dataSensitivity | Approval chưa xác minh; provider/disk/lifecycle còn thiếu. |

[Metadata và 39 dòng đối chiếu](MISMATCH-FOLLOWUP-2026-10-14.json) không chứa
raw input, nội dung evidence, UUID hay timestamp từng request. Full trace giữ
local vì fixture cũ có thông tin có thể nhận diện. Dataset/evaluator hash được
đối chiếu tự động; baseline là raw artifact, không phải summary.

## Vì sao chưa thể giảm 39 bằng sửa code hợp lệ

| Nhóm | Số case | Việc cần làm tiếp |
| --- | --- | --- |
| Thiếu facts, nhãn gốc kỳ vọng AUTO | 25 | Người gửi bổ sung facts trong luồng tiếp nối; quyền/TTL phải có nguồn server đáng tin cậy. Không coi lời khai manager là entitlement. |
| Approval chưa xác minh | 8 | Tích hợp nguồn identity + approval registry/ITSM khớp scope, và capacity/budget; demo Mongo chưa thay thế nguồn thật. |
| Hai tài nguyên trong một ticket | 1 | TC004 phải tách đơn theo contract một yêu cầu/ticket; chuyên gia đối chiếu nhãn cũ. |
| Security so với Authority | 3 | Chuyên gia phân xử riêng ba nhãn; input chứa bypass, dump/đích phân tích hoặc DSAR được rule hiện hành ưu tiên Security. |
| GPU hỏi facts so với escalation | 2 | Giữ quyết định người dùng: hỏi đủ thông tin trước quota chưa xác minh. Không phục hồi ngưỡng GPU cũ để tăng điểm. |

Ba case bucket cần phân xử: `gt-authority-001-pubg-prod-write`,
`gt-authority-007-production-dump`, `xcf-authority-004-privacy-zalo-export`.
Hai case GPU: `gt-authority-008-eleven-gpu`, `xcf-authority-009-creative-render-gpu`.
Đây là danh sách **cần adjudicate**, không phải nhãn mới do agent tự gán.

Kết nối hệ thống thật cũng không tự làm 39 fixture cũ đạt: chúng vẫn thiếu
facts/identity hoặc khác contract hiện hành. Không seed quyền/approval/quota
cho những ID fixture chỉ để tăng điểm. Nếu thu thập thêm thông tin hoặc được
chuyên gia adjudicate, lưu ở dataset phiên bản/split riêng, giữ báo cáo legacy
bất biến để so sánh trung thực. Chưa có bằng chứng để kết luận đạt 9,5/10.

## Kiểm tra và tái lập

- `npm test`: **976 pass, 1 opt-in Mongo skip**, 51 files pass / 1 skip.
- `npx vitest run tests/support-verify.test.ts` trên commit code: **22 pass**,
  xuất đủ 128 case; CLI so sánh baseline xác nhận dataset/evaluator không đổi.
- `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs scripts/check-docs.test.mjs`: **18 pass**.
- `npm run lint`, `npm run typecheck`, `npm run build`: **pass**.
- E2E bản build cuối, `SUPPORT_E2E_PRODUCTION=true`, server riêng 127.0.0.1:3227:
  `npx playwright test --project=chromium`: **76 pass**;
  `npx playwright test --project=mobile`: **75 pass, 1 skip** video chỉ desktop.
  Build và E2E chạy tuần tự; dùng mock/memory, không dùng server cũ port 3000.
- `npm run test:persistence`: **1 skip**, `persistenceVerification=NOT_PERFORMED`;
  thiếu URI/ack Mongo cô lập nên không thử kết nối. Không dùng mock làm bằng chứng Mongo thật.
- `git diff --check`: pass. Dependency không đổi nên không chạy lại npm audit.
- `npm run check:docs`: **60 Markdown files pass** về liên kết local/conflict markers;
  không kiểm tra URL remote hoặc anchor.
- CI base `8eb1f09`, run `38593199884`: completed/success, kiểm tra chỉ đọc.
  Kết quả CI base không được coi là CI của commit mới.

Dataset SHA-256 giữ nguyên:
`e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`.
Evaluator SHA-256 giữ nguyên:
`8c749d3f9668ebc412f398cf517d81042ed03deb2bf6c688b95506dd2eb404a3`.

```powershell
# Trên checkout sạch ở base, trước khi sửa:
npx vitest run tests/support-verify.test.ts
Copy-Item artifacts/original-fixture-evaluation.json ..\baseline-8eb1f09.json
# Sau khi chuyển sang commit code bằng một checkout sạch khác:
npx vitest run tests/support-verify.test.ts
node scripts/development-report.mjs artifacts/original-fixture-evaluation.json --baseline ..\baseline-8eb1f09.json --out ..\comparison-v5.17.json
```

Dùng đường dẫn output mới; không ghi đè baseline. Live provider, Mongo restart,
IAM/ITSM thật, deployment và held-out độc lập chưa được xác minh trong lượt này.
Không gọi API model có phí, không ghi production, không thay dependency.

Chủ repo cần chọn nguồn identity/IAM/ITSM thật khi sẵn sàng tích hợp; người có
chuyên môn cần phân xử các nhóm nhãn theo protocol và thu thập held-out độc lập.
Ngân sách DEMO-SANDBOX chưa cấu hình vẫn chuyển owner như đã chốt. Những việc
này là nguồn bằng chứng còn thiếu, không thể thay bằng vài con số tự đặt.
