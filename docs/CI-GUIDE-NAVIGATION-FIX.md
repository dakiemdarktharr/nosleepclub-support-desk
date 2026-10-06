# Sửa lỗi CI: hướng dẫn che điều hướng

Base: `87cc3d60a1bed00162a3485790f66bf2b4776d6d` trên `main`.

## Bằng chứng và nguyên nhân

Hai lần push đã được GitHub tiếp nhận nhưng job `checks` thất bại tại E2E
`reviewer tour is independent and never executes a decision automatically`:

- [Run 37500524917](https://github.com/dakiemdarktharr/vng-support/actions/runs/37500524917)
- [Run 37502070309](https://github.com/dakiemdarktharr/vng-support/actions/runs/37502070309)

Log cho thấy `.guide-tip` chặn pointer khi người dùng bấm logo `VNG Support`
để về trang chọn vai trò. Hộp hướng dẫn đặt cách đỉnh viewport 12px mà chưa
chừa phần header; vị trí này có thể đè lên logo khi viewport hoặc bố cục thay đổi.

## Phạm vi sửa

- `src/components/judge-guide.tsx`: đo đáy header đang hiển thị, đặt hộp hướng
  dẫn bên dưới và giới hạn chiều cao theo khoảng trống. Đo lại khi cuộn, resize
  hoặc header đổi kích thước; điểm đầu mũi tên dùng vị trí mới.
- `tests/e2e/judge-guide.spec.ts`: thêm ba viewport (1280×600, 844×390,
  390×844), kiểm tra hộp hướng dẫn không đè header và bấm logo thật khi tour
  vẫn mở. Không dùng forced click, không đóng tour để né lỗi.
- Báo cáo này ghi nhận base, nguyên nhân và kiểm tra. Không đổi workflow CI,
  policy, Ground Truth, expected output cũ hay cấu hình deployment.

## Kiểm tra local trên bản sửa

Trước khi sửa component, cả ba kiểm thử mới đều thất bại trên Chromium:
hai ca phát hiện hộp đè header, một ca bị chặn click logo. Sau khi sửa:

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | 589 đạt, 1 bỏ qua (benchmark intent chỉ chạy khi bật riêng) |
| `node --test scripts/mongo-smoke-guard.test.mjs` | 11 đạt |
| `npm run lint` | Đạt |
| `npm run typecheck` | Đạt |
| `npm run build` | Đạt |
| `npm run test:e2e -- --project=chromium` | 65 đạt |
| `npm run test:e2e -- --project=mobile` | 64 đạt, 1 bỏ qua (quay video chỉ desktop) |
| `git diff --check` trên các file thuộc nhiệm vụ | Đạt |

E2E dùng `SUPPORT_E2E_PRODUCTION=true`, production build **local** trên
`127.0.0.1:3227`, mock provider và memory-demo; build, desktop và mobile chạy
tuần tự. Ca từng thất bại trên CI đạt ở cả hai project. Đây không phải bằng
chứng kiểm tra live model, Mongo production hoặc bản triển khai Vercel.

## Bảo toàn và provenance

Thực hiện trong worktree riêng, ban đầu sạch. Đối chiếu checkout gốc với
snapshot 306 mục (305 file và một mục thư mục): không thay đổi nội dung hay
thêm mục. Các artifact do kiểm thử sinh ra được giữ ngoài commit.

Phân tích, sửa và kiểm thử có AI assistance (Codex); không suy ra human review
từ Git identity. Kết quả GitHub Actions của commit sửa được kiểm tra riêng
sau push; các run cũ thất bại vẫn là lịch sử của các commit cũ.
