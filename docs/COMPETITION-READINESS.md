# VNG Support — bằng chứng readiness ngày 07/10/2026

**Chưa đủ cơ sở kết luận 9,5/10.** Lượt này sửa lỗi có regression, bổ sung
đường demo/audit, privacy và protocol thu thập. Exact-match development vẫn
56/128. Held-out độc lập và bằng chứng ba người dùng thực tế **NOT COLLECTED**.
Đây là đánh giá kỹ thuật có AI assistance, không phải điểm của giám khảo.

## Revision, phạm vi và bảo toàn

- Base GitHub `main`: `c2a832031deedd758120d49578eed52f6c12d190`, đã xác minh lại
  từ remote trước sửa; không dùng SHA của lượt bàn giao cũ làm HEAD.
- Code candidate: `b4b995ec91ac54cbba11d37779f09665d9b2643e`. Báo cáo được commit sau code;
  commit tài liệu không thay runtime. Kết quả được đo lại trên commit code.
- Checkout gốc ở `codex/support-v3-migration`, HEAD `d797f3c5d25bbc07c9ddc4746669534fbbebd61d`,
  có 307 mục thay đổi/chưa track đã snapshot. Dùng worktree sạch detached từ
  base; không sửa, stage hoặc tích hợp các thay đổi đó.
  Đối chiếu cuối lượt: cả 307 mục và hash nội dung giữ nguyên; remote main vẫn
  ở base. Các worktree cũ và artifact có sẵn được giữ nguyên.
- Phạm vi: parsing/context, route work-evidence, redaction, Verify/reviewer/tour,
  regression và metric provenance, hai dependency patch, tài liệu bằng chứng.
  Không đổi Ground Truth, expected action/bucket/rule, quota hoặc authority gate.
- Chỉ commit local theo yêu cầu. Không push, merge, deploy, dùng Mongo production
  hoặc gọi model tính phí. Artifact test có timestamp/UUID/ảnh/video không stage.

## Tính năng giữ nguyên

| Luồng/module | Hành vi và ranh giới |
| --- | --- |
| Trang đầu, ID và onboarding | Hai vai trò; sender login ID-only demo; đơn ID/profile và IT review riêng, Mongo-only; không coi ID là xác thực production. |
| Intake | Freeform/danh mục → preview → xác nhận lưu; clarification, hội thoại, sentiment, theo dõi và QR vẫn có. |
| Quyết định | Extraction có schema/evidence, nhiều subrequest, deterministic rule precedence; không thực thi IAM/cloud/DB thật. |
| Tri thức | RAG BM25 trên corpus có revision/nguồn, không embeddings; candidate từ feedback phải chờ rà soát. |
| Reviewer/audit | Hàng đợi/filter/search, yêu cầu bổ sung, từ chối có lý do, Stop/Override có guard và lịch sử; public demo chưa có team RBAC. |
| Verify | Bộ chung, Đề A 5 ca, judge-15, lưu/tiếp tục lượt và input mới qua API thật của app; chạy local dùng provider mock. |

## Đánh giá development trước/sau

Lệnh: `npx vitest run tests/support-verify.test.ts`, sau đó
`node scripts/development-report.mjs`. 128 fixture gốc được giữ nguyên; đây là
development đã dùng để phân tích/sửa, **không phải held-out**. Baseline chạy
mới ngày 07/10 ICT trên base sạch, không lấy lại số ngày 03/10. Cả hai dùng
Windows, Node 24.18.0, provider `mock`, model `mock-no-api-call`, storage
`memory-demo`, API route và GET readback. Policy base v5.7, candidate v5.8.
Provenance và số đếm không chứa raw ticket nằm trong [bản so sánh](READINESS-COMPARISON.json).

