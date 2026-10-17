# VNG Support — Hướng dẫn vận hành

Hướng dẫn thao tác sản phẩm nằm trong [README](README.md). File này dành cho cài đặt, kiểm tra và bảo trì repository.

## Chạy local

Dùng Node.js 22.13+ và npm. Trong PowerShell, tại thư mục repository:

```powershell
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Chỉ sao chép `.env.example` khi chưa có `.env.local`; giữ cấu hình cá nhân đã có. Mở `http://localhost:3000`. Cấu hình mẫu sử dụng model mock và `memory-demo`.

## Kiểm tra trước khi phát hành

```powershell
npm run check:docs
npm run lint
npm run typecheck
npm test
node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs scripts/check-docs.test.mjs
npm run build
npm run test:persistence
$env:SUPPORT_E2E_PRODUCTION='true'
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=mobile
npm audit
npm audit --omit=dev
```

Playwright tự khởi động server riêng tại `127.0.0.1:3227` với model mock và bộ nhớ tạm. Chạy build xong mới chạy E2E vì cùng sử dụng `.next`. Chạy desktop và mobile riêng để mỗi lượt có server và hạn mức request riêng. Không dừng một tiến trình khác đang dùng cổng này.

Báo cáo, ảnh chụp và video do test sinh ra cần được kiểm tra riêng trước khi đưa vào Git. Kết quả local không thay thế kiểm tra dịch vụ đang triển khai.

## Cập nhật sơ đồ workflow

Nguồn Mermaid nằm trong `docs/diagrams/*.mmd`; README và tài liệu kiến trúc dùng SVG dựng sẵn để nhãn không bị renderer của GitHub cắt. Giữ `look: classic`, font Arial và ngắt dòng chủ động. Không sửa chữ trực tiếp trong SVG.

Cài Mermaid được ghim phiên bản ở thư mục công cụ tạm, ngoài repository; Playwright dùng dependency đã có của dự án:

```powershell
$diagramTools = Join-Path $env:TEMP 'vng-support-diagram-tools'
npm install --prefix $diagramTools --no-save --package-lock=false --ignore-scripts mermaid@12.2.0
$diagramBundle = Join-Path $diagramTools 'node_modules/mermaid/dist/mermaid.min.js'
$diagramPreview = Join-Path $env:TEMP 'vng-support-diagram-preview'
node scripts/render-diagrams.mjs --bundle $diagramBundle --screenshots $diagramPreview
npm run check:docs
git diff --check
```

Renderer dừng nếu thiếu nhãn, chữ vượt khung, node chồng nhau hoặc SVG còn HTML nhúng. Trước commit, xem ảnh ở kích thước README và thử ảnh SVG qua thẻ `img` trên nền sáng/tối; kiểm tra link mở ảnh đầy đủ trên mobile. Commit cả nguồn `.mmd` lẫn `.svg`; ảnh kiểm tra để ngoài repo.

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

## Bảo trì policy và chất lượng

Policy runtime nằm trong `src/domain/policy-source.ts` và `src/domain/policy.ts`. Giữ nguyên dataset/Ground Truth; thay đổi contract phải có regression và quyết định có nguồn gốc. Bump policy khi nội dung preview/cache cũ không còn hợp lệ.

`npm test` kiểm tra định tuyến, safety, authority, bằng chứng, hội thoại, identity và lưu trữ. `node scripts/development-report.mjs` tạo báo cáo local; không stage artifact chứa trace, UUID hoặc dữ liệu chưa được rà soát. [Evaluation](docs/EVALUATION.md) mô tả cách diễn giải.

Lời gọi AI thật local cần key riêng và opt-in:

```powershell
node --env-file=.env.local scripts/check-support-ai-live.mjs --live
```

Script dùng storage bộ nhớ, không tạo ticket hoặc ghi Mongo. Kết quả này không thay kiểm tra UI Production. Telemetry preview có stage timing và model calls; không ghi raw input hoặc credential.

