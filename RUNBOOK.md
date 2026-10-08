# VNG Support — Hướng dẫn vận hành

Hướng dẫn thao tác sản phẩm nằm trong [README](README.md). File này dành cho cài đặt, kiểm tra và bảo trì repository.

## Chạy local

Dùng Node.js 22+ và npm. Trong PowerShell, tại thư mục repository:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Chỉ sao chép `.env.example` khi chưa có `.env.local`; giữ cấu hình cá nhân đã có. Mở `http://localhost:3000`. Cấu hình mẫu sử dụng model mock và `memory-demo`.

## Kiểm tra trước khi phát hành

```powershell
npm run lint
npm run typecheck
npm test
node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs
npm run build
npm run test:persistence
$env:SUPPORT_E2E_PRODUCTION='true'
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=mobile
npm audit
```

Playwright tự khởi động server riêng tại `127.0.0.1:3227` với model mock và bộ nhớ tạm. Chạy build xong mới chạy E2E vì cùng sử dụng `.next`. Chạy desktop và mobile riêng để mỗi lượt có server và hạn mức request riêng. Không dừng một tiến trình khác đang dùng cổng này.

Báo cáo, ảnh chụp và video do test sinh ra cần được kiểm tra riêng trước khi đưa vào Git. Kết quả local không thay thế kiểm tra dịch vụ đang triển khai.

## Đối chiếu bản triển khai