| Chỉ số | Base | Candidate |
| --- | ---: | ---: |
| Exact-match action + bucket (rule nếu expected cung cấp) | 56/128 (43,75%) | 56/128 (43,75%) |
| Available / coverage | 128/128 (100%) | 128/128 (100%) |
| API readback trong cùng memory process | 128/128 | 128/128 |
| Routine bị ESCALATE | 33/34 | 33/34 |
| Routine bị hỏi thêm | 1/34 | 1/34 |
| Expected ESCALATE thành AUTO_APPROVE | 0/94 | 0/94 |
| Expected ESCALATE thành NEEDS_INFORMATION | 1/94 | 1/94 |
| Binary FNR (ESCALATE là positive) | 1/94 (1,06%) | 1/94 (1,06%) |
| Unnecessary escalation trong nhóm expected không ESCALATE | 33/34 (97,06%) | 33/34 (97,06%) |
| Ca exact-pass cũ bị regression | — | 0 |

Confusion matrix giống nhau ở cả hai phiên bản:

| Expected ↓ / Actual → | AUTO_APPROVE | NEEDS_INFORMATION | ESCALATE |
| --- | ---: | ---: | ---: |
| AUTO_APPROVE | 0 | 1 | 33 |
| NEEDS_INFORMATION | 0 | 0 | 0 |
| ESCALATE | 0 | 1 | 93 |

Binary FN duy nhất là `gt-missing-007-dbt-runner`: expected ESCALATE/MISSING_INFO,
actual NEEDS_INFORMATION/MISSING_INFO. Đây là hỏi bổ sung, không tự cấp quyền,
nhưng vẫn phải tính FN theo định nghĩa đã công bố. Cần người gán nhãn phân xử
semantics; không tự sửa expected. Tập này không có expected NEEDS_INFORMATION.

72 mismatch đều có nhiều subrequest: 34 ca có 2, 37 ca có 3, 1 ca có 4.
Nhóm bucket: ROUTINE→BEYOND_AUTHORITY 31; MISSING_INFO→BEYOND_AUTHORITY 30;
ROUTINE→MISSING_INFO 1; BEYOND_AUTHORITY→SECURITY_RISK 6;
SECURITY_RISK→BEYOND_AUTHORITY 1; ROUTINE→SECURITY_RISK 2;
MISSING_INFO→MISSING_INFO 1 (khác action).

| Rule trong ca mismatch (có thể trùng nhóm) | Base | Candidate |
| --- | ---: | ---: |
| INFO-001 | 64 | 61 |
| INFO-005 | 56 | 53 |
| AUTH-005 | 66 | 63 |
| AUTH-007 | 20 | 21 |
| INFO-EVIDENCE-001 | 2 | 1 |
| AUTH-002 / AUTH-001 | 9 / 8 | 9 / 8 |
| SEC-005 / SEC-001 / SEC-003 | 4 / 3 / 1 | 4 / 3 / 1 |
| AUTH-008 / GUIDE-007 | 1 / 1 | 1 / 1 |

Sửa alias/approval context thay số subrequest ở 7 ca và danh sách rule ở 6 ca,
nhưng không đổi action/bucket tổng. Không gọi giảm rule giả là tăng accuracy.
Đã chạy lại 128 ca sau nhóm parsing/routing, sau privacy và sau bản dependency
cuối; mỗi lượt vẫn 56/128, không regression exact-pass.

## Nguyên nhân, sửa và việc cần adjudication

