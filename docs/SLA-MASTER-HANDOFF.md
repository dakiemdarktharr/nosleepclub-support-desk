# SLA cho VNG Support — nghiên cứu và Master Handoff Prompt

Ngày nghiên cứu: 17/10/2026

Ghi chú nguồn gốc: tài liệu được soạn với hỗ trợ AI dựa trên tài liệu dự án và nguồn công khai. Các mục tiêu thời gian chưa phải cam kết được VNG phê duyệt.

## Tóm tắt nghiên cứu

SLA phát huy tác dụng khi nối được ba việc: người dùng kỳ vọng mức phục vụ nào, đội nào chịu trách nhiệm, và hệ thống đo việc thực hiện ra sao. Nó là một thỏa thuận về kết quả phục vụ, phạm vi, thời hạn, lịch tính giờ, trách nhiệm và cách xử lý khi không đạt; không chỉ là đồng hồ đếm ngược. ITIL nhấn mạnh mục tiêu dịch vụ gắn với nhu cầu kinh doanh và trải nghiệm. Google SRE phân biệt phép đo, mục tiêu nội bộ và cam kết dịch vụ. Các nền tảng ITSM thường cho cấu hình mục tiêu theo loại yêu cầu, lịch làm việc và điều kiện bắt đầu, tạm dừng, kết thúc.

| Khái niệm | Ý nghĩa khi thiết kế Helpdesk |
|---|---|
| **SLI** | Chỉ số đo kết quả thực tế, như tỷ lệ ticket được nhân viên hỗ trợ phản hồi trong hạn. |
| **SLO** | Mục tiêu nội bộ đặt cho SLI để theo dõi và hiệu chỉnh vận hành. |
| **SLA** | Cam kết được phê duyệt với người dùng, nêu phạm vi, mục tiêu, lịch tính giờ và cách xử lý khi không đạt. |
| **OLA** | Thỏa thuận giữa các đội nội bộ về bàn giao và thời gian xử lý, hỗ trợ SLA chung. |

Với VNG Support, cần phân biệt độ trễ của AI với thời gian xử lý ticket. Dự án đã đo thời gian ở các bước AI và cache, nhưng tài liệu nói rõ các số đó chưa phải SLA. Luồng hiện có đã có quy tắc bàn giao cho nhân viên sau các lượt hướng dẫn chưa giải quyết được vấn đề, cùng lịch sử và audit. Vì vậy, một bước khởi đầu có ích là đo thời gian người phụ trách tiếp nhận và phản hồi sau bàn giao.

Cần phân biệt phòng ban của người gửi với đội sở hữu dịch vụ và xử lý yêu cầu. Form hiện có chín nhóm phòng ban; với phiên khách, phòng ban chỉ là ngữ cảnh demo chưa xác minh. Khi mở rộng sang Nhân sự, Tài chính hoặc các đơn vị khác, phòng ban người gửi không tự cho biết ai xử lý hay thời hạn nào áp dụng.

Các mục tiêu thời gian hiện chưa được xác lập trong policy. Policy đang ở phiên bản `support-guidance-v5.20`; tài liệu dự án nêu rõ đây là demo/challenge policy, chưa phải chính sách chính thức của VNG. Báo cáo thử nghiệm cũng nói ba mẫu thời gian chưa đủ để suy ra SLA hay p95. Do đó, prompt bên dưới yêu cầu thiết kế hệ thống và chế độ đo thử trước; không tự đặt thời hạn thành cam kết.

### Nguồn tham khảo

