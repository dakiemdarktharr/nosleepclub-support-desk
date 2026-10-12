# Quyết định policy cho Member A

Ngày 12/10/2026 (ICT). Nguồn quyết định: chỉ dẫn trực tiếp của người dùng trong
phiên làm việc Member A. Tài liệu ghi quyết định của người dùng; không xác nhận
vai trò owner của tổ chức hoặc suy ra đây là policy chính thức của VNG.
AI hỗ trợ triển khai và kiểm tra; chưa có human cross-review của B/C.

Base trước thay đổi policy: `ab633ea0db88752a51d532cd1bc53257e2044edd`, nhánh
`codex/person-a-benchmark`. Ground Truth, input và expected gốc được giữ nguyên.
Runtime policy mới: `support-guidance-v5.10`; các nguồn policy lịch sử trong
`mlai26_new/data/policy/` được giữ nguyên theo manifest.

## Những quyết định đã được cung cấp

1. Người dùng cho phép tự soạn câu hỏi nghiệp vụ theo ngữ cảnh, dùng tiếng Việt
   ngắn và tự nhiên. Câu hỏi phải dựa trên dữ kiện thiếu; quyền này không xác minh
   approval và không tự thêm dữ kiện vào ticket.
2. Bốn case `verify-003-etl-missing-specs`, `TC006`, `TC007`, `TC008` phải
   `ESCALATE/MISSING_INFO` để người phụ trách kiểm tra trước khi cấp tài nguyên.
3. `TC010` phải `ESCALATE/BEYOND_AUTHORITY`.

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
sau nếu cần. Hành động luôn phải chuyển người xử lý. Nhãn gốc là SECURITY_RISK,
runtime hiện là BEYOND_AUTHORITY với AUTH-008/AUTH-002/AUTH-001. Người dùng chưa
chọn bucket sau giải thích; quyết định này còn mở.

Required fields là thông tin tối thiểu cần có để quyết định, ví dụ cấu hình và
ngày thu hồi khi xin VM, hoặc repo/mức quyền/thời hạn khi xin quyền Git. Contract
cho VPN provisioning và database provisioning, cùng mapping Git collaborator/
push và Jira/Confluence User/Editor, vẫn cần quyết định. Việc soạn câu hỏi tự
nhiên không tự quyết danh sách fields hoặc công nhận approval.

## Kiểm chứng

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
