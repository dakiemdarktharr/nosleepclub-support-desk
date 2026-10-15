# Chuyển động UI và trạng thái chờ

Base triển khai: `687ecd554095301ed93ff349d468a9e3daf7e9ad`. Phạm vi: giao diện, trạng thái tải, timeout trình duyệt, hướng dẫn và ảnh README. Không đổi policy, Ground Truth, model hoặc quyền. AI assistance: Codex triển khai và kiểm thử; ảnh là local mock/synthetic.

## Contract và cách hoạt động

| Tương tác | Hành vi |
| --- | --- |
| Hover | Scale nhẹ 1,025, chỉ với thiết bị có hover/con trỏ chính xác; không hover giả trên touch. |
| Press | Scale 0,97 khi nhấn chuột/touch hoặc Space; nút disabled không phản ứng. Focus ring và click gốc giữ nguyên. |
| Logo về Home | Rèm cam đi ngang. Link vẫn có href, prefetch, Ctrl/Cmd-click và browser back; điều hướng bắt đầu ngay. |
| Ba lựa chọn Home | Vạch trắng mở dọc từ tâm rồi hai mảng cam tách sang bên. Tour lần đầu đợi reveal kết thúc trước khi mở dialog. |
| Tải trang/dữ liệu | Skeleton shimmer tại Next loading boundary, hồ sơ, hàng đợi và audit. Chỉ hiện khi đang chờ thật, không đặt delay để cố hiện skeleton. |
| Chờ phản hồi | Khung VNG Support AI với progressbar indeterminate, thông báo trạng thái dễ đọc; không % giả, không tự nhận model đã thành công. |
| Giảm chuyển động | Bỏ rèm/scale/shimmer; progress giữ tĩnh và có nhãn. Đổi preference trong lúc chuyển trang sẽ hủy rèm ngay. |

`route-transition.tsx` giữ overlay ngoài surface, pointer-events none, không clone trang hoặc remount form. Cover 180 ms, reveal tối đa 560 ms; watchdog 2,5 giây dọn overlay nếu điều hướng lỗi/hủy. Timer/listener/animation được cleanup khi đổi route/unmount. Overlay không can thiệp quyền hoặc request.

`loading-feedback.tsx` cung cấp skeleton và thanh chờ dùng chung. Live status không nằm trong vùng aria-busy làm trì hoãn thông báo. Không gán aria-valuenow khi backend không có phần trăm. Khi lỗi, loader bị gỡ, thông báo xuất hiện và input được giữ.

Rà soát toàn luồng phát hiện và sửa thêm: tour người gửi từng kết thúc sớm khi Next loading boundary tạm thay trang sau khi lưu; nay giữ vai trò đang hướng dẫn đến khi trang đích sẵn sàng. Audit chỉ thông báo trạng thái tải một lần, skeleton ở đây là trang trí. Các selector và tài liệu còn dùng nhãn “Dành cho nhân viên” được đồng bộ với “Dành cho Admin” đã có trên base; không thay kỳ vọng nghiệp vụ để vượt kiểm thử.

`browser-api.ts` dùng AbortController giới hạn 60 giây cho cả header và JSON body. Không tự retry POST. Timeout là chưa biết kết quả, không tuyên bố server chưa lưu; submit giữ idempotency key hiện có. Người dùng kiểm tra trạng thái/thử lại theo lỗi. Regression có stalled fetch, stalled body, lỗi409, recovery và bảo toàn bản nháp.

## Tham khảo