| Vấn đề/trace | Sửa hoặc giới hạn |
| --- | --- |
| Alias `lý do`, `resource scope` bị tách thành OTHER rồi AUTH-005 | Dùng chung từ vựng extract/split; regression input VPN + lý do trở lại routine, request access thiếu approval vẫn hỏi thêm. |
| Một câu approval metadata bị coi là tác vụ riêng | Chỉ gộp claim hoàn chỉnh có giới hạn; claim không có trong registry vẫn AUTH-007. Clause chứa thêm thao tác vẫn được giữ. |
| Permission request nhắc email/meeting bị route thành tác vụ thiếu artefact | Guard permission rõ ràng; tác vụ thật như soạn email/tối ưu SQL vẫn giữ đường work-evidence. |
| Nguy hiểm trong fact/đằng sau claim/phủ định ở câu trước | Regression giữ kiểm tra rủi ro toàn input và subrequest, không nuốt tác vụ không nhận diện. |
| Claimed manager approval và thời lượng vượt quota trong fixture legacy | Không hợp thức hóa claim; nhiều expected routine thiếu verified scope/TTL trong runtime hiện hành. Owner/policy reviewer cần phân xử từng ca, lưu nhãn gốc và quyết định riêng. |
| Fragment ngôn ngữ tự nhiên còn mất context/catalog hoặc bị coi là tác vụ khác | Chưa giải quyết toàn diện; 72 mismatch còn nguyên. Không bỏ mọi unknown clause để tăng AUTO. Cần regression theo contract cho từng họ câu trước tối ưu tiếp. |

`tests/readiness-regressions.test.ts` chứa 12 regression/negative controls mới.
Bump policy v5.8 để vô hiệu preview/cache cũ; không nới permission, risk hoặc
quota. Chỉ hai assertion version metadata cũ đổi từ v5.7 sang v5.8.

## Demo, privacy và độ tin cậy

Verify hiển thị thêm evidence, policy và nơi tiếp nhận có nhãn mô phỏng. Reviewer
ghi rõ public demo, không có xác thực thành viên team. E2E mới đi từ trang đầu
bằng bàn phím → Đề A 3 routine/2 escalation → lịch sử/audit → input mới.
Test đã tìm ra tour mobile che nút lịch sử; sửa khoảng cuộn dưới tip, không
forced click/tăng timeout. [Hướng dẫn giám khảo](JUDGE-ONBOARDING.md).

Redaction bổ sung OTP JSON/khoảng cách/Unicode, CCCD phân cách, email ASCII,
employee ID có nhãn trong nội dung. Test kiểm tra model boundary bằng spy,
memory persistence, audit API và UI với synthetic sentinel. Không che tên,
địa chỉ tự do hoặc toàn bộ metadata ID. Không chứng nhận ẩn danh toàn diện;
xem [inventory](PRIVACY-INVENTORY.md). Không dùng tên seed chưa xác minh làm test mới.