Website: [vng-support.vercel.app](https://vng-support.vercel.app). Dùng project Vercel hiện có `acne-a6cd/vng-support`.

```powershell
git rev-parse HEAD
Invoke-RestMethod https://vng-support.vercel.app/api/support/health
```

Đối chiếu `sourceRevision` với commit đã triển khai, cùng `status`, `policy`, `storage` và `durable`. Runtime lưu dữ liệu qua MongoDB; cấu hình nằm trong môi trường của project. `.vercelignore` loại environment files, dependencies, artifacts và worktree khỏi gói upload. Không đưa secret vào Git hoặc output kiểm tra.

Sau khi triển khai, kiểm tra trang chọn vai trò, popup lần đầu, URL/QR, trang gửi, reviewer, lịch sử và Verify trên desktop/mobile. Việc chạy kiểm thử có ghi dữ liệu hoặc gọi model trên site cần được phân biệt với kiểm tra chỉ đọc.

## Tiếp tục một lượt Verify

Mở **Kiểm thử**, chọn lượt đã lưu rồi tiếp tục sau khi lỗi mạng hoặc giới hạn tần suất đã hết. Trường hợp có thể thử lại giữ nguyên mã yêu cầu. Một kết quả không khớp policy vẫn được ghi là không đạt; không thay kỳ vọng để che lỗi.

## Bảo trì dữ liệu và policy

Đo development trên checkout cần đánh giá (không dùng artifact cũ như kết quả HEAD):

```powershell
npx vitest run tests/support-verify.test.ts
node scripts/development-report.mjs
```

Xuất báo cáo từng case và so sánh hai lượt (giữ baseline riêng trước khi sửa):

```powershell
node scripts/development-report.mjs artifacts/original-fixture-evaluation.json --out artifacts/case-report.json
node scripts/development-report.mjs artifacts/original-fixture-evaluation.json --baseline artifacts/technical-baseline.json --out artifacts/comparison-report.json
```

`--out` từ chối ghi đè file có sẵn. Mỗi case có expected/actual, rule, evidence,
reason, missing fields và diagnostic signals; signal không phải kết luận của
chuyên gia. Metadata thêm dataset ID/hash/split và evaluator hash/dirty. So sánh
từ chối nhãn/input khác nhau khi có digest; baseline cũ thiếu digest được ghi
rõ giới hạn. Trace có thể chứa tên/PII chưa được nhận diện trong fixture cũ:
chỉ giữ local, không stage hay công bố nếu chưa rà soát. Xem
[báo cáo mới và danh sách adjudication](docs/TECHNICAL-READINESS.md).

Test dùng API route + readback mock/memory; ghi SHA, runtime digest/dirty, policy,
Node và môi trường trong artifact local. Script in confusion matrix, coverage,
exact-match, FNR, unnecessary escalation và các nhóm lỗi. Ground Truth giữ nguyên.
Artifact có timestamp/UUID chỉ lưu local, không stage. Kết quả độc lập/người dùng
chưa có: xem [báo cáo readiness](docs/COMPETITION-READINESS.md).

Policy `support-guidance-v5.8` đồng bộ alias dữ kiện với bộ tách subrequest,
giữ approval context có giới hạn và không nhầm yêu cầu quyền thành artefact.
Không đổi authority/risk gate hoặc quota. Bump version để preview/cache cũ không
được dùng lại. Mở rộng redaction theo [inventory](docs/PRIVACY-INVENTORY.md).

Version v5.9 chỉ vô hiệu preview/cache sau sửa extraction: giữ mã approval
nhiều đoạn nguyên vẹn và không coi câu cảm ơn hoàn chỉnh là tác vụ riêng.
Rule, quota, safety threshold và registry approval không đổi.

- [Bộ dữ liệu kiểm thử](docs/JUDGE-DATASETS.md) mô tả các pack hiện có.
- [Quản trị knowledge](docs/KNOWLEDGE-REVIEW.md) hướng dẫn tạo revision mới và kiểm tra nguồn.
- [Hợp đồng đánh giá](docs/EVALUATION.md) mô tả đầu vào và cách tính kết quả.
- [Workflow theo bằng chứng](docs/EVIDENCE-WORKFLOW-FOLLOWUP.md) mô tả yêu cầu bổ sung dữ liệu và điều kiện chuyển reviewer.

Các policy gốc trong `mlai26_new/data/policy/` là dữ liệu lịch sử được bảo vệ bằng checksum tại `artifacts/migration-baseline-manifest.json`. Giữ nguyên chúng để hồi quy; policy runtime nằm trong `src/domain/policy-source.ts` và `src/domain/policy.ts`. `POLICY-REVIEW.md` mô tả policy-v2 trước tích hợp, không phải trạng thái runtime hiện tại.

Các báo cáo release, migration và prompt bàn giao cũ có thể tra cứu trong lịch sử Git. Tài liệu vận hành hiện hành không yêu cầu áp lại patch hay chia thành hai package.

Policy `support-guidance-v5.5` thay đổi nhận diện câu mô tả, feedback và đích tiếp nhận policy gap; preview cũ phải tạo lại. Reviewer có thể lọc `queue=OUT_OF_POLICY` hoặc `queue=AUTHORITY_REQUIRED` qua trang review/API phân trang. Bộ lọc áp dụng cả memory/Mongo, không sửa lịch sử quyết định đã lưu và không cấp quyền reviewer. Xem [đối chiếu nhận xét doanh nghiệp](docs/ENTERPRISE-FEEDBACK.md) để phân biệt regression synthetic, Mongo mock và phần chưa xác minh live.

Policy `support-guidance-v5.6` đưa nhận diện ý định freeform của provider OpenAI qua model trước khi áp dụng deterministic policy. Preview phiên bản cũ phải tạo lại; provider `mock` vẫn là mô phỏng regex để chạy demo/test offline và không chứng minh chất lượng nhận diện của OpenAI. Lỗi nhận diện, schema hoặc evidence chuyển reviewer an toàn. Không có thay đổi sentiment sau câu trả lời.

Policy `support-guidance-v5.7` kiểm tra tổ hợp route/catalog của model, bỏ field tùy chọn rỗng khỏi phân tích và đánh giá riêng câu tiếp nối có rủi ro/thao tác nghiệp vụ. Phủ định trong câu cũ không được triệt tiêu rủi ro câu mới. Preview/answer cache phiên bản cũ không được dùng lại. Xem [regression và giới hạn kiểm chứng](docs/INTENT-REVIEW-FIXES.md).

## Kiểm tra Mongo trong môi trường thử nghiệm riêng

`npm run test:persistence` chạy bài integration có opt-in. Khi chưa cấu hình
`SUPPORT_TEST_MONGO_URI` và `SUPPORT_TEST_MONGO_ACK`, test **skip** với
`persistenceVerification=NOT_PERFORMED`, không kết nối Mongo. Cấu hình thiếu
một phần/không an toàn hoặc test đã opt-in nhưng thất bại là **fail**, không skip.
Không có memory fallback. Cần build trước, port 3227 trống và Mongo disposable
loopback đã được operator xác nhận như hướng dẫn bên dưới.

Harness hiện đọc lại request/audit sau restart app, thực hiện STOP/CAS, restart
app lần nữa và đối chiếu quyết định reviewer/audit nguyên vẹn với Mongo. Chỉ khi
mọi assertion đạt mới trả `APP_RESTART_VERIFIED`. Không restart mongod, không
chứng minh identity transaction/replica set hay production durability. Lượt
kiểm tra này không có Mongo test: xem [bằng chứng hiện tại](docs/TECHNICAL-READINESS.md).

Ưu tiên harness có guard và tự restart tiến trình tại [hướng dẫn kiểm tra persistence](docs/FEEDBACK-EVIDENCE-REVIEW.md#reproducible-mongo-evidence): `node scripts/mongo-restart-smoke.mjs`. Harness chỉ chấp nhận Mongo loopback trên instance disposable được khai báo rõ, database mới do script chọn, không có `.env` local, model mock và budget 0. Chưa có kết quả live từ harness trong lượt sửa này. `durable=true` vẫn là metadata của adapter; trường health `persistenceVerification=NOT_PERFORMED` nói rõ endpoint không kiểm tra restart.

Quy trình thủ công dưới đây dành cho operator đã xác nhận database thử nghiệm riêng; không chạy trên production:

Chỉ dùng Mongo local hoặc credential thử nghiệm giới hạn trên database mới, tên `sprint1_test_<suffix>`. Không copy URI/credential production. Giữ `AI_PROVIDER=mock`, `AI_MAX_ATTEMPTS=0` và model keys rỗng. Đặt `MONGODB_URI`, `MONGODB_DB` riêng cùng `SUPPORT_ACCESS_MODE=public-demo`, chạy server tại3227. Health ping thành công chưa chứng minh persistence sau restart.

Trong terminal khác, tạo duy nhất dữ liệu synthetic rồi giữ lại các biến:

```powershell
$baseUrl = 'http://127.0.0.1:3227'
$body = @{rawText='Restart synthetic laptop'; fields=@{department='engineering'; employeeId='EMP-SMOKE-01'}; confirmed=$true; idempotencyKey=[guid]::NewGuid().ToString()} | ConvertTo-Json
$before = (Invoke-RestMethod "$baseUrl/api/support/requests" -Method Post -ContentType 'application/json' -Body $body).data
$requestId = $before.id
if (-not $requestId) { throw 'Create failed' }
$beforeJson = $before | ConvertTo-Json -Depth 40 -Compress
```

Dừng đúng server vừa khởi chạy, rồi khởi động lại với cùng URI/database. Đọc lại:

```powershell
$after = (Invoke-RestMethod "$baseUrl/api/support/requests/$requestId").data
if (($after | ConvertTo-Json -Depth 40 -Compress) -cne $beforeJson) { throw 'Restart read-back differs' }
```

Mở hai tab reviewer cùng request/version, bấm Stop: một thành công, một409; version chỉ tăng1 và chỉ có một event STOP. Ngắt Mongo thử nghiệm rồi thử đọc/ghi: phải503, không fallback memory hoặc lộ URI. Chạy lại với một credential synthetic có nhãn và kiểm tra response/document/audit chỉ giữ bản redact. Ghi kết quả kèm commit, Node/Mongo version và DB name; không log URI, secret hoặc raw personal input, không xóa collection/reset budget. Test adapter mock không thay thế quy trình live này.

## Giới hạn riêng tư và phép đo local

Redaction nhận diện một số credential/OTP (gồm JSON quote), CCCD 12 số có nhãn
với dấu phân cách giới hạn, mobile Việt Nam có nhãn, email ASCII và employee ID
có nhãn trong nội dung. [Inventory hiện tại](docs/PRIVACY-INVENTORY.md) nêu các
biến thể được test và loại chưa hỗ trợ. Tên/địa chỉ tự do, metadata ID và dữ liệu
không nhận diện có thể đến storage/audit/UI; input chưa che có thể đến model.
Chỉ dùng synthetic hoặc ẩn danh trước. Form vẫn giữ dữ liệu trước khi server
xử lý; không tự sửa/xóa dữ liệu lịch sử.

`node scripts/measure-support-latency.mjs` dùng server loopback3227 mock/memory và câu CAPABILITIES có thể hiện bực bội để đi qua đường tạo câu trả lời cùng prompt tone. Script bỏ5 warmup, đo15 preview tuần tự và một burst 5 request đồng thời; trả p50/p95/max HTTP+JSON. Có đúng 30 request nên chạy trên server vừa khởi động để không đụng rate limit demo. Ghi kèm OS, Node, commit và production start mode. Preview chỉ lưu tạm trong memory, không tạo support request. Provider mock chỉ dựng prompt rồi trả fallback; phép đo không bao gồm OpenAI, Mongo, production hoặc tải lớn, và không tự chứng minh lợi ích từ song song hóa.

`.github/workflows/qa.yml` chạy unit/lint/types/build và E2E desktop/mobile riêng bằng production build, không có deploy step. Kết quả local và hosted CI phải ghi riêng; việc có config không chứng minh GitHub Actions đã chạy thành công.

## Chẩn đoán API và sentiment

Model chính được chủ repo chọn là `gpt-6-luna`: đặt `AI_PROVIDER=openai`,
`AI_MODEL=gpt-6-luna`; `AI_CONVERSATION_MODEL` để trống sẽ kế thừa cho sentiment
sau câu trả lời. `AI_WEB_MODEL` là cấu hình riêng, không đổi theo model chính.
Giữ `AI_MAX_ATTEMPTS` trong mức hiện có; không reset counter để làm demo đạt.

Nếu preview ghi “Dự phòng theo luật”, đọc **Vì sao dùng dự phòng**:

- `AUTHENTICATION`: provider trả 401. Cập nhật `OPENAI_API_KEY` hợp lệ trong
  Vercel → vng-support → Settings → Environment Variables → Production,
  rồi triển khai lại để nhận biến mới. Không gửi key qua chat/Git/log.
- `NOT_CONFIGURED`: thiếu provider/model/API key.
- `BUDGET_EXHAUSTED`: chờ ngày UTC mới (07:00 giờ Việt Nam); không nâng cap tự động.
- `RATE_LIMIT`/`TIMEOUT`: thử lại sau; không retry vô hạn.
- Output/evidence không hợp lệ: giữ fallback có nhãn và kiểm tra log đã lọc;
  không bỏ validation để ép nhãn `model`.

Health 200 và `provider=openai` chỉ xác nhận app/cấu hình; trường
`modelConnectivity=NOT_CHECKED` nhắc rằng endpoint này không gọi inference.
Kiểm tra thật bằng một preview synthetic, không xác nhận lưu ticket; chỉ coi
sentiment dùng model khi `sentiment.source=model` và model ID đúng. Cần key
hợp lệ, quyền model và quota API; thay tên model không sửa được key lỗi 401.

## Hệ thống ID nhân viên

Hệ thống ID dùng MongoDB riêng, không thay storage Support. Không có memory/CSV fallback. Khi MongoDB không cấu hình/không khả dụng, API trả 503 và UI không xác nhận thành công. Mọi thao tác dưới đây dành cho operator đã có thẩm quyền; không chạy trên production chỉ vì có quyền push code.

### Cấu hình

- `IDENTITY_MONGODB_URI`: URI riêng; nếu bỏ trống dùng `MONGODB_URI`. Không đưa URI vào Git/log.
- `IDENTITY_MONGODB_DB=vng_support_identity`: database riêng của hệ thống ID, không thay `MONGODB_DB` của Support.
- MongoDB cần replica set/sharded cluster để dùng transaction. User cần đọc/ghi các collection `identity_*`, tạo collection/index và `collMod` để cài validator. Không cần quyền quản trị toàn cluster.
- Bản demo hiện đăng nhập chỉ bằng ID cho cả người gửi và IT. Không cần OTP relay/signing key. Biến OTP cũ không được đọc; collection challenge và metadata kênh cũ được giữ nguyên, không sử dụng để đăng nhập.

`GET /api/identity/profiles` khởi tạo schema/index nếu chưa có. HTTP 200 cùng `data: []` là kết nối thành công nhưng chưa có profile active, không phải lỗi thiếu Mongo. MongoDB rỗng không tự tạo tài khoản hay nhập CSV. Khi Mongo lỗi, UI không báo lưu thành công; người gửi vẫn có thể dùng `/guest` nếu storage Support hoạt động.

### Khởi tạo người xử lý ID

Chỉ operator được chủ repo cho phép mới chạy. Đây là cấp quyền IT cho demo, không phải xác minh danh tính thật.

1. Xác nhận database đích và quyền thực hiện. Gọi profiles endpoint để cài schema/index trước.
2. Chuẩn bị JSON riêng ngoài repository gồm `fullName`, `actor`, `reason`. Dùng tên giả lập rõ ràng. Actor ghi người/công cụ thực hiện; reason ghi căn cứ chủ repo cho phép, không giả xác minh nhân sự hoặc review của người thật.
3. Nạp URI qua môi trường riêng, rồi chạy:

```powershell
node scripts/identity-bootstrap.mjs --file C:\private\identity-operator.json --database $env:IDENTITY_MONGODB_DB --demo-id-only --apply
```

Script từ chối database khác cấu hình, thiếu cờ chấp nhận ID-only demo, schema/index chưa cài hoặc ID đã tồn tại. Tạo profile sandbox/read, account `identity-admin` và audit `OPERATOR_BOOTSTRAP_DEMO` trong cùng transaction. Không sửa account cũ. Job tên IT không tự tạo role trong luồng đăng ký công khai.

4. Vào `/login`, nhập ID vừa cấp; server trả vai trò phù hợp và mở `/identity/review`. Chỉ xử lý đơn giả lập. Mọi cấp ID/từ chối/trùng ID vẫn qua validation, unique index, version, transaction và audit. Không thực thi IAM/cloud/database bên ngoài.

### Giới hạn và thu hồi quyền

Mọi phiên là `demo`, kể cả session cũ có nhãn verified. Người biết ID IT có thể mạo danh; không dùng với nhân sự/dữ liệu production thật. Role IT, ACTIVE và expiry được đọc lại từ Mongo ở mỗi request. Operator có thẩm quyền thu hồi role/vô hiệu hóa account qua quy trình có audit; chưa có UI quản trị các thao tác này. Không xóa dữ liệu hoặc thay đổi account có sẵn chỉ để làm bài demo đạt.

API access chỉ đánh giá scope và ghi audit, trả `assurance: demo`, `executed: false`. Sensitive scopes vẫn bị chặn; profile được pin id/version, không sửa ngầm. Theo dõi đơn dùng bearer capability chỉ đọc, chưa có khôi phục link hoặc xác minh chủ đơn.

### Kiểm tra

`npm test`, Mongo guard/report tests, lint, typecheck, build; sau build chạy E2E desktop/mobile tuần tự ở port3227 với mock/memory. Tests identity dùng adapter giả lập để kiểm tra role/rollback; E2E route mocks chỉ kiểm tra UI. Không suy ra Mongo transaction/restart thật từ chúng. Muốn chứng minh restart Support cần Mongo disposable như phần trên; bootstrap thành công trên database identity không thay thế bài đó.

User yêu cầu bỏ OTP nên các test hợp đồng OTP được thay bằng ID-only, thu hồi role, phiên hết hạn, chống client tự khai báo verified/role và endpoint OTP đã ngừng. Giữ nguyên Ground Truth quyết định Support.
