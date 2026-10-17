# Sentiment và chuyển người dựa trên tương tác

Thay đổi có AI assistance. Đây là workflow đề xuất của dự án, không phải policy chính thức của VNG hoặc bộ phát hiện cảm xúc thật/giả. Base local `669bece` được tích hợp với GitHub main `4ee9e32` trước khi kiểm tra.

Sentiment chỉ mô tả cảm xúc thể hiện trong câu chữ. Model không quyết định độ chân thật, quyền truy cập, ưu tiên, hoàn tất hoặc escalation. Trích dẫn, ví dụ, giả định, đóng vai và chỉ dẫn gán nhãn bị loại khỏi bằng chứng cảm xúc; nhãn model sai vẫn không tự thay workflow.

## Rule HANDOFF-002

- Chỉ áp dụng với hướng dẫn đang mở (`AUTO_APPROVED`, `ROUTINE`) đã có ít nhất hai lượt trả lời. Không áp dụng cho review work-evidence hoặc thay thế policy bảo mật/quyền.
- Hai lượt phản hồi khác nhau báo chưa làm được sau hướng dẫn, cùng chủ đề, kèm biểu hiện thất vọng trong phản hồi hiện tại: chuyển nhân viên.
- Nhận diện biểu hiện sốt ruột như “chờ quá lâu” hoặc “đợi quá lâu” trong điều kiện hai lượt trên. Phủ định như “không cảm thấy bực mình”, “không phải chờ quá lâu” không kích hoạt chuyển sớm. Phủ định chỉ áp dụng cho cụm cảm xúc tương ứng: “không cảm thấy bực mình, nhưng chờ quá lâu” vẫn có biểu hiện sốt ruột.
- Ba lượt phản hồi khác nhau báo chưa giải quyết sau hướng dẫn: chuyển nhân viên ngay cả khi cảm xúc trung tính. Người dùng không cần thể hiện tức giận để được giúp đỡ.
- Câu lặp, “bước tiếp theo”, “tiếp tục”, cảm xúc đơn thuần và tự khai “đã thử 100 lần” không được tính thành nhiều lượt. Mỗi vòng có chỉ số hướng dẫn do server ghi; chỉ tính phản hồi gắn với cùng intent. Hồ sơ cũ thiếu metadata vòng được xử lý thận trọng, không suy ra số lần đã thử.
- Khi người dùng nói rõ muốn tiếp tục với Luna, rule mới không tự chuyển. Yêu cầu chuyển người rõ ràng vẫn hoạt động mà không cần chứng minh frustration. Các nút workflow hiện có và giới hạn hướng dẫn cũ vẫn được giữ.
- Câu chứa yêu cầu rủi ro hoặc thao tác mới phải qua policy trước. Đổi sang vấn đề khác không kế thừa số lần thất bại của vấn đề trước.

Việc “đã thử” là người dùng báo lại; hệ thống không có telemetry để xác minh họ thật sự thao tác trên thiết bị. Không tuyên bố loại bỏ được mọi hành vi giả mạo. Mục đích là tránh để từ ngữ giận dữ hoặc một nhãn sentiment đơn lẻ điều khiển hệ thống, đồng thời dừng vòng hỗ trợ không hiệu quả.

## Lưu trữ và người dùng

Chuyển người ghi `HANDOFF-002`, lý do, trạng thái và feedback trong cùng cập nhật có kiểm tra version. Giữ nguyên câu hỏi và lịch sử hướng dẫn; không tạo quyền, tăng ưu tiên hoặc thực thi thao tác thiết bị. Người gửi thấy trạng thái chờ nhân viên trên hồ sơ và lịch sử khách; reviewer nhận đầy đủ ngữ cảnh.

Đã bỏ caption model/cache `gpt-6-luna · Đã lưu` trong tiêu đề tóm tắt. Nội dung tóm tắt và cache API còn nguyên; nhãn mock/fallback vẫn phân biệt được nguồn kiểm thử. Hai giải đáp tự động hiện bằng toàn bộ nội dung Luna trả về sau validation. [Ba mẫu VPN từ Luna thật](LUNA-VPN-SAMPLES.md).

## Kiểm chứng

`tests/interaction-handoff.test.ts` kiểm tra tức giận đơn lẻ, role play, quoted evidence, chỉ dẫn gán nhãn, giả định, câu lặp, model gán nhãn sai, hai vòng kèm thất vọng, ba vòng trung tính, đổi chủ đề, từ chối chuyển người, yêu cầu chuyển rõ ràng, security precedence, version và audit/readback.

`tests/e2e/interaction-handoff.spec.ts` đi qua form hội thoại đến hàng đợi reviewer, reload trạng thái và xác minh caption tóm tắt đã bỏ. Bộ 15 Verify và Ground Truth giữ nguyên. Unit/E2E dùng synthetic/mock; riêng [mẫu VPN](LUNA-VPN-SAMPLES.md) lấy từ hai lời gọi OpenAI/gpt-6-luna thật trong bộ nhớ local, không ghi Mongo.

## Bản sửa nhận diện phủ định và chờ lâu

Base: `19d526910c62b9ef1798c9fcae4a888c40b5f900`. Thay đổi có AI assistance, không suy ra human review từ Git identity. Diff gồm bộ nhận diện frustration, helper phủ định dùng chung với sentiment fallback, test unit/service, E2E và tài liệu này. Không đổi ngưỡng HANDOFF-002 hoặc bộ phân tích policy bảo mật.

Test bổ sung đi qua hai vòng hội thoại của service với dữ liệu giả lập: phủ định/đóng vai không chuyển sớm, lời phàn nàn chờ lâu chuyển cùng audit và lịch sử; một vòng chưa đủ điều kiện. Test fallback kiểm tra nhãn, E2E kiểm tra hai câu yêu cầu trên form và trạng thái sau reload. Bộ test mới tái hiện lỗi trước bản sửa; các kết quả chỉ chứng minh hành vi trong các tình huống được kiểm thử, không chứng minh khả năng phát hiện cảm xúc thật/giả.

Kết quả local: `npm test` đạt 1.524 test, skip 1 benchmark opt-in; lint, typecheck, build và kiểm tra tài liệu đạt. `tests/e2e/interaction-handoff.spec.ts` đạt 4/4 desktop và 4/4 mobile trên production build local với mock/memory. Lượt chạy đầy đủ Vitest và build ban đầu bị sandbox Windows chặn ghi cache/thư mục (EPERM); chạy lại ngoài sandbox đạt. Không gọi model hoặc database Production, không thay Ground Truth.
