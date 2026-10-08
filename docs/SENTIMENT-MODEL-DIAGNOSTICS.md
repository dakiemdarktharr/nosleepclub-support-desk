# GPT-6 Luna và chẩn đoán sentiment — 09/10/2026

Base: `c00a155855ee258d9d53e561aed147e5472e31fe`, GitHub main và revision live
được đối chiếu trước sửa. Worktree riêng; checkout gốc dirty được bảo toàn.
Thay đổi do AI hỗ trợ theo yêu cầu chủ repo, không suy ra human review.

## Nguyên nhân đã xác minh

- Health live 200, provider `openai`, storage Mongo; đây không phải inference.
- Cấu hình Production ban đầu: `AI_MODEL=gpt-4.1-mini`, không có override
  `AI_CONVERSATION_MODEL`, `AI_MAX_ATTEMPTS=50`.
- Đọc metadata counter của ngày UTC 08/10: 2/50 trước preview chẩn đoán.
  Không hết budget; không reset hoặc sửa counter.
- Một preview synthetic, không xác nhận lưu ticket, trả HTTP 200 nhưng sentiment
  `source=rule-based`. Log runtime đã lọc chỉ mã lỗi cho thấy
  `MODEL_UNAVAILABLE:AUTHENTICATION` — provider trả 401.
- 401 không được khắc phục bằng đổi model. Chưa xác minh API key hợp lệ hoặc
  quyền GPT-6 Luna của tài khoản. Không in/log/copy key hoặc upstream body.

## Thay đổi

Chủ repo chọn chính xác GPT-6 Luna. [Model chính thức](https://developers.openai.com/api/docs/models/gpt-6-luna)
có ID `gpt-6-luna`, hỗ trợ Structured Outputs/Chat Completions và effort `none`.
[Hướng dẫn migration](https://developers.openai.com/api/docs/guides/latest-model)
khuyến nghị giữ đặc tính reasoning cũ khi model hỗ trợ.

- Cập nhật `AI_MODEL` Production sang `gpt-6-luna`; model hội thoại/sentiment
  sau trả lời kế thừa khi không có override. Giữ nguyên model web và budget.
- Adapter Luna gửi `reasoning_effort=none`, giữ JSON schema, `store:false`,
  timeout, token cap và `maxRetries:0`. SDK 5 chưa có `none` trong enum cũ;
  dùng transport `client.post<ChatCompletion>` cùng endpoint cho Luna, không
  ép kiểu sai hoặc thay dependency tree. Các model khác giữ request cũ.
- Không tách thêm call sentiment khi extraction đã trả nhãn hoặc đã lỗi.
  Những nhánh deterministic dùng sentiment call riêng theo contract base.
- Fallback có `fallbackReason` trong preview: mock, thiếu cấu hình, xác thực,
  budget, rate limit, timeout, output/evidence hoặc dịch vụ unavailable.
  Chỉ allowlist mã lỗi, không chuyển exception/body của provider ra UI.
- UI giải thích tại chỗ, nêu model đã cấu hình nhưng vẫn ghi rõ rule-based.
  Health bổ sung model cấu hình và `modelConnectivity=NOT_CHECKED`, không
  tự gọi model khi health được polling.
- Không sửa policy, Ground Truth, expected decision hoặc tự nhận nhãn model
  khi provider chưa thành công. Risk/authority vẫn ưu tiên sentiment.

## Việc chủ repo cần làm

1. Cập nhật `OPENAI_API_KEY` hợp lệ trong Vercel → vng-support → Settings →
   Environment Variables → Production. Key cần quyền model của project API;
   không gửi key trong chat hoặc commit.
2. Triển khai lại sau khi đổi secret để deployment nhận cấu hình mới.
3. Thử một preview synthetic. Chỉ xác nhận thành công khi response ghi
   `sentiment.source=model` và `sentiment.model=gpt-6-luna`.
   Nếu còn lỗi, đọc lý do cụ thể; không tăng cap hoặc bỏ validation.

## Kiểm tra

- `npm test`: 667 pass, 1 skip; SDK transport giả lập kiểm tra Luna cho cả
  hai ngữ cảnh sentiment, 401/429/500, thiếu cấu hình, budget và không retry.
- `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs`:
  15 pass.
- `npm run lint`, `npm run typecheck`, `npm run build`: PASS.
- `$env:SUPPORT_E2E_PRODUCTION='true'; npm run test:e2e -- --project=chromium`:
  71 pass.
- `$env:SUPPORT_E2E_PRODUCTION='true'; npm run test:e2e -- --project=mobile`:
  70 pass, 1 skip (video chỉ desktop).
  E2E chạy production build local ở port 3227, mock/memory, desktop/mobile
  tuần tự. Regression UI dùng response override, không chứng minh API thật.

Đây là kiểm thử code/mock và một lỗi xác thực live đã quan sát, không phải
bằng chứng inference Luna thành công hoặc benchmark chất lượng Luna. Không
chạy lại development 128, held-out, user study hay Mongo restart trong nhiệm vụ
này; các giới hạn độc lập đó chưa được giải quyết.
