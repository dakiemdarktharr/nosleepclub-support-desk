# Rà soát sau tích hợp main v5.14 — 14/10/2026

**Development exact-match: 90/128 (70,31%), tăng từ 63/128 tại base chốt. Còn 38 mismatch và 1 regression so với nhãn cũ. Đây không phải accuracy độc lập hoặc chứng nhận 9,5/10.**

## Nguồn phiên bản và phạm vi

Bắt đầu đúng base `b069f22b318a7caa3960eefdb5a3e69b7152e8e0`. Bản dọn/sửa riêng của base đã được lưu thành commit `2eeae8b`; [báo cáo base](REPO-AUDIT-2026-10-14.md) giữ nguyên số đo trước tích hợp.

Trong khi rà soát, main tiến lên `aa9ad2c8f9d83ced626212e0e99bbf2fd1c657d2` (policy v5.14). Chủ repo sau đó **cho phép tích hợp main v5.14, kiểm tra lại và push main**. Merge giữ cả lịch sử base lẫn main, không force-push. Ba conflict được giải quyết ở README, rule source và báo cáo case: giữ policy v5.14 của main; giữ README mới và cập nhật ngữ nghĩa; giữ đầy đủ decision log mới ở vị trí đã sắp xếp.

Mọi code runtime trong `src/` sau merge giống `aa9ad2c`. Vì vậy cải thiện benchmark trong lượt tích hợp này đến từ policy/implementation đã có trên main, không phải việc dọn tài liệu hay thay nhãn của task này. Bản sửa bổ sung so với main là kiểm tra Markdown/CI, tài liệu, ignore output tự sinh và E2E kiểm chứng việc UI báo mismatch trung thực. Bỏ import không sử dụng trong model-workflow test để hết cảnh báo lint của main.

User đã cung cấp Git name/email cho clone riêng; chỉ đặt local config ở clone này. Workspace gốc không truy cập được, không đụng vào file cũ. Không dùng production database/credentials, không gọi model tính phí, không triển khai thủ công. Thay đổi có AI assistance; không suy ra human review từ Git author.

Code/merge đã kiểm tra: **`02658ca1c3b559f79da25e99b4e1cd81d1ddf94c`**. Đo lại benchmark và sentiment trên commit này: runtimeDirty=false, digest và metrics khớp lượt trước commit. Commit tài liệu tiếp theo chỉ ghi provenance, không đổi runtime.

## Những thay đổi được giữ

- Ba lỗi ở base đã được main sửa: hồi phục tạm thời không tự đóng ticket; đổi nhóm hỗ trợ xóa loại yêu cầu cũ; SECURITY_CONTROL và PUBLIC_EXPOSURE có rule ID riêng.
- Giữ toàn bộ policy v5.14 được chủ repo duyệt: contract identity/entitlement, registry+ITSM, scope/role/TTL, quota từ capacity và một yêu cầu mỗi ticket; giữ fail-closed khi nguồn xác minh chưa được tích hợp.
- Giữ thay đổi main bỏ daily model call counter production. Timeout/token cap/provider quota/rate limit vẫn áp dụng; `AI_TEST_MAX_ATTEMPTS` là guard riêng cho test.
- README mới có hướng dẫn bắt đầu, hai Mermaid workflow, cấu hình ID/Mongo, số đo và giới hạn. Tài liệu sử dụng/module đầy đủ được giữ ở [USAGE](USAGE.md)/[ARCHITECTURE](ARCHITECTURE.md); 21 báo cáo cũ và 2 decision log được sắp xếp có mục lục, không xóa provenance.
- 14 output tự sinh bỏ theo dõi Git nhưng còn local; giữ immutable manifest và bằng chứng live lịch sử. Ground Truth, policy fixture migration, CSV nhân viên, dataset sentiment và dependency lock không đổi so với base.

## Lỗi E2E phát hiện khi tích hợp

Lượt desktop đầu sau merge: **72 PASS, 1 FAIL**. Test cũ đòi `submission-4` có 4 PASS, trong khi v5.14 xử lý `submission-read-scope` bằng ESCALATE/BEYOND_AUTHORITY vì thiếu entitlement/approval đã xác minh. Unit test từ main đã ghi rõ thay đổi này; E2E chưa được đồng bộ.

