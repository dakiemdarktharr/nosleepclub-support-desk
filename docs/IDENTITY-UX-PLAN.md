# Phạm vi UI và ID nhân viên

Base: `7857d5c0024dbfd9691fd998241f30f0a27ad8cf`. Thực hiện có AI hỗ trợ.

## Kiểm kê trước thay đổi

| Tính năng | Vị trí giữ lại |
| --- | --- |
| Gửi tự do/danh mục, preview, sửa, xác nhận lưu | `/send-help`, `/workspace` |
| Hội thoại, clarification, feedback A/B/C/D, chuyển người | `/requests/[id]` |
| Tra cứu mã/liên kết | `/track` |
| Reviewer, lọc, phân trang, quyết định có lý do, override/stop | `/review` |
| Audit, metrics thật, tìm kiếm | `/audit` |
| Verify 4/5/15 case, resume, input mới, readback | `/verify` |
| Gợi ý tri thức chờ review | Bộ lọc reviewer |
| QR/copy URL, hướng dẫn lần đầu, bàn phím/mobile | Header và guide hiện có |

Brief yêu cầu demo công khai không cần tạo tài khoản. Giữ đường vào demo hỗ trợ
và Verify ngay cạnh đăng nhập. Đăng nhập là lựa chọn mặc định; demo không cấp
quyền duyệt đơn ID. Theo điều chỉnh của chủ repo, người gửi có ID đã cấp được
vào bằng ID, hiển thị rõ assurance demo; IT phải dùng OTP trên kênh tin cậy.

## Thiết kế

Nunito hiện có; trắng `#ffffff`, chữ `#202124`, phụ `#60646c`, viền `#e3e5e8`,
cam nhận diện `#f05a22`, cam đậm dễ đọc `#a7360d` từ CSS hiện có. Cam nhấn và
nền nút dùng chữ tối/biến thể đậm đủ tương phản. Bố cục căn trái, một form chính,
các lối hỗ trợ luôn nhìn thấy; các bước chỉ dùng cho trình tự thực tế.

```text
VNG Support                         QR / Hướng dẫn
Đăng nhập                 Hỗ trợ vẫn ở đây
[ID nhân viên]            [Tôi cần hỗ trợ] [Theo dõi]
[Tiếp tục]                [Nhân viên xử lý] [Verify]
Nhân viên mới?            Minh bạch về truy cập demo
```

Đơn mới: họ tên → job có sẵn/job mới → phạm vi → kiểm tra và gửi. Job có sẵn
hiển thị phiên bản, quyền được phép và quyền chưa được cấp; job mới dùng enum và
đích cụ thể, không wildcard. Thành công có liên kết theo dõi riêng; chỉ hiển thị
ID chính thức sau quyết định IT. IT nằm trong cùng navigation hỗ trợ.

Đánh giá `U.I LIB.txt`: shadcn/ui phù hợp cách sở hữu component với Next/React/
Tailwind ([tài liệu](https://ui.shadcn.com/docs/react-19)); React Aria phù hợp khi
cần primitive tương tác phức tạp. Mantine, HeroUI, MUI và Chakra là các nền UI
thay thế, không trộn vào nền hiện có (ví dụ [MUI Next](https://mui.com/material-ui/integrations/nextjs/)).
21st.dev là nguồn tham khảo; Magic UI/Aceternity thiên về hiệu ứng; Tremor thiên
về dashboard. Không có nhu cầu ở đây biện minh thêm các dependency đó. Chọn một
nền: component `ui.tsx` hiện có + native form controls/Tailwind; không nhận là
đã cài shadcn. Focus rõ, status/alert, nhãn gắn input, reduced motion, responsive.

## Contract và authority

- Mongo là nguồn chuẩn của đơn, profile có phiên bản, nhân viên, phiên, OTP,
  quyết định và audit. Không fallback memory/CSV/browser storage.
- Cấp ID + profile mới + quyết định + audit cùng Mongo transaction; unique ID
  chống cấp trùng đồng thời. Trùng tên phải IT quyết định suffix, có lý do.
- Phiên demo chỉ hỗ trợ người gửi; không được quyền IT, danh bạ hay thao tác tài
  nguyên. Phiên OTP cũng không vượt scope hoặc deterministic policy.
- Scope khớp chính xác môi trường/tài nguyên/thao tác/đích. Production, secrets,
  khóa, root/admin, xuất dữ liệu và thay đổi nguy hiểm luôn cần authority riêng;
  duyệt job không cho phép thực thi các thao tác đó.
- CSV cũ chỉ là seed lịch sử, không tự import. Không đổi storage của Support.
- Không có connector thực thi tài nguyên; API scope chỉ trả quyết định quyền,
  không được mô tả là đã thực hiện một tác vụ thật.