- [PeopleCert — ITIL 4 Practitioner: Service Level Management](https://www.peoplecert.org/browse-certifications/it-governance-and-service-management/ITIL-1/itil-4-practitioner-service-level-management-3867): mục tiêu dựa trên nhu cầu kinh doanh, đo lường, trách nhiệm và cải tiến.
- [Google SRE Workbook — Implementing SLOs](https://sre.google/workbook/implementing-slos/): phân biệt SLI/SLO/SLA và dùng phép đo phù hợp với trải nghiệm người dùng.
- [Atlassian — SLA goals](https://support.atlassian.com/jira-service-management-cloud/docs/create-service-level-agreements-slas/): mục tiêu theo loại công việc, mức ưu tiên và lịch làm việc.
- [Atlassian — SLA conditions](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/): định nghĩa điều kiện bắt đầu, tạm dừng và kết thúc đồng hồ.
- [ServiceNow — Task SLA table](https://www.servicenow.com/docs/r/it-service-management/service-level-management/r_TaskSLATable.html): lưu mốc bắt đầu/kết thúc, thời gian trôi qua, thời gian làm việc và thời gian còn lại trên từng task.

## Master Handoff Prompt

Sao chép toàn bộ phần trong khung bên dưới để giao việc cho coding agent.

```text
Bạn là kiến trúc sư Service Level Management và kỹ sư phần mềm cấp cao. Hãy nghiên cứu codebase, thiết kế và tích hợp năng lực đo lường SLA cho VNG Support. Thiết kế phải chạy được với Helpdesk IT hiện tại và mở rộng bằng cấu hình cho các phòng ban/dịch vụ khác, không phải viết lại logic cho từng phòng ban.

## Mục tiêu

Đưa các cam kết thời gian phục vụ vào cùng luồng yêu cầu, bàn giao, xử lý và audit hiện có. Hệ thống phải cho biết:
- yêu cầu nào đang trong hạn, sắp đến hạn hoặc quá hạn;
- đồng hồ nào đang chạy, đã tạm dừng hay hoàn tất;
- ai là nhóm/đội chịu trách nhiệm;
- vì sao một mục tiêu được áp dụng, tạm dừng, đổi mức hoặc không thể tính;
- mức phục vụ thực tế có đáp ứng mục tiêu đã được phê duyệt hay chưa.

Tách rõ bốn khái niệm trong thiết kế và giao diện:
- SLI: phép đo thực tế;
- SLO: mục tiêu nội bộ để theo dõi và hiệu chỉnh;
- SLA: cam kết được phê duyệt với người dùng;
- OLA: mục tiêu bàn giao giữa các đội nội bộ để hỗ trợ SLA.

Không gắn nhãn SLA cho độ trễ của model, retrieval, cache hay API. Đó là telemetry kỹ thuật. SLA Helpdesk đo thời gian của sự kiện nghiệp vụ trên yêu cầu hỗ trợ.

## Trước khi thay đổi code

1. Kiểm tra trạng thái Git và thay đổi có sẵn. Giữ nguyên công việc chưa commit trong checkout.
2. Đọc các hướng dẫn bắt buộc của repository: `DOCRELAY_MLAI2026/AGENTS.md`, `README.md`, `RUNBOOK.md`, `mlai26_new/PROJECT-MEMORY.md` và `mlai26_new/AGENTS.md`.
3. Truy vết luồng hiện hành qua contracts, policy source, intake, conversation/handoff, review, incident grouping, repository, audit, telemetry và màn hình requester/reviewer. Tìm tests, fixtures, migration và các cách đọc/ghi document đã có trước khi chọn kiến trúc.
4. Đối chiếu mọi mô tả dưới đây với code và tài liệu đang có. Nếu khác, ghi nhận sự khác nhau và dùng hiện trạng trong code làm căn cứ.
5. Đọc nguồn kỹ thuật chính thức về SLI/SLO/SLA và cơ chế lịch, điều kiện bắt đầu/tạm dừng/kết thúc. Phân biệt nguyên tắc chung với hành vi riêng của một sản phẩm.

## Bối cảnh VNG Support cần giữ

- Đây là trợ lý Helpdesk IT: tiếp nhận yêu cầu, hướng dẫn an toàn, hỏi thêm thông tin và chuyển nhân viên hỗ trợ cùng lịch sử.
- Policy quyết định ROUTINE, MISSING_INFO, BEYOND_AUTHORITY và SECURITY_RISK theo rule xác định, có phiên bản. SLA chỉ quản lý thời hạn phục vụ; không sửa ý nghĩa policy.
- Quy tắc `HANDOFF-002` chuyển người khi có lượt báo vấn đề chưa được giải quyết theo điều kiện trong code. Sentiment tự nó không đổi ưu tiên.
- Ticket có trạng thái, thời điểm tạo/cập nhật, team được giao, feedback, assistance và audit. Sự cố chung có nhóm theo điều kiện/cửa sổ thời gian riêng; mỗi yêu cầu vẫn có mã và lịch sử riêng.
- Theo dõi người gửi đang dùng trạng thái trong app/polling. Không giả định email, push, ITSM hoặc thông báo ngoài app đã tích hợp.
- Project README mô tả policy và quyền là cơ chế demo/challenge, chưa phải SLA hay policy chính thức của VNG. Dữ liệu người dùng trong ví dụ là giả lập.
- Form hiện có nhóm phòng ban người gửi. Phiên khách có thể mang phòng ban hiển thị chưa xác minh, không phải danh tính hay quyền.
- `requesterDepartment` là đơn vị công tác của người gửi. `serviceOwner`, `supportTeam` hoặc khái niệm tương đương là đội chịu trách nhiệm xử lý. Không dùng hai khái niệm thay thế nhau.
- Không đưa giá trị SLA mẫu từ Atlassian, ServiceNow, tài liệu trực tuyến hoặc benchmark vào production config như cam kết VNG.

## Phạm vi nghiệp vụ cần thiết kế

Xác định và mô tả chính xác từng metric cần dùng. Xem xét tối thiểu:
1. Thời gian đến phản hồi đầu tiên có ý nghĩa từ nhân viên hỗ trợ.
2. Thời gian đến khi team nhận/accept một ticket đã bàn giao, nếu luồng ghi được sự kiện đó.
3. Thời gian giải quyết sự cố hoặc hoàn tất service request, với tiêu chí kết thúc phù hợp loại công việc.
4. Thời gian chờ người gửi bổ sung thông tin và thời gian chờ phê duyệt/vendor/team khác, nếu cần đo riêng để nhìn thấy điểm nghẽn.

Không gộp “khôi phục dịch vụ” với “hoàn tất yêu cầu” nếu chúng là các kết quả nghiệp vụ khác nhau. Chỉ thêm metric khi có sự kiện nguồn đáng tin cậy, người chịu trách nhiệm và hành động phù hợp khi trượt mục tiêu.

Định nghĩa rõ cho từng metric:
- đối tượng áp dụng và loại request/service;
- sự kiện server-side bắt đầu, hoàn tất, hủy, tạm dừng và tiếp tục;
- phản hồi nào được tính; AI auto-reply không tính là phản hồi của người nếu SLA được định nghĩa là human response;
- lịch làm việc, múi giờ, ngày nghỉ và quy tắc ngoài giờ;
- điều kiện tạm dừng, lý do được phép, ai được ghi nhận và audit ra sao;
- xử lý chuyển team, đổi ưu tiên, đổi lịch, ticket reopen, duplicate, ticket liên kết với sự cố chung;
- người/nhóm nhận cảnh báo trước hạn và sau hạn;
- cách tính mẫu số, ngoại lệ, tỷ lệ đạt và cửa sổ báo cáo.

Không dừng đồng hồ im lặng. Việc chờ nội bộ, duyệt, vendor hoặc bàn giao phải còn nhìn thấy trên báo cáo. Nếu được phép tạm dừng SLA bên ngoài, hãy đề xuất OLA/metric nội bộ riêng để giữ trách nhiệm của các đội. Mọi ngoại lệ phải có quy tắc được phê duyệt và sự kiện audit.

## Thiết kế có thể mở rộng

Tạo một mô hình chung và các cấu hình dữ liệu riêng:
- định nghĩa metric và SLA policy có ID ổn định, phiên bản, effective date, owner, trạng thái DRAFT/SHADOW/ACTIVE/RETIRED hoặc enum phù hợp;
- phạm vi cấu hình có thể xét tổ chức, service owner, service/request type, priority, requester segment và lịch làm việc;
- lưu snapshot policy/version/target đã áp dụng cùng từng SLA clock để giải thích và tính lại lịch sử;
- cho phép giá trị mặc định toàn tổ chức cùng override theo service/đội/phòng ban có thứ tự khớp rõ ràng; conflict hoặc thiếu cấu hình phải hiện `UNCONFIGURED`/trạng thái an toàn, không tự đoán;
- phân biệt `requesterDepartment` với `serviceOwnerDepartment` và `serviceId`; department label không phải khóa quyền;
- giữ phần lõi độc lập với tên phòng ban và chỉ thêm phòng ban mới qua catalog/config có validation, owner và quyền quản trị;
- áp dụng cấu hình deterministic, không để model tự đặt priority, deadline, calendar, pause reason hoặc trạng thái SLA;
- dùng server time UTC và lịch/zone cấu hình được; client chỉ định dạng để hiển thị;
- thiết kế để cập nhật đồng thời và retry/idempotency không tạo hai lần pause/resume/breach hoặc làm mất audit;
- không gán thời điểm lịch sử cho ticket cũ nếu event không tồn tại; không thay đổi kết quả SLA đã hoàn tất khi policy mới được ban hành.

Hãy đánh giá khả năng lưu SLA instance/cycles như dữ liệu nghiệp vụ có audit thay vì suy ra trạng thái chỉ từ status hiện tại. Giữ giải pháp nhỏ, dễ giải thích, tương thích storage hiện hành và quy tắc đơn giản của repo. Tránh tạo framework tổng quát quá mức hoặc hard-code nhánh `if departmentName`.

## An toàn và quyền

- Quá hạn tạo sự kiện vận hành: cảnh báo, chuyển cấp hoặc hiển thị trong queue. Nó không được tự đổi quyết định policy, tự phê duyệt quyền, bỏ qua approval/security gate, đóng ticket hoặc đánh dấu đã xử lý.
- Giữ nguyên thứ tự ưu tiên rủi ro hiện tại và audit/version guards.
- Sentiment, câu chữ khẩn cấp hoặc việc người gửi thuộc một phòng ban không tự quyết định quyền hay priority. Priority phải dựa trên impact/urgency theo quy tắc được owner phê duyệt.
- Không ghi raw secrets hoặc nội dung nhạy cảm vào telemetry SLA. Ghi IDs, timestamps, metric, config version, actor/team và lý do đã redact theo mẫu audit hiện hữu.
- UI public/demo không được trình bày target DRAFT/SHADOW hoặc mục tiêu chưa phê duyệt như cam kết VNG. Không tiết lộ OLA nội bộ cho người gửi nếu không được cho phép.
- Chỉ thêm thông báo qua kênh đã được tích hợp và cho phép. Trước mắt hãy làm trong app/queue nếu đó là năng lực hiện có.
- Không đọc, ghi hoặc migration dữ liệu Production; không deploy hoặc đổi cấu hình môi trường như một phần của công việc này.

## Mục tiêu và triển khai theo giai đoạn

Không tự chọn SLA target time, priority matrix, giờ trực, ngoại lệ, tỷ lệ đạt, owner, hay hậu quả khi breach. Chủ sở hữu nghiệp vụ phải xác nhận các giá trị đó.

Nếu chưa có xác nhận:
1. Thiết kế schema để chứa target và calendar đã được phê duyệt nhưng để config ở DRAFT/UNCONFIGURED.
2. Tạo chế độ SHADOW để ghi nhận event và elapsed business time trên ticket mới mà không hiển thị lời hứa với người gửi, không gửi thông báo và không thay status.
3. Báo cáo dữ liệu thiếu, số lượng mẫu, độ tin cậy của đo lường và các câu hỏi cần owner trả lời.
4. Đề xuất pilot ở Helpdesk IT cho một số metric có nguồn sự kiện rõ. Sau khi có đủ dữ liệu và owner duyệt, cấu hình các mục tiêu; sau đó mở rộng qua catalog và config cho phòng ban tiếp theo.
5. Cho phép mỗi dịch vụ có tiêu chí kết thúc khác nhau nhưng dùng chung cách lưu, tính giờ, audit, cảnh báo và báo cáo.

Không gọi benchmark nhỏ hoặc vài ticket thử nghiệm là bằng chứng đạt SLA. Phân biệt thời gian hệ thống, thời gian AI và thời gian nghiệp vụ. Với số mẫu ít, hiển thị số lượng và giới hạn kết luận; không bịa p90/p95.

## Cách làm và đầu ra

Tiến hành xuyên suốt, không dừng ở một bản kế hoạch:
1. Audit code/data flow và liệt kê hiện trạng, thiếu hụt, rủi ro tương thích.
2. Viết hợp đồng nghiệp vụ tối thiểu cho mỗi metric và bảng quyết định: event, timer, pause, owner, audience, audit, trường hợp ngoại lệ.
3. Thiết kế mô hình/config dùng chung, thứ tự override và chiến lược migration. Ghi rõ quyết định chưa được phép chốt.
4. Triển khai phần generic SLA và cấu hình SHADOW trong repo theo AGENTS.md, giữ nguyên policy, quyền, fixtures và hành vi hỗ trợ hiện hành.
5. Cập nhật màn hình thích hợp để reviewer thấy trạng thái clock, thời gian còn lại/quá hạn, target version, lý do pause và owner; người gửi chỉ thấy thông tin được phép.
6. Cập nhật tài liệu vận hành, chính sách và hướng dẫn thêm service owner/phòng ban mới. Ghi công việc đã làm, căn cứ, các giá trị cần người sở hữu duyệt và giới hạn demo.
7. Chạy các kiểm tra cần thiết theo quy tắc repository. Ghi base, scope, diff và kết quả kiểm tra; giữ nguyên dữ liệu/công việc có sẵn. Tuân thủ hướng dẫn Git của repository; không deploy.

## Điều kiện nghiệm thu

- Có thể thêm service/phòng ban mới bằng cấu hình và owner phù hợp mà không thêm nhánh code theo tên phòng ban.
- Mỗi clock có định nghĩa event start/pause/resume/stop và phép tính lịch xác định, hiển thị được lý do.
- Team/owner chịu trách nhiệm được phân biệt với phòng ban người gửi.
- Chuyển team, đổi ưu tiên, pause/resume, reopen và ticket sự cố chung không xóa hoặc reset thời gian một cách âm thầm.
- Cảnh báo breach không cấp quyền, đổi policy bucket hay tự hoàn tất ticket.
- Event đã lưu đủ để giải thích target/version/elapsed/breach và báo cáo tỷ lệ đạt theo mẫu số minh bạch.
- Cấu hình chưa được owner phê duyệt vẫn ở DRAFT/SHADOW/UNCONFIGURED và không xuất hiện như lời hứa chính thức.
- Ticket cũ không nhận dữ liệu SLA được bịa hoặc hồi tố.
- README/tài liệu nói chính xác những gì chạy trong demo, cấu hình nào còn chờ duyệt, và kênh thông báo nào chưa có.
```

## Tài liệu dự án liên quan

- [Policy source](../src/domain/policy-source.ts) — phiên bản policy và rule dữ liệu.
- [Architecture](ARCHITECTURE.md) — luồng xử lý, telemetry kỹ thuật, storage và phân quyền hiển thị.
- [Interaction handoff](INTERACTION-HANDOFF.md) — quy tắc chuyển người và ranh giới với sentiment/priority.
- [Batch Support contract](BATCH-SUPPORT-CONTRACT.md) — nhóm sự cố, phiên khách, polling và giới hạn demo.
- [Department validation](DEPARTMENTS-LUNA-PRODUCTION-2026-10-17.md) — danh mục phòng ban demo và giới hạn số liệu quan sát.
- [Project README](../README.md) — phạm vi demo và cảnh báo policy chưa chính thức.
