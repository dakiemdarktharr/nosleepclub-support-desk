# Rà soát tích hợp sentiment — 09/10/2026 (ICT)

## Phạm vi và revision

Base: `1677fa7e22595f03deae56102d314e7965d851fe` trên GitHub main,
sau 5 commit sentiment từ `4c7c0dc`. Worktree riêng, detached từ base;
không mang thay đổi chưa commit của checkout người dùng vào bản sửa.
Có AI assistance, không suy ra human review hoặc bằng chứng production.

[CI base](https://github.com/dakiemdarktharr/vng-support/actions/runs/37811857357)
đạt. CI trước đó tại `283243a` thất bại khi Verify mới đạt 11/15 trong lúc
assertion chờ 15/15. Không đổi timeout, expected hay Ground Truth để che lỗi.

## Lỗi xác nhận và sửa

1. `feedbackSupport` gọi sentiment trước khi kiểm tra hồ sơ tồn tại, version
   và trạng thái. Request không hợp lệ vẫn có thể tiêu tốn hạn mức model chung.
   Chuyển kiểm tra hồ sơ lên trước model; CAS lúc ghi vẫn giữ nguyên.
2. `requiresFeedbackAnalysis` loại `USER_HANDOFF` khỏi nhánh policy.
   Với “Cảm ơn, chuyển admin giúp tôi”, model positive có thể đóng ticket
   trước khi rule `HANDOFF-001` được đánh giá. Giữ mọi risk signal, gồm
   yêu cầu chuyển người, qua policy trước sentiment. API feedback trực tiếp
   yêu cầu dùng luồng hội thoại để đánh giá nội dung này.
3. Helper sentiment độc lập chưa tự redact đầu vào và chấp nhận giải thích
   chứa dữ liệu nhạy cảm được nhận diện. Bổ sung redaction trước model và
   từ chối output có marker, đồng nhất với kiểm tra sentiment trong intent.
   Regression dùng email/OTP synthetic. Không tuyên bố ẩn danh tên/địa chỉ
   tự do hoặc mọi loại PII.
4. Preview dùng sentiment từ `AI_MODEL` phân tích ý định nhưng ghi nguồn
   “Model hội thoại”. Sửa nhãn; README làm rõ ngoại lệ prompt sentiment,
   timeout/token cap và rule chuyển người.

14 regression mới: target không tồn tại/stale/STOP/REJECT; USER_HANDOFF với
model positive/neutral và API feedback trực tiếp; input redaction; evidence,
schema, output nhạy cảm và timeout. Chạy 19 test của hai file sentiment mới/
mở rộng trên implementation base: **10 fail, 9 pass**; sau sửa: **19 pass**.
Model được inject/mock, không gọi API tính phí.

## Dependencies

`npm audit` trên base: **7 high, 1 moderate**, không critical.
Moderate là package Next.js với hai advisory:
[GHSA-4jqv-mc3x-m676](https://github.com/vercel/next.js/security/advisories/GHSA-4jqv-mc3x-m676)
và [GHSA-mcj8-r9mp-w47p](https://github.com/vercel/next.js/security/advisories/GHSA-mcj8-r9mp-w47p).
Nâng Next.js và eslint-config-next cùng dòng 15.5.25 → **15.5.27**.
Không suy ra app Vercel đã bị khai thác từ kết quả audit dependency.

Nhóm high cùng bắt nguồn từ
[braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
lan qua micromatch/fast-glob/chokidar/Tailwind/ESLint. Registry hiện trả braces
3.0.3 là latest, vẫn thuộc dải ảnh hưởng. Không force-upgrade Tailwind lên major
4 hoặc hạ eslint-config-next xuống 14 theo đề xuất tự động của npm.
Không thêm audit exception. Đây vẫn là hạn chế cần theo dõi/khắc phục bằng
bản upstream tương thích hoặc một đợt migration có kiểm thử riêng.

Audit sau nâng cấp: **7 high, 0 moderate, 0 critical**; lệnh audit vẫn báo
lỗi vì high chưa được xử lý, không ghi nhận dependency tree là sạch.

## Development benchmark

Baseline chạy lại trên base sạch, Node v24.18.0, mock/no API call,
memory-demo, policy `support-guidance-v5.9`. Candidate đo trên code task;
artifact ghi base SHA + runtimeDirty/digest khi chưa commit. Candidate runtime
digest: `daf6c8a99ff03dc5930c8b338705032371acd8340b23a943e0b5d353ef439652`.
Revision phát hành là commit chứa báo cáo này; kết quả chỉ áp dụng code tương ứng.
Dataset `legacy-original-128`, development, chưa adjudicate độc lập,
SHA256 `e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`.

| Chỉ số | Base | Sau sửa |
| --- | ---: | ---: |
| Exact action/bucket/rule | 56/128 (43,75%) | 56/128 (43,75%) |
| Coverage/readback trong memory | 128/128 | 128/128 |
| Routine thành ESCALATE | 32/34 | 32/34 |
| Routine hỏi bổ sung | 2/34 | 2/34 |
| Expected escalation thành AUTO_APPROVE | 0/94 | 0/94 |
| Expected escalation hỏi bổ sung | 1/94 | 1/94 |
| Case đổi quyết định / regression exact-pass | — | 0 / 0 |

Không đổi fixture, nhãn, policy/authority, quota hoặc expected để nâng điểm.
Nhóm sửa nằm ở phản hồi sau câu trả lời; benchmark intake không đo đầy đủ nhóm
này. 72 mismatch còn cần phân xử theo [báo cáo kỹ thuật](TECHNICAL-READINESS.md).
Không gọi 43,75% là độ chính xác production hoặc kết quả held-out.

## Lệnh tái lập và giới hạn

Kết quả local trên Windows/Node v24.18.0, Next.js 15.5.27:

| Kiểm tra | Kết quả |
| --- | --- |
| `npm test` | 655 pass, 1 opt-in skip; base 641 pass, 1 skip |
| Mongo guard + development report | 15 pass |
| Lint / typecheck / build | Pass |
| E2E Chromium production build | 69 pass |
| E2E mobile production build | 68 pass, 1 skip (video chỉ chạy desktop) |
| Bài Verify từng fail CI cũ | Pass ở cả desktop/mobile, giữ nguyên assertion |
| Mongo restart integration | 1 skip, NOT_PERFORMED |
| npm audit | Còn 7 high; moderate giảm 1 → 0 |
| Staged diff whitespace | Pass |

E2E chạy tuần tự sau build, mỗi lượt dùng server mới `127.0.0.1:3227`,
provider mock/budget 0, memory-demo, không Mongo/OTP/model live. Không coi các
kết quả này là bằng chứng deployment. Đối chiếu workspace gốc: 307 file trong
snapshot giữ nguyên hash, hai mục thư mục vẫn hiện diện; không sửa checkout đó.

```powershell
npm test
node scripts/development-report.mjs artifacts/original-fixture-evaluation.json
node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs
npm run lint
npm run typecheck
npm run build
npm run test:persistence
$env:SUPPORT_E2E_PRODUCTION='true'
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=mobile
npm audit
```

Trace benchmark, logs, ảnh/video và runtime artifacts chỉ giữ local.
Persistence test skip với `persistenceVerification=NOT_PERFORMED`: không có
URI/ack Mongo disposable, không thử kết nối production. Live model chưa đo;
held-out và phản hồi ba người dùng vẫn **NOT COLLECTED**. Giới hạn ID-only,
public-demo reviewer và audit không chống sửa bởi DB admin vẫn còn.
Không đủ bằng chứng để kết luận 9,5/10.
