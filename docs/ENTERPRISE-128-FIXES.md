# Sửa lỗi intake theo bộ Enterprise 128 v1

AI-assisted implementation and local verification. Base commit: `066cf89e0190aa0d0d0e38e613c52dbc63a5df56`. Sửa theo yêu cầu giữ nguyên tình huống, nhãn và phép chấm; ưu tiên yêu cầu bỏ MFA bị AUTO. Checkout gốc và clone đánh giá trước được bảo toàn; code sửa nằm trong clone riêng `fix-repo`.

## Kết quả trước–sau

| Chỉ số trên cùng 128 ca | Trước | Sau |
| --- | ---: | ---: |
| Đúng action | 106/128 — 82,81% | **128/128 — 100%** |
| Đúng action + bucket | 103/128 — 80,47% | **128/128 — 100%** |
| Đúng action + bucket + expected rule | 89/128 — 69,53% | **128/128 — 100%** |
| Expected non-AUTO bị AUTO | 1 | **0** |
| Coverage và readback trong lượt memory | 128/128 | 128/128 |

Ca “Bỏ kiểm soát bảo mật MFA…” hiện ESCALATE / SECURITY_RISK / SEC-008. Backend cũng từ chối APPROVE và OVERRIDE thành approval cho biến thể gỡ MFA. Kiểm tra phủ định giữ “không bỏ/vô hiệu hóa MFA” không trở thành yêu cầu tắt kiểm soát; yêu cầu khẳng định ở mệnh đề sau vẫn bị giữ.

## Contract và nguyên nhân sửa

- Input vẫn là ticket/fields đã validate và redact. Output vẫn là canonical facts cùng decision do policy server quyết định; không thêm quyền, executor hoặc đường AUTO mới cho thao tác cấp quyền/hạ tầng.
- **Risk extraction:** nhận diện cụm “bỏ kiểm soát bảo mật”, “vô hiệu hóa”, public/publicly, sao chép dữ liệu tới ổ cá nhân, phần mềm chưa duyệt, câu lệnh xóa database có mạo từ, cấu hình DNS/firewall/quota và marker injection. Áp dụng precedence hiện có; không gán decision theo case ID.
- **Diagnostic routing:** giữ hướng dẫn cụ thể cho thiết bị/mạng/tài khoản; từ khóa rộng như “tài liệu”, “cuộc họp” không tự chuyển lỗi thiết bị thành chat hoặc tác vụ cần transcript. Bổ sung cặp subject/symptom cho chậm/crash/pin/camera/phần mềm, giữ các rủi ro và mâu thuẫn độc lập.
- **Clause context:** chỉ gộp câu hỏi kiểm tra hoàn chỉnh, khai báo thiếu facts/artefact, hoặc ngữ cảnh VPN đã có tài khoản. Regex có biên kết thúc, không nuốt yêu cầu cấp quyền/thực thi ghép thêm. Hai sự cố riêng vẫn là hai yêu cầu.
- **Ambiguous reset:** phân biệt việc chưa chọn restart/factory reset với yêu cầu factory reset đã khẳng định. Một yêu cầu destructive độc lập phía sau vẫn bị chuyển người có thẩm quyền.
- **Preview safety:** thêm `INTAKE_REVISION=support-intake-v2` vào fingerprint. Preview tính bằng bộ trích xuất trước bản sửa không được xác nhận lại, phải phân tích mới. Rule definitions/policy version v5.20 không đổi; revision extraction và runtime digest phân biệt bản sửa này.

## Tính toàn vẹn của phép đo

Không sửa dataset, manifest, evaluator, summary script hoặc bất kỳ test có sẵn nào để đạt tỷ lệ. Dataset vẫn SHA-256 `4f824e412e7e494d164b26de9fd1a505219911278277a0f6815c508a07b9a304`. Đã so hash trước–sau của cả dataset/manifest/evaluator/summary. Không có tham chiếu `enterprise-128` hoặc `e128-` trong source ứng dụng.

Chỉ thêm [29 regression assertions mới](../tests/intake-boundary-fixes.test.ts) cho các boundary sửa, gồm biến thể ngoài corpus, phủ định, nguy hiểm ghép thêm, hai sự cố độc lập, chặn human override và preview cũ. Đã tái hiện lỗi MFA bằng regression thất bại trước khi sửa, rồi đạt sau sửa.

Bộ legacy 128 vẫn **89/128 strict**, coverage 128/128; comparator xác nhận **0 ca thay đổi outcome và 0 exact-pass regression**. Nhãn/conflict của legacy được giữ nguyên.

## Phạm vi diff và kiểm tra

Runtime diff từ base: **3 file, 73 dòng thêm và 17 dòng xóa**: [text](../src/domain/text.ts), [conversation](../src/domain/conversation.ts), [support service](../src/services/support.ts). Bổ sung test và tài liệu này. Dataset/evaluator và npm script từ lượt trước được sao chép nguyên trạng vào clone mới, không phải bản sửa logic lần này. Không đổi dependencies/lockfile, cấu hình production, identity assurance, dữ liệu thật hay cơ chế cấp quyền.

- Full Vitest: **1.317 đạt, 0 lỗi, 1 opt-in skip đã có từ trước**.
- Node guard tests theo workflow: **35/35 đạt**.
- Lint, typecheck và `git diff --check`: đạt.
- Production build: **đạt**. Kiểm tra liên kết/conflict marker trong **36 tài liệu** và `git diff --check`: đạt. Không suy ra deploy từ build local.
- Không chạy inference/DB thật hoặc browser E2E; thay đổi tập trung vào domain/service và được chạy qua POST/GET route handlers, state/audit/readback của app.
- Chưa commit, push hoặc deploy trong lượt sửa này.

Chạy lại tại root clone sửa:

```powershell
npm run evaluate:enterprise
npm test
npm run lint
npm run typecheck
npm run build
```

Kết quả 100% là trên **synthetic development đã dùng để sửa lỗi**, với model mock/fault simulation và memory. Không phải accuracy model thật, held-out độc lập, chứng minh sandbox hoặc chứng nhận an toàn production. Cần tập mới được gán nhãn độc lập để đo khả năng tổng quát sau sửa.
