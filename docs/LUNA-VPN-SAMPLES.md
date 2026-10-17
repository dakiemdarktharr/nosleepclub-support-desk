# Ba mẫu tin nhắn VPN từ Luna thật

Input synthetic: **VPN không kết nối**. Hai lời gọi trực tiếp tới OpenAI, model trả về **gpt-6-luna**, cả hai `finish_reason=stop`; response ứng dụng đều có `source=openai`, không fallback. Snapshot tạo trong bộ nhớ local, không ghi Mongo hoặc gửi tin cho người thật. Đây là kiểm chứng kỹ thuật có AI assistance, không phải nghiên cứu người dùng.

Luna trả toàn bộ nội dung hai giải đáp; server chỉ validate và trả nguyên văn, không ghép thêm phần hướng dẫn vào output của model. Hai mẫu giữ cùng các bước đã rà soát và khác cách trình bày; chưa đủ dữ kiện để khẳng định một nguyên nhân duy nhất hoặc hứa sửa chắc chắn.

## 1. Hỏi thêm thông tin

Bạn cho mình biết mã lỗi hoặc thông báo lỗi, hệ điều hành và thời điểm bắt đầu lỗi nhé?

## 2. Giải đáp theo đoạn

Mình gửi bạn các bước kiểm tra khi VPN chưa kết nối:
Kiểm tra Internet bằng một trang nội bộ hoặc trang công khai tin cậy mà bạn thường dùng.
Mở ứng dụng VPN chính thức đã được IT cung cấp và kiểm tra tên profile công ty.
Ghi lại mã lỗi, thời điểm và hệ điều hành; không gửi mật khẩu, token hoặc mã MFA.
Thử kết nối lại một lần; giữ nguyên MFA, firewall và các kiểm soát bảo mật.
VPN kết nối được, hoặc bạn có mã lỗi và thời điểm để nhân viên tiếp tục kiểm tra.
Không gửi mật khẩu hoặc mã xác minh. Dừng lại nếu thấy yêu cầu xóa dữ liệu hoặc tắt bảo vệ thiết bị.
Nếu vẫn chưa được hoặc không thể làm an toàn, bạn phản hồi tại hồ sơ này để mình hỗ trợ tiếp nhé.

## 3. Giải đáp theo bước

Bạn có thể lần lượt kiểm tra VPN theo các bước sau:
1. Kiểm tra Internet bằng một trang nội bộ hoặc trang công khai tin cậy mà bạn thường dùng.
2. Mở ứng dụng VPN chính thức đã được IT cung cấp và kiểm tra tên profile công ty.
3. Ghi lại mã lỗi, thời điểm và hệ điều hành; không gửi mật khẩu, token hoặc mã MFA.
4. Thử kết nối lại một lần; giữ nguyên MFA, firewall và các kiểm soát bảo mật.
5. VPN kết nối được, hoặc bạn có mã lỗi và thời điểm để nhân viên tiếp tục kiểm tra.
6. Không gửi mật khẩu hoặc mã xác minh. Dừng lại nếu thấy yêu cầu xóa dữ liệu hoặc tắt bảo vệ thiết bị.
7. Nếu vẫn chưa được hoặc không thể làm an toàn, bạn phản hồi tại hồ sơ này để mình hỗ trợ tiếp nhé.

## Ghi chú kiểm chứng

Tin hỏi được gọi qua `draftReviewInformation`; hai giải đáp qua `draftReviewReasons`. Chạy với cấu hình Luna hiện có, hai lượt inference, không đổi model hoặc credential. Full answer phải giữ bước kiểm tra, kết quả cần xác nhận và cảnh báo. Soạn nháp không đổi version/audit; reviewer vẫn xác nhận trước khi gửi.
