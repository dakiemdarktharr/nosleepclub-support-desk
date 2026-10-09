# Đánh giá sentiment riêng — 10/10/2026 (ICT)

Base GitHub main: `1a802f429a7b873e4bf2b953b323dec1077b8bd0`.
Worktree sạch, detached; không sửa checkout gốc đang dirty. Chỉ commit local,
không push/deploy, không dùng Mongo production hoặc API tính phí. Công việc và
nhãn nháp có AI assistance (Codex); chưa có human review/adjudication.

## Quyền dữ liệu và nguồn thực sự

Đã đọc điều khoản hiện hành ngày 10/10/2026. [Google Maps Platform §3.2.3(a–c)](https://cloud.google.com/maps-platform/terms)
giới hạn trích xuất/lưu review, tạo nội dung từ Maps và dùng nội dung để
train/test/validate AI. Chưa có quyền riêng cho mục đích này: **không thu thập,
không lưu, không chuyển bối cảnh review Google Maps**.
[Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies)
yêu cầu attribution và đường tới review nguồn bằng `googleMapsUri` khi hiển thị;
đó không phải giấy phép tạo dataset đánh giá.

Nguồn duy nhất là 16 tình huống helpdesk viết mới, không dựa trên review thực
đã đọc. `fictionalStars` (3, 4 hoặc null) là thuộc tính giả định do AI soạn để
minh họa số sao không quyết định cực tính. Không có người đánh giá/quán thật,
raw review, dịch/paraphrase review, Places API call hoặc scraping.
Nếu nhóm muốn dữ liệu bên ngoài, người phụ trách phải xác minh quyền lưu,
biến đổi, đánh giá AI và công bố; không tự đổi provenance để vượt schema.

## Contract dữ liệu và phép đo

- File: `data/sentiment/helpdesk-affect-v1.json`, phiên bản 1.0.0, split
  development. ID ổn định, text, label/ambiguous, evidence nguyên văn từ text,
  rationale, confidence, adjudicator=null. Provenance ở cấp dataset áp dụng
  mọi case: original-synthetic, no-third-party-content, AI-assisted draft.
- Tách sentiment khỏi satisfaction (hài lòng), resolution (đã hết lỗi) và
  workflow. Các trường phụ là nhãn nháp, không dùng làm đầu vào classifier.
- `src/evaluation/sentiment.ts` là boundary import JSON qua Zod: giới hạn độ
  dài/số case, enum, unique ID, quote phải có trong text, strict keys,
  không nhận nguồn bên ngoài hoặc held-out. Đây là kiểm tra khai báo, không
  phải xác minh giấy phép/PII hoặc danh tính adjudicator.
- 4 case ambiguous giữ nguyên và báo riêng, không quy thành neutral để tăng
  accuracy. Runtime vẫn có 3 nhãn, chưa có nhãn mixed/abstain; kết quả ở các
  case này cần người phân xử. Mẫu số accuracy là 12 nhãn tạm không ambiguous.
- Confusion matrix hàng expected/cột actual; missing prediction có cột
  unavailable, vẫn tính FN. Precision/recall/F1 mẫu số 0 là null. Coverage
  tính trên cả 16 case. Không đặt ngưỡng accuracy để ép bộ kiểm thử PASS.
- Lệnh `npm run evaluate:sentiment` chỉ gọi fallback local, không đọc API key
  hoặc gửi dữ liệu tới provider. `SENTIMENT_REPORT_OUT` cho phép xuất JSON,
  từ chối ghi đè. Artifact có từng case, evidence, rationale, mismatch,
  hàng đợi ambiguous, SHA base/code, runtime dirty/hash, dataset/evaluator hash.

## Luồng và lỗi đã sửa

Intake → redaction → extraction kèm sentiment (hoặc sentiment riêng ở nhánh
deterministic) → schema/evidence validation → preview → xác nhận request.
Policy luôn quyết định action/bucket. Không thêm call vào nhánh này.

Sau câu trả lời → redaction → phát hiện risk/authority/USER_HANDOFF → nếu cần
thì policy xử lý trước; phần feedback an toàn dùng model/fallback để quan sát
cảm xúc. `explicitFeedbackChoice` kiểm tra riêng xác nhận giải quyết/yêu cầu
chuyển người. Câu hỏi, phủ định và một số cấu trúc điều kiện không xác nhận
hoàn tất. Cảm xúc/courtesy đơn thuần ghi COMMENT và giữ trạng thái; UI xác nhận
đã nhận. Phản hồi mới có thao tác vẫn đi qua phân tích policy.

Base dùng positive → RESOLVED, negative → ADMIN. Vì vậy model positive có thể
đóng cả “hài lòng nhưng VPN vẫn lỗi”; negative có thể chuyển người dù đã xác
nhận sửa xong. 9 regression mới chạy trên base: **9 fail**; sau sửa đạt.
Không thay expected/GT cũ. Các nút lựa chọn vẫn hoạt động, không suy ra cảm xúc
từ việc bấm nút. Knowledge candidate chỉ tạo từ xác nhận giải quyết, vẫn chờ
review. Trạng thái hoàn tất là ghi nhận của người dùng, không đo máy đã sửa thật.

Fallback trước sửa nhận “không bực mình”/“not frustrated” là negative.
Sửa phạm vi phủ định sát cue, giữ cảm xúc được khẳng định ở clause sau.
Không sửa risk parser, policy source, quota, approval hoặc Ground Truth.
Fallback sau câu trả lời không còn coi lời cảm ơn hay yêu cầu chuyển người
đơn thuần là cảm xúc. Xác nhận thành công rõ ràng còn dùng heuristic legacy
về relief; không coi heuristic đó là xác nhận mức hài lòng thực tế.

Audit giữ rule/quyết định deterministic, trước/sau và lý do riêng với cảm xúc;
feedback lưu assessment đã validate (nguồn, model/fallback, evidence,
explanation) khi có. Câu rủi ro bỏ qua sentiment post-answer; trường neutral
legacy trong feedback không phải inference trong nhánh đó. Không backfill
history. Không log raw exception hoặc chain-of-thought. Giữ 6s/128-token cap,
budget chung, redaction, schema/evidence validation và fallback.

## Kết quả trước/sau

Đo ngày 10/10/2026 ICT, Node v24.18.0, không provider/model/storage. Base runtime
sạch ở SHA trên; candidate là nội dung commit chứa báo cáo này. Bộ nhãn giữ
nguyên từ trước sửa, đã được developer/AI nhìn thấy.
Dataset SHA256: `eee7d7eabd15d0a0fa833f309e3348aa238f81209d5722ae86ad08cc68cfd131`.
Base runtime hash: `99f19a387f2bf115a7ad958957c32695d24726e92d3d6fe843c8634f0920b194`.
Candidate classifier hash: `810f1d78a1115be0193d8593b27b709f9e5ce27215b4ccf70e9695612c74908c`.
Các hash runtime này bao phủ feedback-model, feedback, text và redaction;
không phải digest toàn ứng dụng. Artifact candidate ghi runtimeDirty=true trước
commit, không mạo nhận là SHA đã commit. Policy giữ `support-guidance-v5.9`;
baseline reporter ban đầu chưa xuất trường policyVersion, candidate đã bổ sung.

Muốn tái lập baseline: trong worktree riêng tại base, chỉ chép dataset,
`src/evaluation/sentiment.ts` và `tests/sentiment-evaluation.test.ts` từ commit
này, giữ runtime base; chạy Vitest với `SENTIMENT_REPORT_OUT` trỏ file mới.
Ở candidate chạy lệnh trong runbook. Đối chiếu datasetSha256 trước khi so sánh;
không đổi nhãn/input giữa hai lần. Baseline/candidate JSON và logs của lượt này
giữ local, không commit artifact sinh ra.

| Phép đo fallback support-request | Base | Candidate |
| --- | ---: | ---: |
| Đúng trên nhãn tạm không ambiguous | 10/12 (83,33%) | 12/12 (100%) |
| Coverage | 16/16 | 16/16 |
| Ambiguous giữ ngoài accuracy | 4/16 (25%) | 4/16 (25%) |
| Case nhãn rõ bị regression | — | 0 |

| Expected → actual (positive / neutral / negative) | Base | Candidate |
| --- | --- | --- |
| positive (4) | 4 / 0 / 0 | 4 / 0 / 0 |
| neutral (5) | 0 / 3 / 2 | 0 / 5 / 0 |
| negative (3) | 0 / 0 / 3 | 0 / 0 / 3 |

| Nhãn | Precision / recall / F1 base | Candidate |
| --- | --- | --- |
| positive | 1 / 1 / 1 | 1 / 1 / 1 |
| neutral | 1 / 0,6 / 0,75 | 1 / 1 / 1 |
| negative | 0,6 / 1 / 0,75 | 1 / 1 / 1 |

Thay đổi từng case: syn-05, syn-16 negative → neutral (phủ định, hết mismatch).
syn-06 positive → neutral, nhưng **vẫn ambiguous**, không tính là sửa đúng.
13 case còn lại không đổi prediction. syn-01, syn-06, syn-07, syn-14 còn
trong hàng đợi adjudication. Không có nhãn nào được sửa sau baseline.

**100% trên 12 câu development do AI soạn không phải accuracy của Luna,
held-out, quyết định policy IT hay nghiên cứu người dùng.** Chưa đo domain
shift từ nhà hàng vì không dùng review; vẫn cần kiểm chứng chuyển miền nếu
sau này dùng nguồn review hợp lệ.

## Giới hạn và việc nhóm cần làm

1. Người hiểu helpdesk gán nhãn độc lập cho cảm xúc, mức hài lòng và trạng thái
   giải quyết, ghi bất đồng/rationale. Giữ bản nháp này riêng; không tự gọi nó
   là ground truth. Human adjudication: **NOT COLLECTED**.
2. Người giữ tập độc lập chuẩn bị/freeze tập mới trước khi developer nhìn
   thấy. Không đổi tên bộ 16 câu này thành held-out. **NOT COLLECTED**.
3. Sau khi duyệt dữ liệu và ngân sách, chạy model thật trên SHA/model cụ thể,
   giữ timeout/fallback/unavailable trong mẫu số; so với fallback riêng.
   Live sentiment evaluation trong nhiệm vụ này: **NOT_PERFORMED**.
4. Sarcasm, lời nói gián tiếp, mixed affect, phủ định phức tạp và điều kiện
   chưa được hiểu toàn diện bằng regex. Runtime không có mixed/abstain;
   khi không rõ kết quả, dùng nút xác nhận và policy, không gán quyền từ cảm xúc.
5. Redaction chỉ bao phủ pattern trong [inventory](PRIVACY-INVENTORY.md),
   không chứng minh loại hết PII/copyright. Thu phản hồi và consent người dùng
   thật theo [protocol](INDEPENDENT-EVALUATION-PROTOCOL.md): **NOT COLLECTED**.
   Không suy ra production-ready hoặc 9,5/10 từ các kiểm thử này.

## Kiểm tra

| Lệnh / phạm vi | Kết quả |
| --- | --- |
| `npm test` | 692 pass, 1 opt-in skip; 45 file pass, 1 skip |
| `npm run evaluate:sentiment` với output JSON mới | 3 pass; metrics như trên |
| `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs` | 15 pass |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| E2E Chromium: 5 spec liên quan | 20 pass |
| E2E mobile: cùng 5 spec | 20 pass |
| `git diff --check` | PASS |

E2E dùng `SUPPORT_E2E_PRODUCTION=true`, sau build chạy lần lượt:

```powershell
npm run test:e2e -- --project=chromium tests/e2e/enterprise-feedback.spec.ts tests/e2e/conversation.spec.ts tests/e2e/support.spec.ts tests/e2e/sentiment-diagnostics.spec.ts tests/e2e/competition-readiness.spec.ts
npm run test:e2e -- --project=mobile tests/e2e/enterprise-feedback.spec.ts tests/e2e/conversation.spec.ts tests/e2e/support.spec.ts tests/e2e/sentiment-diagnostics.spec.ts tests/e2e/competition-readiness.spec.ts
```

Server riêng port 3227, mock/memory, không API tính phí; kiểm tra Verify Đề A,
input mới, risk precedence, audit/UI redaction, feedback và fallback. Không
chạy lại toàn bộ E2E ngoài 5 spec. Unit có provider stub và model injection,
không phải benchmark model thật. Không chạy Mongo restart hoặc kiểm tra deployment
trong lượt này. Không đổi dependency tree hoặc chạy audit mới.

Checkout gốc vẫn ở `d797f3c`, branch `codex/support-v3-migration`, danh sách
dirty giữ nguyên; không sửa/stage file tại checkout đó. Artifact/logs/ảnh được
sinh trong worktree task được để ngoài commit, không xóa file người dùng.