Tự viết React/CSS dựa trên hành vi công khai của [Hover](https://motion.dev/examples/svelte-hover), [Press](https://motion.dev/examples/svelte-press), [Curtains Wipe](https://motion.dev/examples/react-curtains-wipe), [Skeleton Shimmer](https://motion.dev/examples/react-skeleton-shimmer), [Base Progress](https://motion.dev/examples/react-base-progress) và [Loading Line Reveal](https://motion.dev/examples/vue-loading-line-reveal). Không sao chép source Motion+, không dùng API trả phí, không thêm runtime Vue/Svelte hoặc hệ thống component mới.

Màu lấy từ token hiện có: cam #F05A22, chữ #202124, nền #FAFAF8/trắng, màu nền nhấn #FFF0E9. Giữ font Nunito. Scale nhỏ hơn demo để các nút sát nhau không đè lên nội dung.

## Tái lập

Chạy unit/integration, lint, typecheck, build theo RUNBOOK. Sau build, chạy E2E desktop và mobile riêng trên server mock/memory 127.0.0.1:3227:

```powershell
$env:SUPPORT_E2E_PRODUCTION='true'
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=mobile
```

`tests/e2e/motion.spec.ts` kiểm tra cả ba entry, logo, browser back, bàn phím/press, reduced motion, đổi preference trong animation, skeleton → dữ liệu, lỗiAPI → retry, chờ follow-up/handoff, timeout và onboarding. Bộ E2E còn lại bảo vệ gửi/preview/lưu, ID, reviewer, audit, Verify, QR và tour. Mock/stub không chứng minh Mongo transaction hoặc AI live.

Ảnh README chọn từ `artifacts/motion-home-chromium.png`, `motion-home-mobile.png`, `motion-ai-card-chromium.png`; thanh chờ được dừng ở một frame để chụp rõ, không đổi trạng thái nghiệp vụ. Không commit artifacts/log/trace runtime còn lại.

## Kết quả kiểm tra ngày 15/10/2026

Candidate phát triển từ base nêu trên, tích hợp thêm `133268a` (chỉ bổ sung README, không đổi runtime). Môi trường Windows, production build Next.js local, mock/memory, không dùng key AI hay Mongo Production:

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | 1.244 pass, 1 skip benchmark tùy chọn. |
| `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs scripts/check-docs.test.mjs` | 18 pass (chạy guard 11 và hai script còn lại 7). |
| `npm run lint`, `npm run typecheck`, `npm run build` | PASS. Build hoàn tất trước khi chạy E2E. |
| `npm run check:docs` | 34 Markdown files, PASS local links/conflict markers; không kiểm tra remote URLs/anchors. |
| `npm run test:e2e -- --project=chromium` | 95/95 pass, không retry tự động. |
| `npm run test:e2e -- --project=mobile` | 94 pass, 1 skip bài quay video chỉ dành desktop. Pixel 7 emulation bằng Chromium. |
| `npx playwright test tests/e2e/motion.spec.ts -g 'line reveal enters /login'` | 2/2 pass sau khi thêm chờ nội dung/ảnh sẵn sàng trước chụp README, desktop và mobile. |
| `npm run test:persistence` | 1 skip: `persistenceVerification=NOT_PERFORMED`; không có URI/ack Mongo cô lập, không kết nối database. |
| `npm audit --omit=dev` / `npm audit` | Runtime: 0 advisory; full tree: 7 high ở dev dependency, xem dưới. |

Các lượt đầu có lỗi selector mới, selector nhãn Admin cũ, tour bị ngắt qua loading boundary và status tải audit bị lặp. Đã sửa nguyên nhân/selector đúng phạm vi và chạy lại; không xóa bài test hoặc đổi Ground Truth. Mỗi suite E2E dùng server local mới, dữ liệu memory chỉ tồn tại trong process; không tạo/xóa hồ sơ Production. Kiểm thử này không chứng minh inference model thật, SSO hay Mongo durability.

## Giới hạn còn lại

- Không thể kết luận mọi lỗi đã hết từ một bộ test. API identity local thiếu Mongo vẫn trả lỗi rõ; không biến thành tài khoản giả thành công.
- `npm audit --omit=dev` hiện không có advisory. Full audit có 7 mục high cùng chuỗi công cụ dev phụ thuộc `braces`: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Advisory ghi chưa có patched version; npm hiện trả braces3.0.3. Không force nâng Tailwind4 hoặc hạ eslint-config-next để che báo cáo; không thêm ngoại lệ audit. Dependency tree không thay đổi trong lượt UI.
- Skeleton có thể không xuất hiện khi cache/prefetch trả trang ngay. Animation không buộc giữ người dùng chờ.
- Hình README là ảnh tĩnh; xem thao tác trên app để quan sát chuyển động. Chưa là kiểm chứng mọi tổ hợp trình duyệt/thiết bị thật.
