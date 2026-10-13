# Tổng hợp phản hồi kiểm thử người dùng — 2026-10-13

## Phạm vi và độ tin cậy của hồ sơ

- Nguồn: báo cáo do chủ repo cung cấp, ghi nhận ngày 2026-10-13; nguồn mô tả
  ba người dùng với mã UT-01, UT-02 và UT-03.
- Môi trường được nguồn nêu: [VNG Support](https://vng-support.vercel.app/).
  SHA triển khai, policy/provider/model, trình duyệt và thời điểm từng lượt
  kiểm thử không có trong hồ sơ nguồn.
- Người tham gia trong bản nguồn đều được ghi vai trò chung là “Tester”; hồ sơ
  không nêu vị trí công việc hoặc quy trình helpdesk mà họ thường làm.
- Nguồn không kèm consent, quyền trích dẫn nguyên văn, thời lượng, ảnh/video,
  ticket ID hay ghi chú quan sát. Báo cáo này dùng mã người tham gia và diễn
  giải nội dung; tên thật và câu trích dẫn được giữ ngoài Git.
- Các sửa đổi dưới đây dựa trên mã `main` tại `454497f19ae5530110720a56af78240a05aaec43`.
  Kiểm tra regression sau sửa là kiểm tra phần mềm, không phải participant
  retest. Chưa xác nhận lỗi đã được sửa trên deployment đang chạy tại URL nêu
  trên.

## Tóm tắt

| Mã | Quy trình người dùng mô tả | Lỗi được báo cáo | Sửa đổi | Bằng chứng retest phần mềm |
| --- | --- | --- | --- | --- |
| UT-01 | Báo sự cố mạng/VPN kết nối lại tạm thời rồi rớt tiếp | Câu có từ ngữ báo đã kết nối bị phân loại là `RESOLVED` và kết thúc hội thoại khi lỗi tái diễn | Từ chối xác nhận resolved khi câu có dấu hiệu lỗi quay lại/rớt tiếp; thêm regression cho tiếng Việt và tiếng Anh | `tests/sentiment-separation.test.ts` |
| UT-02 | Đổi nhóm yêu cầu từ cấp quyền sang sự cố VPN | Form còn `requestKind` của nhóm cũ, làm sai phân loại và có thể kích hoạt escalation | Xóa `requestKind` khi đổi `serviceGroup`; người dùng cần chọn lại loại yêu cầu tương ứng | `tests/e2e/support.spec.ts` |
| UT-03 | Xem các rule bảo mật trong policy/audit | `PUBLIC_EXPOSURE` và `SECURITY_CONTROL` cùng mang mã `SEC-002` | Giữ `SEC-002` cho `PUBLIC_EXPOSURE`, đổi `SECURITY_CONTROL` thành `SEC-008`, tăng policy lên v5.13 | `tests/domain-contract.test.ts` |

## UT-01 — Sự cố tái diễn bị đóng nhầm

**Nội dung trong báo cáo nguồn:** người dùng báo mạng vừa kết nối lại được
trong thời gian ngắn nhưng lại rớt; bot nhận phần báo kết nối thành công và
đóng ticket, khiến họ không tiếp tục được.

**Cách tái hiện hồi quy:** trong một hội thoại hỗ trợ đang mở, gửi:

> Mình thử nhắn tin báo mạng vừa vào lại được một lúc rồi lại rớt tiếp.

Kết quả mong đợi: hội thoại không chuyển sang `COMPLETED`, lựa chọn feedback
không phải `RESOLVED`, và không tạo `knowledgeCandidate`. Câu xác nhận đã xử lý
rõ ràng, ví dụ “Tôi bực mình vì chờ lâu, nhưng đã làm được.”, vẫn phải được phép
đánh dấu hoàn tất.

**Nguyên nhân trong mã trước sửa:** nhận diện từ/cụm xác nhận thành công như
“vào được” không loại trừ đủ dấu hiệu tái diễn ở phần sau cùng một câu.

**Sửa đổi:** nhận diện các tổ hợp như “lỗi lại xuất hiện”, “rớt tiếp”,
“disconnect again” và “dropped again” trước khi áp dụng mẫu xác nhận hoàn tất.
Kiểm tra hồi quy gồm ba câu báo tái diễn bằng Việt/Anh và ca đối chứng xác nhận
đã xử lý.

**Trạng thái:** regression test tự động đã chạy trong bộ test mục tiêu; người
dùng UT-01 chưa retest bản sửa.

## UT-02 — Đổi nhóm nhưng giữ phân loại con cũ

**Nội dung trong báo cáo nguồn:** người dùng chọn nhầm nhóm yêu cầu cấp quyền,
sau đó chuyển sang nhóm sự cố VPN. Form bị cho là giữ lựa chọn cũ và ticket bị
đẩy lên cấp quản lý không đúng.

**Cách tái hiện hồi quy:** mở workspace, chọn theo danh mục, chọn nhóm
`ACCOUNT_ACCESS` và loại `ACCESS_REQUEST`; mở phần thông tin khác; đổi nhóm sang
`NETWORK_VPN`. Loại yêu cầu cũ phải bị xóa. Chọn loại `VPN_NOT_CONNECTING`, nhập
mô tả “VPN không kết nối” rồi gửi. Với dữ liệu synthetic này, kết quả mong đợi
là luồng “Có thể hỗ trợ an toàn”, không kế thừa `ACCESS_REQUEST`.

**Nguyên nhân trong mã trước sửa:** handler đổi `serviceGroup` reset các trường
chi tiết nhưng không reset `requestKind`.

**Sửa đổi:** handler đổi nhóm xóa `requestKind`; thêm Playwright regression kiểm
tra UI, giá trị form sau đổi nhóm và kết quả gửi.

**Trạng thái:** Playwright regression được thêm; kết quả chạy được ghi ở phần
kiểm tra của commit. Người dùng UT-02 chưa retest bản sửa.

## UT-03 — Mã rule bảo mật bị trùng

**Nội dung trong báo cáo nguồn:** màn hình/bảng policy được mô tả là gắn cùng
`SEC-002` cho rủi ro mở dịch vụ ra Internet (`PUBLIC_EXPOSURE`) và thiếu/tắt
kiểm soát bảo mật (`SECURITY_CONTROL`).

**Cách tái hiện hồi quy:** kiểm tra `riskRules`, so sánh ID của hai signal nói
trên và xác nhận mọi ID policy là duy nhất. Kỳ vọng `PUBLIC_EXPOSURE` vẫn là
`SEC-002`, còn `SECURITY_CONTROL` là `SEC-008`.

**Nguyên nhân trong mã trước sửa:** hai entry trong dữ liệu policy dùng cùng một
ID.

**Sửa đổi:** gán ID riêng `SEC-008` cho `SECURITY_CONTROL`, giữ nguyên ID của
`PUBLIC_EXPOSURE`, tăng `POLICY_VERSION` lên `support-guidance-v5.13` để nhận
diện thay đổi policy.

**Trạng thái:** kiểm tra contract tự động bao phủ tính duy nhất và hai ánh xạ;
người dùng UT-03 chưa retest bản sửa.

## Kiểm tra thực hiện

- `tests/sentiment-separation.test.ts` và `tests/domain-contract.test.ts`:
  18 test passed.
- `next typegen` và `tsc --noEmit`: passed.
- Playwright: test UT-02 `changing the service group clears the old request kind`
  passed trên Chromium (1 test).
- ESLint các file TypeScript đã sửa: passed.
- `git diff --check`: passed.

## Việc cần làm để khép kín đánh giá người dùng

1. Cho UT-01/02/03 tự chạy lại đúng kịch bản trên một deployment có ghi SHA và
   policy version; không dùng người sửa code làm người tham gia thay thế.
2. Ghi kết quả đạt/trượt, browser, thời lượng, trợ giúp/bỏ cuộc và nhận xét do
   từng người tự viết; ghi riêng consent và phạm vi cho phép công bố.
3. Xác minh vai trò/quy trình nghiệp vụ bằng hồ sơ riêng có kiểm soát truy cập;
   không đưa tên/chức danh hay raw quote vào repo công khai.
4. Cập nhật protocol và báo cáo này bằng kết quả retest thật. Regression tự động
   xác nhận hành vi mã, không xác nhận trải nghiệm thực tế hay hiệu quả vận hành.
