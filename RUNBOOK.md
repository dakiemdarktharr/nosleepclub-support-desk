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

## Hệ thống ID nhân viên

Hệ thống ID dùng MongoDB riêng, không thay storage Support. Không có memory/CSV fallback. Khi MongoDB không cấu hình/không khả dụng, API trả 503 và UI không xác nhận thành công. Mọi thao tác dưới đây dành cho operator đã có thẩm quyền; không chạy trên production chỉ vì có quyền push code.

### Cấu hình

- `IDENTITY_MONGODB_URI`: URI MongoDB lấy từ secret manager; nếu bỏ trống dùng `MONGODB_URI` hiện có. Không đưa URI thật vào Git/log.
- `IDENTITY_MONGODB_DB`: tên database riêng, bắt buộc, không tự lấy `MONGODB_DB` của Support.
- MongoDB phải hỗ trợ transaction: replica set hoặc sharded cluster. Standalone không đủ. Tài khoản DB cần đọc/ghi các collection `identity_*`, tạo index/collection và `collMod` để cài validator. Runtime khởi tạo validator/index một lần mỗi tiến trình; thiếu quyền thì từ chối phục vụ identity.
- `IDENTITY_OTP_RELAY_URL`: endpoint HTTPS tin cậy do IT quản lý, không nhận URL từ client; không redirect.
- `IDENTITY_OTP_RELAY_TOKEN`: token bearer cho relay.
- `IDENTITY_OTP_SIGNING_KEY`: khóa bí mật ngẫu nhiên tối thiểu 32 ký tự để HMAC mã OTP; dùng secret manager. Đổi khóa làm OTP đang chờ hết hiệu lực.

Relay nhận JSON `{ destination, code, expiresInSeconds: 300, purpose: "VNG Support sign-in" }` bằng POST, Authorization Bearer, timeout 8 giây. Relay phải xác thực token, gửi qua kênh đã xác minh, trả 2xx khi chấp nhận; không ghi OTP, token hoặc destination vào log công khai. Không có relay thật được triển khai bởi thay đổi này. Mã không được trả cho browser hoặc log app. Hash phiên và challenge, giới hạn lần thử và TTL lưu trong MongoDB; expiry còn được kiểm tra trong query, không phụ thuộc TTL cleanup.

### Khởi tạo người xử lý ID

1. Cấu hình database thử nghiệm riêng và khởi động app. Gọi `GET /api/identity/profiles` một lần để cài validator/index. Danh sách rỗng là hợp lệ; không có seed tự động.
2. Qua quy trình IT tin cậy, xác minh người được quyền xử lý ID và kênh nhận OTP. Chuẩn bị JSON riêng **ngoài repository** với đúng bốn trường `fullName`, `destination`, `verifiedBy`, `reason`. Không thu thập kênh từ đơn công khai. `verifiedBy` và reason ghi căn cứ quyết định operator; bản ghi audit này không tự chứng minh xác minh ngoài hệ thống đã diễn ra.
3. Kiểm tra database đích, rồi operator chạy:

```powershell
node scripts/identity-bootstrap.mjs --file C:\private\identity-operator.json --database $env:IDENTITY_MONGODB_DB --apply
```

Script không sửa account đã tồn tại: gặp trùng ID thì dừng. Script tạo profile khởi tạo, tài khoản `identity-admin`, kênh đã xác minh và audit trong cùng transaction. Profile tên IT không tự tạo role ở luồng đăng ký công khai. Không chạy script bằng dữ liệu nhân viên thật trong kiểm thử tự động. Các thay đổi/revoke account, role hoặc kênh sau bootstrap cần operator có thẩm quyền thực hiện qua quy trình MongoDB có audit; chưa có UI quản trị các thay đổi này. Session luôn kiểm tra lại `ACTIVE` và role từ MongoDB nên vô hiệu hóa/thu hồi vai trò có hiệu lực ở request tiếp theo.
4. Từ trang đầu chọn **Tôi cần hỗ trợ** để mở Đăng nhập. Mở “Dành cho người xử lý ID”, chọn OTP rồi xác minh. Chọn **Cấp ID nhân viên**; xác minh nhân sự ngoài hệ thống trước khi duyệt. Hệ thống không tự biến họ tên trong đơn thành danh tính đáng tin cậy.

### Trình diễn và giới hạn

Theo yêu cầu demo, người gửi có ID được cấp còn ACTIVE có thể đăng nhập chỉ bằng ID. Đây không phải xác thực production an toàn: người biết ID có thể mạo danh. Phiên có assurance `demo`, không được dùng API duyệt/danh bạ/kiểm tra quyền thực thi. Với production có dữ liệu thật, cần quyết định lại chế độ người gửi và áp dụng xác minh bắt buộc, đánh giá bảo mật, vận hành kênh tin cậy và kiểm soát dữ liệu. Quyền IT luôn cần OTP cùng role; tuyệt đối không thay bằng header hoặc tên job.

Profile đã gắn được pin theo id/version. Không có API sửa ngầm profile. Job có sẵn phải active khi gửi và khi duyệt; job mới chỉ nhận tập con scope đã yêu cầu. Các scope nhạy cảm vẫn bị server chặn ở bước kiểm tra, kể cả đã có trong profile. API access chỉ đánh giá và audit, không thực thi IAM/cloud/database thật; deterministic policy của Support vẫn nguyên vẹn. Liên kết theo dõi là bearer capability chỉ đọc đơn, cần giữ kín và lưu biên nhận; hiện chưa có khôi phục link hoặc xác minh chủ đơn.

### Kiểm tra an toàn ở local

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; sau build chạy `SUPPORT_E2E_PRODUCTION=true` với Playwright server riêng `127.0.0.1:3227`. E2E đặt các biến Mongo/OTP rỗng để kiểm tra fail-closed, dùng route mocks cho trạng thái UI; không gọi OTP thật. Adapter trong `tests/identity-services.test.ts` chỉ là test double kiểm tra quy tắc/rollback giả lập, không phải Mongo thực. Chưa có bằng chứng transaction, index, restart persistence hoặc concurrency trên MongoDB thật từ bộ mock này. Trước production phải kiểm tra trên replica set disposable với dữ liệu giả lập, không production credentials và không model trả phí.