Không đổi source fixture hoặc `expected_action=AUTO_APPROVE`. E2E mới bắt buộc UI hiện đủ:

- Expected: `AUTO_APPROVE`.
- Actual: `ESCALATE`.
- Result: `FAIL` và rule `AUTH-ENTITLEMENT-001`.
- Tổng kết pack: **3 PASS / 1 FAIL**; tiếp tục chạy pack khác và input mới được.

Đây là test khả năng báo mismatch trung thực, không phải cách biến một quyết định không khớp Ground Truth thành PASS. Bộ Đề A 5 case vẫn giữ 3 routine/2 escalation. Người gán nhãn độc lập cần adjudicate case read-only trước khi đổi expected hoặc tuyên bố pack 4 ca đạt toàn bộ.

## Metrics trước/sau trên 128 fixture

Nguồn: development, nhãn chưa thẩm định độc lập; model mock, storage memory-demo, Windows Node v24.18.0. Dataset SHA-256 vẫn `e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`. [JSON có 128 case trước/sau, metadata và rule](INTEGRATION-AUDIT-2026-10-14.json); raw text/evidence chỉ lưu local.

| Chỉ số | Base v5.12 | Bản sửa riêng v5.13 | Tích hợp main v5.14 |
| --- | ---: | ---: | ---: |
| Exact-match action/bucket/expected rule | 63/128 (49,22%) | 63/128 (49,22%) | 90/128 (70,31%) |
| Coverage / readback memory | 128/128 | 128/128 | 128/128 |
| Expected routine → escalation | 28/34 (82,35%) | 28/34 | 18/34 (52,94%) |
| Expected routine → hỏi thêm | 6/34 | 6/34 | 16/34 |
| Expected escalation → hỏi thêm (binary FN) | 3/94 (3,19%) | 3/94 | 1/94 (1,06%) |
| Expected escalation → AUTO | 0/94 | 0/94 | 0/94 |
| Exact-pass cũ bị regression | — | 0 | 1 |

Binary positive là ESCALATE; NEEDS_INFORMATION tính negative. Không diễn giải FN hỏi thêm thành cấp quyền sai. Cả 34 expected routine vẫn chưa đạt AUTO: thiếu nguồn identity/entitlement/quota/approval thật là blocker, không được che bởi số test đạt hoặc mức tăng exact-match.

27 exact-match tăng ròng = 28 case từ mismatch sang match, 1 case từ match sang mismatch. 127 case có thay đổi trace/rule/missing fields/subrequests; không có nghĩa 127 action thay đổi. Chi tiết từng case trong JSON.

Regression `gt-authority-008-eleven-gpu`: expected ESCALATE/BEYOND_AUTHORITY, actual NEEDS_INFORMATION/MISSING_INFO với INFO-001; thiếu provider, environment, duration, gpuType, resourceLifecycle, dataSensitivity. Policy v5.14 bỏ ngưỡng demo 2 GPU và cần capacity/quota có nguồn, nên không tự suy ra vượt quota chỉ từ số lượng. Giữ expected cũ và đưa cho chuyên gia adjudicate; không sửa policy để lấy lại điểm.

38 mismatch gồm 16 ROUTINE→MISSING_INFO, 17 ROUTINE→BEYOND_AUTHORITY, 1 ROUTINE→SECURITY_RISK, 3 BEYOND_AUTHORITY→SECURITY_RISK, 1 BEYOND_AUTHORITY→MISSING_INFO. Rule trong mismatch có thể chồng lặp: INFO-001 15, AUTH-007 8, AUTH-005 8, FACT-COLLAB-001 6, FACT-VPN-001 3, INFO-SINGLE-REQUEST-001 2. Đây là đầu mối review, chưa phải nhãn nguyên nhân do chuyên gia xác nhận.