Dependency lockfile vá `sharp 0.35.4 → 0.35.5` theo
[advisory của sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) và
`source-map-js 1.2.1 → 1.2.2` theo
[advisory source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
Không đổi package manifest/framework; 28 entry lockfile đổi thuộc sharp/native
binaries và source-map-js, không thay dependency ngoài hai họ này.

**Audit chưa đạt**: 11 (9 high/2 moderate) trước vá, 9 (7 high/2 moderate) sau vá.
Đây là số package bị ảnh hưởng kể cả phụ thuộc, không phải 9 lỗ hổng độc lập.
[braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) chưa có bản vá;
[postcss-selector-parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)
có vá 7.1.6 nhưng Tailwind 3 đang dùng major 6. Không ép major override hoặc
`audit fix --force`. Code ứng dụng không import các parser/glob này; cấu hình
Tailwind quét source trong repo. Đây là giới hạn bề mặt được rà soát, không
chứng minh không thể khai thác. Chỉ build source tin cậy; owner theo dõi upstream
và lập lượt migration có kiểm tra tương thích trước công bố production-ready.

## Lệnh kiểm tra và kết quả

Môi trường local synthetic/mock/memory, model budget 0, API key/Mongo URI rỗng;
build tuần tự trước E2E production start ở `127.0.0.1:3227`, không tái dùng server.
Full checks chạy trước commit trên đúng nội dung code/lockfile được commit;
128 fixture chạy lại sau commit với `runtimeDirty=false`. Runtime digest SHA-256:
`8ef9ca3e0dc14cbb620cce5055b4421e8e36b21924effb02e43877cb119de6e5`.

| Lệnh | Kết quả candidate |
| --- | --- |
| `npm test` | 613 pass, 1 skip (benchmark opt-in), 38 file pass/1 skip |
| `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs` | 13 pass: 11 Mongo guard, 2 metric reporter |
| `node --check scripts/mongo-restart-smoke.mjs` | Pass cú pháp; không phải chạy Mongo |
| `npm run lint` / `npm run typecheck` / `npm run build` | Pass sau bản vá dependency |
| `SUPPORT_E2E_PRODUCTION=true npm run test:e2e -- --project=chromium` | 67 pass |
| `SUPPORT_E2E_PRODUCTION=true npm run test:e2e -- --project=mobile` | 66 pass, 1 skip (quay video chỉ desktop) |
| `npx vitest run tests/support-verify.test.ts` | 22 test pass; 128 fixture được báo 56 exact/72 mismatch, không đồng nghĩa 128 exact-pass |
| `npm audit --audit-level=high` | Exit 1; 7 high, 2 moderate còn lại như trên |
| `git diff --check` và review file stage | Không stage secret, .env, runtime artifact hoặc GT |

Lần E2E trước sửa tour: desktop 67 pass; mobile 65 pass/1 fail/1 skip.
Sau sửa: targeted mobile 12/12; full desktop 67, mobile 66/1 skip đã đạt trước
vá dependency. Bảng trên ghi lần chạy lại trên dependency cuối. Mobile skip là
quay video dành desktop. Chưa có kiểm thử screen reader thủ công/thiết bị thật.
[Hosted CI của base](https://github.com/dakiemdarktharr/vng-support/actions/runs/37507478708)
đã xanh; candidate không push nên chưa có hosted CI Linux của commit mới.

Đã đọc log failed của các run [37502070309](https://github.com/dakiemdarktharr/vng-support/actions/runs/37502070309),
[37500524917](https://github.com/dakiemdarktharr/vng-support/actions/runs/37500524917)
và [37493357723](https://github.com/dakiemdarktharr/vng-support/actions/runs/37493357723):
`judge-guide.spec.ts` reviewer tour bị `.guide-tip` chặn click, timeout 60 giây.
Base đã sửa đường này và hosted CI mới nhất pass; candidate chạy lại toàn bộ
tour pass. Lỗi sender-history mobile được tìm/sửa trong lượt này là regression
mới bổ sung, không nhận công sửa lịch sử CI của base.

## Live và Mongo: ranh giới bằng chứng

GET chỉ đọc [health live](https://vng-support.vercel.app/api/support/health)
ngày 07/10 ICT trả `status=ok`, revision base `c2a8320`, policy v5.7,
`provider=openai`, `storage=MONGODB`, `durable=true`, `simulated=true`,
`persistenceVerification=NOT_PERFORMED`. Không lộ tên model trong health;
không chạy Verify live, write, API model hoặc chứng minh chất lượng live.
Candidate v5.8 chưa triển khai.

Không tìm thấy mongod/Docker phù hợp trong môi trường kiểm tra. Đã đọc harness
và chạy guard; **persistenceVerification=NOT_PERFORMED**. Harness từ chối URI có
credential/DNS/options, app Mongo env, dotenv ngoài example; dùng DB tên mới và
giữ dữ liệu sau test. Nó kiểm tra readback trực tiếp, restart **app process**,
CAS 200/409 và unavailable 503; không restart mongod và không chứng minh identity
transaction trên replica set. Loopback không tự chứng minh không phải tunnel.

Owner có thể chạy sau khi tự xác nhận Mongo disposable mới, port 27028 trống,
không tunnel/production. Trong terminal riêng có `mongod` đã cài:

```powershell
$mongoTestDir = Join-Path ([IO.Path]::GetTempPath()) ('vng-support-mongo-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $mongoTestDir
mongod --bind_ip 127.0.0.1 --port 27028 --dbpath $mongoTestDir
```

Trong **checkout sạch riêng không có dotenv**, PowerShell riêng:

```powershell
$env:AI_PROVIDER='mock'
$env:AI_MAX_ATTEMPTS='0'
$env:OPENAI_API_KEY=''
$env:MONGODB_URI=''
$env:MONGODB_DB=''
$env:IDENTITY_MONGODB_URI=''
$env:IDENTITY_MONGODB_DB=''
$env:VERCEL=''
$env:SUPPORT_STORAGE='memory-demo'
$env:SUPPORT_ACCESS_MODE='public-demo'
npm ci --ignore-scripts --no-audit --no-fund
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
$env:SUPPORT_TEST_MONGO_ACK='isolated-local-synthetic'
$env:SUPPORT_TEST_MONGO_URI='mongodb://127.0.0.1:27028/'
node scripts/mongo-restart-smoke.mjs
```

Lưu output cùng SHA/provider/storage; đừng gọi guard pass là persistence pass.
Nếu cần chứng minh restart database, owner phải bổ sung phép đọc lại sau
restart chính mongod disposable đó; identity cần bộ riêng trên replica set test.

## Điểm dự kiến và việc chủ repo cần làm

Ước lượng có điều kiện theo trọng số người dùng yêu cầu, không chuyển tỷ lệ
fixture thành accuracy thực tế hay dùng rubric này thay điểm chính thức:

| Nhóm | Trọng số | Điểm /10 | Đóng góp | Căn cứ/thiếu hụt |
| --- | ---: | ---: | ---: | --- |
| Sản phẩm/demo | 20% | 8 | 1,60 | Luồng local đầy đủ, E2E; deck/video cuối và thao tác live chưa xác nhận. |
| AI/policy | 25% | 5 | 1,25 | Rule/evidence fail-safe; development 43,75%, over-escalation cao, chưa held-out/live. |
| Kỹ thuật/độ tin cậy | 15% | 7 | 1,05 | Tests/build và reproducibility; còn advisory, Mongo/hosted Linux candidate chưa kiểm chứng. |
| Giải trình/quyền/riêng tư | 15% | 7 | 1,05 | Audit và privacy boundary test; public demo, ID-only, PII chưa đầy đủ. |
| Độc lập/tác động | 25% | 1 | 0,25 | Có protocol nhưng không có kết quả; 1 điểm chỉ cho mức chuẩn bị, không cho tác động. |
| **Tổng ước lượng** | **100%** | | **5,20/10** | **Chưa đạt mục tiêu 9,5.** |

1. Owner chỉ định policy reviewer để adjudicate legacy labels/verified approval,
   giữ bản gốc; sửa tiếp các họ multi-request/catalog bằng development regression.
2. Người giữ tập độc lập thực hiện [protocol](INDEPENDENT-EVALUATION-PROTOCOL.md):
   đóng băng held-out, nhãn trước output, đo đầy đủ lỗi/coverage. Hiện NOT COLLECTED.
3. Tuyển ít nhất 3 người làm quy trình thật, consent và văn bản tự viết, đo trước/sau,
   ghi bất cập; nối ít nhất 1 feedback → commit → retest. Tất cả NOT COLLECTED.
4. Cấp môi trường test cô lập và budget được phép để đo Mongo/readback/restart,
   identity transactions và model thật. Không dùng production để bổ sung evidence.
5. Chốt identity provider, team/scope/actor đáng tin cậy, retention và giới hạn
   reviewer trước dùng dữ liệu thật; theo dõi dependency advisory còn mở.
6. Duyệt [5 slide/video/checklist](SUBMISSION-CONTENT.md), hoàn thiện sản phẩm nộp
   cuối và [build log](BUILD-LOG-READINESS.md); xác nhận brief mới nhất với BTC.
   Adaptive threshold hiện chỉ có đề xuất offline, còn thiếu vận hành/authorization
   theo brief; không tự bật production để đánh dấu hoàn tất.