Đối chiếu chất lượng trước/sau bằng cùng input, model và môi trường. Tách warm/cold quan sát được, cache hit/miss và fallback; thời gian đến câu trả lời đầy đủ quan trọng hơn ký tự đầu. Không bỏ validation hoặc đổi quyền để tăng tốc.

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
kiểm tra này không có Mongo test: xem [bằng chứng hiện tại](https://github.com/dakiemdarktharr/vng-support/blob/cd50d826003f2e49e8d52b3e695ad6fe74fe15b7/docs/REPO-AUDIT-2026-10-14.md).

Ưu tiên harness có guard và tự restart tiến trình tại [hướng dẫn kiểm tra persistence](https://github.com/dakiemdarktharr/vng-support/blob/cd50d826003f2e49e8d52b3e695ad6fe74fe15b7/docs/archive/FEEDBACK-EVIDENCE-REVIEW.md#reproducible-mongo-evidence): `node scripts/mongo-restart-smoke.mjs`. Harness chỉ chấp nhận Mongo loopback trên instance disposable được khai báo rõ, database mới do script chọn, không có `.env` local, model mock và budget 0. Chưa có kết quả live từ harness trong lượt sửa này. `durable=true` vẫn là metadata của adapter; trường health `persistenceVerification=NOT_PERFORMED` nói rõ endpoint không kiểm tra restart.

Quy trình thủ công dưới đây dành cho operator đã xác nhận database thử nghiệm riêng; không chạy trên production:

Chỉ dùng Mongo local hoặc credential thử nghiệm giới hạn trên database mới, tên `sprint1_test_<suffix>`. Không copy URI/credential production. Giữ `AI_PROVIDER=mock` và model keys rỗng. Đặt `MONGODB_URI`, `MONGODB_DB` riêng cùng `SUPPORT_ACCESS_MODE=public-demo`, chạy server tại3227. Health ping thành công chưa chứng minh persistence sau restart.

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

Preview từ v5.19 trả `data.diagnostics` và `Server-Timing`: stage, model attempts,
usage khi provider trả, cache state và process invocation. Đo client từ trước
fetch đến sau đọc JSON; không gọi thời gian ký tự đầu là phản hồi sử dụng
được. Giữ request tuần tự, một warm-up tách riêng và tối thiểu 20 mẫu để
so sánh cùng input/model; nearest-rank p50/p95, tách fallback/cache, cold
unknown nếu không có bằng chứng. Không log input/key/URI; chỉ dọn chính xác
ID thử nghiệm đã ghi trong manifest sau lưu bằng chứng. [Contract và giới
hạn phép đo](https://github.com/dakiemdarktharr/vng-support/blob/cd50d826003f2e49e8d52b3e695ad6fe74fe15b7/docs/QUALITY-LATENCY-2026-10-15.md).

Đánh giá fallback offline riêng (không model/API/Mongo), tại repository root:

```powershell
$env:SENTIMENT_REPORT_OUT='sentiment-evaluation-local.json'
npm run evaluate:sentiment
Remove-Item Env:SENTIMENT_REPORT_OUT
```

Đầu ra JSON ghi revision, hash runtime/dataset/evaluator, confusion matrix,
precision/recall/F1, coverage, mismatch và hàng đợi ambiguous. File đích phải
chưa tồn tại; không ghi đè baseline. Không đặt biến output thì chỉ kiểm tra
schema/metrics, không xuất báo cáo. Không stage artifact này.
Xem [nguồn dữ liệu, kết quả và giới hạn](docs/SENTIMENT-EVALUATION.md).
Nhánh sentiment sau trả lời không tự đóng/chuyển ticket; nút xác nhận kết quả,
yêu cầu chuyển người và policy được xét độc lập với nhãn cảm xúc.

Model chính được chủ repo chọn là `gpt-6-luna`: đặt `AI_PROVIDER=openai`,
`AI_MODEL=gpt-6-luna`; `AI_CONVERSATION_MODEL` để trống sẽ kế thừa cho sentiment
sau câu trả lời. `AI_WEB_MODEL` là cấu hình riêng, không đổi theo model chính.
Production không còn hạn mức model-call theo ngày ở cấp ứng dụng; không cần reset counter. Provider vẫn có thể trả 429 theo quota/rate limit tài khoản. API intake demo còn giới hạn 30 request/phút/client.
Khi demo offline, giữ `AI_PROVIDER=mock` và model keys rỗng.

Nếu preview ghi “Dự phòng theo luật”, đọc **Vì sao dùng dự phòng**:

- `AUTHENTICATION`: provider trả 401. Cập nhật `OPENAI_API_KEY` hợp lệ trong
  Vercel → vng-support → Settings → Environment Variables → Production,
  rồi triển khai lại để nhận biến mới. Không gửi key qua chat/Git/log.
- `NOT_CONFIGURED`: thiếu provider/model/API key.
- `BUDGET_EXHAUSTED`: chỉ còn ở dữ liệu lịch sử hoặc test-only; production hiện không chặn theo ngân sách ngày của ứng dụng.
- `RATE_LIMIT`/`TIMEOUT`: thử lại sau; không retry vô hạn.
- Output/evidence không hợp lệ: giữ fallback có nhãn và kiểm tra log đã lọc;
  không bỏ validation để ép nhãn `model`.

Health 200 và `provider=openai` chỉ xác nhận app/cấu hình; trường
`modelConnectivity=NOT_CHECKED` nhắc rằng endpoint này không gọi inference.
Kiểm tra thật bằng một preview synthetic, không xác nhận lưu ticket; chỉ coi
sentiment dùng model khi `sentiment.source=model` và model ID đúng. Cần key
hợp lệ, quyền model và quota API; thay tên model không sửa được key lỗi 401.

## Hệ thống ID nhân viên

### Sổ quyền và quota demo

Policy v5.16 bổ sung đề xuất TTL có xác nhận và role Jira theo phạm vi được
giao. [13 quyết định của chủ repo](docs/decisions/DEMO-AUTHORITY-CONTRACT.md)
không thay nhãn benchmark hoặc bằng chứng IAM/ITSM còn thiếu.

Vào **Cấp ID nhân viên → Sổ quyền và quota DEMO-SANDBOX**. Người đăng nhập
xin quyền read/create demo cho chính tài khoản; owner xem xét, nhập lý do,
duyệt/từ chối hoặc thu hồi. Chỉ owner khác người gửi được xử lý. Bản ghi demo
không cấp quyền thật và không đổi quyết định ticket Support thành AUTO.

Operator được phép thao tác database thử nghiệm riêng có thể khởi tạo một
pool mới. Không chạy chỉ vì đã push code hoặc thấy MongoDB trống:

1. Dùng cấu hình identity MongoDB hiện hành; cần replica set/transaction.
   Gọi endpoint profiles để cài validator/index. Không dùng URI production
   cho kiểm thử, không đưa credentials vào lệnh/chat/Git.
2. Chuẩn bị file JSON riêng gồm `ownerId` (ID IT giả lập đang ACTIVE), `actor`,
   `reason`, `validUntil` (ISO UTC, hạn hiệu lực của snapshot usage mới).
3. Chạy khi đã có thẩm quyền với database đích:

```powershell
node scripts/demo-authority-bootstrap.mjs --file C:\private\demo-authority.json --database $env:IDENTITY_MONGODB_DB --demo-id-only --apply
```

Script từ chối project đã tồn tại, owner không có role IT, thiếu validator/index
hoặc database khác cấu hình. Pool mới có usage/reserved khai báo bằng 0,
16 vCPU / 64 GB RAM / 500 GB disk / 4 GPU T4, max 24 giờ, budget unconfigured.
Không seed entitlement hay ticket benchmark. Không chạy script trong CI.

Owner cập nhật usage + giữ chỗ, thời điểm quan sát và hạn hiệu lực qua trang
sổ demo; API kiểm tra lại role/assignment và version trước khi ghi audit cùng
transaction. Snapshot cũ/thiếu không được coi usage bằng 0. Kiểm tra preflight
không đặt chỗ, không tự trừ quota và không thu hồi hạ tầng khi TTL hết.
Ngân sách/bảng giá chưa cấu hình nên luôn cần Capacity owner; chưa có connector
để xác minh billing thật. Màn hình hiện hiển thị tối đa 100 đơn mới nhất.

`tests/demo-authority.test.ts` dùng transactional double riêng trong test;
`tests/e2e/authority.spec.ts` dùng mock UI và API local thiếu Mongo. Những test
này không chứng minh Mongo transaction/index/concurrency/restart thật.

Hệ thống ID dùng collection riêng, có thể chung database `vng_main` với Support. Không có memory/CSV fallback. Khi MongoDB không cấu hình/không khả dụng, API trả 503 và UI không xác nhận thành công. Mọi thao tác dưới đây dành cho operator đã có thẩm quyền; không chạy trên production chỉ vì có quyền push code.

### Cấu hình

- `IDENTITY_MONGODB_URI`: URI riêng; nếu bỏ trống dùng `MONGODB_URI`. Không đưa URI vào Git/log.
- `IDENTITY_MONGODB_DB=vng_main`: dùng chung database với Support; dữ liệu identity nằm trong các collection `identity_*`.
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

### Bộ 40 ID demo

Nguồn dữ liệu giả lập được ghim tại `data/demo-identities.json`: 40 tên và ID duy nhất, mỗi ID có profile/job, scope và đích `demo/<id>` riêng. Các tài khoản này không được cấp role quản lý ID. Công cụ không tự chạy khi app khởi động.

Kiểm tra manifest mà không kết nối hoặc ghi MongoDB:

```powershell
node scripts/identity-demo-roster.mjs --file data/demo-identities.json
node --test scripts/identity-demo-roster.test.mjs
npm test -- tests/demo-identity-roster.test.ts
```

Sau khi operator xác nhận môi trường demo và database đích, gọi `GET /api/identity/profiles` để cài validator/index nếu chưa có, rồi chạy với URI trong `.env.local`:

```powershell
node --env-file=.env.local scripts/identity-demo-roster.mjs --file data/demo-identities.json --database vng_main --actor dakiemdarktharr --demo-id-only --apply
```

`--database` phải trùng `IDENTITY_MONGODB_DB`. Import dùng một Mongo transaction cho account, profile và audit. Nếu một ID/profile đã tồn tại khác manifest, toàn bộ lượt nhập rollback; không ghi đè account cũ. Chạy lại cùng manifest chỉ xác nhận dữ liệu đã có, không tạo trùng hoặc thêm audit cấp tài khoản. Mỗi lượt tạo ghi actor và SHA-256 của manifest.

Phạm vi trong profile chưa cho phép thực thi thao tác nhạy cảm: Production hoặc quyền vượt thẩm quyền cần duyệt riêng; secrets/keys vẫn bị chặn. API access trả `executed: false`.

### Đổi tên và ID bộ demo v1 → v2

Bộ hiện hành là `data/demo-identities.json` (version 2): 24 tên 3 chữ, 12 tên 4 chữ, 4 tên 5 chữ. `data/migrations/demo-identities-v1.json` là snapshot giả lập phục vụ đối chiếu migration, không phải danh sách ID đăng nhập hiện hành. Mỗi account pin profileVersion 2; không sửa scopes của profile version 1 để che lịch sử.

Kiểm tra mapping trước, chưa ghi Mongo:

```powershell
node scripts/identity-demo-rename.mjs --from data/migrations/demo-identities-v1.json --file data/demo-identities.json
node --test scripts/identity-demo-roster.test.mjs scripts/identity-demo-rename.test.mjs
```

Chỉ operator được phép thay 40 tài khoản giả lập trên database đích mới chạy:

```powershell
node --env-file=.env.local scripts/identity-demo-rename.mjs --from data/migrations/demo-identities-v1.json --file data/demo-identities.json --database vng_main --actor dakiemdarktharr --demo-id-only --apply
```

Migration ghép bằng profile UUID cố định, giữ Mongo `_id`, ngày tạo, job, role và policy; cập nhật tên, ID, liên kết batch và phiên đăng nhập. Tạo profile version 2 cho đúng đích mới; giữ scopes cũ ở version 1 và ngừng đưa version cũ vào danh sách chọn. ID cũ không còn đăng nhập được. Phiên đã có tiếp tục đọc ra ID mới; trang đang mở cần tải lại để đồng bộ ID đang hiển thị. Người chưa có tài khoản vẫn dùng `/guest`.

Mọi thay đổi và 40 audit đối chiếu ID cũ/mới, actor, SHA-256 hai manifest nằm trong một transaction. Trùng ID, profile bị chia sẻ/sửa hoặc tài khoản có liên kết ticket/đơn/quota phát sinh sẽ dừng toàn bộ để operator xem xét. Không tự sửa input/audit nghiệp vụ. Chạy lại đúng mapping không tạo thêm tài khoản/audit. Import thông thường từ chối khi gặp profile phiên bản cũ; dùng migration thay vì nhập thêm 40 tài khoản.

Nếu lỗi trước commit transaction, Mongo tự rollback toàn bộ và bộ v1 vẫn nguyên. Sau thành công, revert Git không hoàn tác database: giữ receipt ngoài repo; chỉ rollback bằng migration có audit sau khi kiểm tra các liên kết mới phát sinh. Không drop database/collection hay xóa tài khoản để quay lại demo.

Kiểm chứng: 40 ID mới đăng nhập/đăng xuất; session trả đúng tên; access dùng profile version 2; chặn đích cũ, đích người khác và môi trường khác; chặn quyền IT; 40 ID cũ trả 401. Kiểm tra trình duyệt với tên 3/4/5 chữ, reload, logout, IT cũ và guest.

### Giới hạn và thu hồi quyền

Mọi phiên là `demo`, kể cả session cũ có nhãn verified. Người biết ID IT có thể mạo danh; không dùng với nhân sự/dữ liệu production thật. Role IT, ACTIVE và expiry được đọc lại từ Mongo ở mỗi request. Operator có thẩm quyền thu hồi role/vô hiệu hóa account qua quy trình có audit; chưa có UI quản trị các thao tác này. Không xóa dữ liệu hoặc thay đổi account có sẵn chỉ để làm bài demo đạt.

API access chỉ đánh giá scope và ghi audit, trả `assurance: demo`, `executed: false`. Sensitive scopes vẫn bị chặn; profile được pin id/version, không sửa ngầm. Theo dõi đơn dùng bearer capability chỉ đọc, chưa có khôi phục link hoặc xác minh chủ đơn.

### Kiểm tra

`npm test`, Mongo guard/report tests, lint, typecheck, build; sau build chạy E2E desktop/mobile tuần tự ở port3227 với mock/memory. Tests identity dùng adapter giả lập để kiểm tra role/rollback; E2E route mocks chỉ kiểm tra UI. Không suy ra Mongo transaction/restart thật từ chúng. Muốn chứng minh restart Support cần Mongo disposable như phần trên; bootstrap thành công trên database identity không thay thế bài đó.

User yêu cầu bỏ OTP nên các test hợp đồng OTP được thay bằng ID-only, thu hồi role, phiên hết hạn, chống client tự khai báo verified/role và endpoint OTP đã ngừng. Giữ nguyên Ground Truth quyết định Support.

## Kiểm tra bản trình diễn

Giữ đăng nhập ID-only và reviewer công khai theo lựa chọn của nhóm để quay video/trình diễn nhanh. Màn hình người gửi không render sentiment, expected result hoặc audit thô; reviewer vẫn có các thông tin này. Phân tách màn hình không phải cơ chế xác thực bổ sung cho các API public-demo.

Trước buổi trình diễn, kiểm tra máy in, VPN, reset có làm rõ, yêu cầu mở port nguy hiểm, DNS, hỏi tiếp, handoff và tra cứu lại trên desktop/mobile. Kiểm tra bằng lời gọi thật khi được phép, đối chiếu SHA và lưu receipt; dọn đúng ID dữ liệu giả lập vừa tạo sau khi lưu bằng chứng. Không chạy Verify bằng dữ liệu nghiệp vụ hoặc xóa theo điều kiện rộng.

Dependency audit cần phân biệt runtime và toolchain. Lượt rà soát 15/10/2026: `npm audit --omit=dev` không có advisory; full audit còn 7 high trong chuỗi Tailwind/ESLint → glob → braces. [Advisory braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) chưa có bản vá công bố tại thời điểm kiểm tra. Không gọi `npm audit fix --force` hoặc tự thay major framework để làm sạch chỉ số. Chỉ dùng cấu hình glob tin cậy trong build/lint; rà bản vá hoặc migration toolchain riêng khi có phương án tương thích. Chạy lại audit ở mỗi lần phát hành.

## Bổ sung phòng ban cho 40 ID hiện có

Đọc manifest `data/demo-identities.json`; validate không chạm database:

```sh
node scripts/identity-demo-roster.mjs --file data/demo-identities.json
node --test scripts/identity-demo-roster.test.mjs scripts/identity-demo-rename.test.mjs
```

Operator chỉ áp dụng trên database identity đã xác nhận, qua terminal có sẵn biến môi trường an toàn; không gửi URI/key vào chat. Dùng đúng database đang cấu hình trong `IDENTITY_MONGODB_DB` (không tự đổi sang database khác). Trong PowerShell:

```powershell
node scripts/identity-demo-roster.mjs --file data/demo-identities.json --apply --sync-departments --demo-id-only --database "$env:IDENTITY_MONGODB_DB" --actor operator-demo
```

Lệnh đối chiếu đúng 40 ID, tên, batch, profile version, role và scope trước khi bổ sung phòng ban còn trống. Không đổi ID, role hay scope; gặp phòng ban đã có nhưng khác manifest sẽ rollback cả batch. Chạy lại không tạo audit thừa. Lưu receipt ngoài Git. Commit này không tự chạy migration trên Production. Phiên đăng nhập đọc phòng ban từ Mongo, điền vào form và server dùng giá trị đó; người chưa có phòng ban vẫn dùng lựa chọn hiện có.

## Vận hành cache và sự cố chung

Giữ `MONGODB_URI` và `MONGODB_DB` hiện có cho Support. App tạo index trên `v3_support_shared_faq` (TTL 7 ngày) và `v3_support_incidents` (unique activeKey), cùng index liên kết hồ sơ. Không dùng database identity để lưu ticket. Runtime Production thiếu Mongo sẽ từ chối lưu; cache lỗi được coi là miss, không tạo fallback lưu trữ Production khác.

Sự cố chỉ liên kết trong 24 giờ tính từ khi tạo nhóm. Sau 24 giờ hoặc khi đóng, yêu cầu mới tạo nhóm khác. Audit/cập nhật cũ được giữ để theo dõi; không xóa lịch sử theo TTL cache. Cập nhật dùng mẫu server có giới hạn an toàn, không cho gửi secrets hay lệnh tùy ý đến mọi người. Đánh dấu sự cố chung đã khắc phục không tự đóng ticket cá nhân. Màn hình theo dõi polling khi tab đang mở và online; không phải dịch vụ thông báo ngoài app. Danh sách nhóm hiển thị tối đa 50 nhóm đang mở mới nhất, hồ sơ vẫn tra cứu được riêng.

Cache FAQ chỉ lưu mô tả công khai thuộc grammar đóng và hash template. Mỗi hit đối chiếu template hiện hành + policy, ngưỡng Dice trên tập từ >= 0,8; sửa template/policy tự vô hiệu hóa bản cũ. Không chia sẻ nội dung tự do/credential/entitlement. Verify và fault injection bỏ qua cache mới. Không thay model, rate limit hoặc quota. Đây chưa phải kiểm chứng tải 3.000 người hay bảo vệ DDoS đa vùng.