Sentiment fallback chạy lại: 12/12 nhãn rõ, 4/16 ambiguous; precision/recall/F1 = 1 cho ba nhãn trên phần scored, coverage 100%. Synthetic do người phát triển thấy nhãn; không Google Maps, không inference model thật. RAG giữ Hit@1 92%, recall@3 100%, MRR 0,96 trên 50 câu có nguồn và abstention 4/4 câu ngoài corpus. Không suy ra chất lượng trả lời LLM từ retrieval.

## Kiểm tra sau tích hợp

| Kiểm tra | Kết quả |
| --- | --- |
| `npm test` | 865 PASS, 1 opt-in SKIP; 47 files PASS, 1 SKIP |
| Mongo guard + development-report + Markdown checker tests | 18 PASS |
| `npm run check:docs` | 56 Markdown files PASS; không kiểm tra remote URL/heading anchor |
| `npm run lint` | PASS, 0 warning sau bỏ import thừa; 10 model-workflow tests chạy lại PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| E2E desktop lần đầu | 72 PASS, 1 FAIL stale expectation; nguyên nhân và bản sửa ở trên |
| E2E desktop sau sửa | 73 PASS |
| E2E mobile sau sửa | 72 PASS, 1 SKIP quay video desktop |
| `npm run evaluate:sentiment` | 3 PASS; local fallback |
| `npm run test:persistence` | 1 SKIP, NOT_PERFORMED; không có Mongo test cô lập |
| `npm audit` / `npm audit --omit=dev` | 7 high dev tooling / 0 production; lock không đổi |
| Immutable dataset/manifest/CSV/sentiment/lock diff với base | Không đổi |

Build và E2E chạy tuần tự, server riêng 127.0.0.1:3227, mock/memory, không tái sử dụng server người dùng. Test E2E PASS không đồng nghĩa mọi nhãn Verify PASS: mismatch đã biết phải được hiển thị trung thực.

## Blocker và việc tiếp theo

1. **38 development mismatch + read-only Verify:** người có chuyên môn phân xử từ input/evidence và policy. Giữ tách development/held-out/adjudicated; không dùng 70,31% làm độ chính xác tổng quát.
2. **Nguồn authority:** tích hợp và kiểm chứng identity/entitlement, registry+ITSM, service TTL, project/team capacity. v5.14 mới có contract/fail-closed, chưa có nguồn VNG thực hoặc cơ chế thực thi/thu hồi tài nguyên.
3. **Mongo:** operator chuẩn bị Mongo local disposable; chạy [restart harness](../RUNBOOK.md#kiểm-tra-mongo-trong-môi-trường-thử-nghiệm-riêng). Identity transaction/unique index/concurrency cần replica set test riêng. Mongo health durable=true không đủ chứng minh restart persistence.
4. **Dependency:** 7 mục high cùng nguồn [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), chưa có bản vá tương thích lúc kiểm tra. Không force upgrade/downgrade hoặc thêm audit exception để che. Production dependency tree audit sạch không đồng nghĩa toàn app an toàn.
5. **Identity và reviewer:** ID-only/public reviewer vẫn là demo; cần quyết định xác thực/SSO và scope reviewer production, không nhập dữ liệu nhân viên thật vào demo công khai.
6. **Bằng chứng độc lập:** báo cáo feedback ba người đã được gỡ khỏi cây mã nguồn công
   khai theo yêu cầu chủ repo. Bản công khai hiện không lưu tên, trích dẫn hoặc hồ sơ
   từng người; điều này không phủ nhận việc đã thu thập feedback. Vai trò, consent, đo
   tác động, held-out và retest trên đúng SHA cần được trình bày bằng bằng chứng phù
   hợp nếu dùng cho kết luận đánh giá.
7. **Live:** lượt này chỉ đọc health ở revision e5bae44 trước tích hợp; chưa gọi inference hoặc kiểm chứng deployment của commit mới. Push GitHub không xác nhận website đã chạy đúng source.

Chưa có cơ sở chấm 9,5/10 hoặc khẳng định “đã sửa tất cả lỗi”. Báo cáo phân biệt rõ lỗi đã sửa, mismatch cần adjudication, hạn chế kiến trúc và bằng chứng chưa thu thập.
