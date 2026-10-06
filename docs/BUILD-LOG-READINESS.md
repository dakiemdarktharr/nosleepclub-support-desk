# Build log — lượt nâng readiness (bản ghi để đội thi duyệt)

**Bối cảnh.** VNG Support, Đề A The Escalation Referee. Base GitHub main
`c2a832031deedd758120d49578eed52f6c12d190`; checkout gốc dirty được bảo toàn,
thực hiện trong worktree riêng. Theo yêu cầu chủ repo, chỉ commit local.

**Công cụ và cách dùng.** Codex hỗ trợ đọc code/trace, viết regression tối
thiểu, sửa TypeScript, soạn protocol và tổng hợp kết quả. Vitest chạy boundary
và domain tests; Playwright kiểm tra desktop/mobile bằng Chromium; Next build,
ESLint, TypeScript kiểm tra ứng dụng. Git/gh xác minh revision, diff và lịch sử
CI. Health live chỉ đọc; không gọi LLM trả phí hoặc Mongo production.

**Điểm hữu ích.** Regression tái hiện alias dữ kiện bị tách thành subrequest,
approval context bị coi là tác vụ, và yêu cầu quyền bị hỏi nhầm artefact. Thêm
redaction có test cho mẫu synthetic; thêm provenance/metric reporter và luồng
giám khảo từ đầu trang đến Verify/audit/input mới. Có cả negative controls để
giữ risk/approval gate và không nuốt tác vụ lạ.

E2E mới tìm thấy tour mobile che nút lịch sử; đã dành vùng cuộn dưới hộp tour,
không dùng forced click để né lỗi. Audit dependency phát hiện advisory mới:
vá lockfile sharp/source-map-js tương thích và chạy lại bộ kiểm tra; không ép
nâng Tailwind major. Advisory còn lại được ghi trong báo cáo, không báo audit xanh.

**Chi phí và điều chưa đạt.** Một guard đầu tiên quá rộng làm test tối ưu SQL
thất bại; đã thu hẹp theo permission rõ ràng, giữ expected cũ. Bump version làm
hai test metadata cần cập nhật v5.8; không đổi action/bucket/rule. Test approval
mới ban đầu kỳ vọng hỏi thêm, nhưng code AUTH-007 quy định reviewer cho reference
không xác minh được; đã sửa test mới theo rule hiện hành, không sửa fixture cũ.
Các vòng thử/sửa này có chi phí thực nhưng chưa đo thời gian/chi phí riêng,
không gán số tiết kiệm. 128 fixture vẫn 56 exact-match, không có gain accuracy.

**Phần lớn nhất chủ động không triển khai.** Không biến claimed approval thành
verified approval để nâng điểm; không bật adaptive threshold production từ
feedback chưa gán nhãn. Cần owner, thẩm quyền và dữ liệu độc lập trước khi đổi
gate. Không cài SSO, cloud/IAM action hoặc notification thiếu cấu hình được duyệt.

**Bằng chứng còn thiếu.** Held-out độc lập, ba người dùng/consent/văn bản phản hồi,
cải tiến từ phản hồi, Mongo restart và chất lượng live model đều chưa được thu
thập/kiểm chứng. [Báo cáo](COMPETITION-READINESS.md) tách rõ kết quả local/mock,
health live và NOT COLLECTED. Đội thi phải bổ sung build log lịch sử của chính
mình; tài liệu này không tự xác nhận đóng góp sinh viên, human review hoặc thời
gian phát triển thuộc sprint. Không sửa/backdate lịch sử Git.
