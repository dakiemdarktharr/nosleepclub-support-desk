# VNG Support

Trợ lý hỗ trợ IT giúp người dùng mô tả vấn đề, nhận hướng dẫn an toàn, bổ sung thông tin và chuyển nhân viên hỗ trợ cùng lịch sử hội thoại.

**[Mở ứng dụng](https://vng-support.vercel.app)** · **[Gửi hỗ trợ](https://vng-support.vercel.app/guest)** · **[Hướng dẫn sử dụng](docs/USAGE.md)** · **[Vận hành](RUNBOOK.md)** · **[Kiến trúc](docs/ARCHITECTURE.md)**

Dự án thuộc **MLAI Hackathon 2026 — The Escalation Referee**. Phiên bản trình diễn dùng đăng nhập bằng ID và reviewer công khai để trải nghiệm nhanh. Policy và quyền là cơ chế mô phỏng của dự án, chưa phải quy định chính thức của VNG; app không tự thực thi thay đổi IAM, cloud hoặc database bên ngoài.

## Bắt đầu

| Vai trò | Thao tác |
| --- | --- |
| Người cần hỗ trợ | Chọn **Đăng nhập không cần tài khoản** để dùng ngay; hoặc **Tôi cần hỗ trợ** để đăng nhập bằng ID đã cấp. |
| Nhân viên mới | Chọn **Nhân viên mới?**, gửi đơn cấp ID và lưu liên kết theo dõi riêng. |
| Nhân viên hỗ trợ | Chọn **Dành cho Admin → Yêu cầu cần xử lý** để xem hàng đợi và xử lý hồ sơ. |
| Người trình diễn | Chọn **Dành cho Admin → Kiểm thử** để chạy tình huống hoặc nhập câu hỏi mới. |

1. Mô tả vấn đề bằng lời hoặc chọn theo danh mục.
2. Xem lại nội dung đã hiểu, hướng dẫn hoặc câu hỏi bổ sung. Bản xem trước chưa tạo hồ sơ.
3. Xác nhận gửi để lưu yêu cầu, hỏi tiếp và phản hồi kết quả.
4. Giữ liên kết hoặc mã đầy đủ để theo dõi. Mã ngắn `HT-…` giúp nhân viên tìm hồ sơ.

## Giao diện và chuyển động

Nút phản hồi khi hover/nhấn; ba lựa chọn trên trang đầu mở trang bằng hiệu ứng đường sáng từ giữa. Bấm logo **VNG Support** ở trang bất kỳ để về trang đầu qua hiệu ứng rèm cam. Skeleton shimmer xuất hiện trong lúc tải trang/dữ liệu; khung **VNG Support AI** có thanh chờ khi phân tích hoặc trả lời tiếp.

Thanh chờ không hiển thị phần trăm hay thời gian hoàn tất giả. Chuyển động dùng màu cam VNG `#F05A22`, giữ Nunito, hỗ trợ bàn phím/touch và `prefers-reduced-motion`; không trì hoãn lời gọi API để trình diễn hiệu ứng. Nếu mạng treo quá 60 giây, app báo chưa nhận được xác nhận và giữ nội dung để kiểm tra trạng thái hoặc thử lại.

Ảnh dưới chụp từ bản chạy local với dữ liệu giả lập và provider mock. Đây là minh họa giao diện, không phải bằng chứng inference AI thật hoặc phản hồi người dùng.

[![Trang đầu: ba lựa chọn hỗ trợ, Admin và không cần tài khoản](docs/images/motion-home-desktop.png)](docs/images/motion-home-desktop.png)

| Khung chờ AI | Trang đầu trên điện thoại |
| --- | --- |
| ![Thanh chờ trong khung VNG Support AI, không có phần trăm giả](docs/images/motion-ai-pending.png) | ![Ba lựa chọn và logo về trang đầu trên màn hình mobile](docs/images/motion-home-mobile.png) |

[Chi tiết hiệu ứng, nguồn tham khảo và kiểm thử](docs/UI-MOTION.md).

## ID demo

Có **41 ID đang hoạt động**: 1 tài khoản IT và 40 tài khoản nhân viên bên dưới. Tất cả tên, vị trí và đích tài nguyên trong bộ này là **dữ liệu giả lập**, không phải danh sách nhân sự VNG.

**Đăng nhập:** mở [Đăng nhập](https://vng-support.vercel.app/login), nhập ID rồi bấm **Đăng nhập**; bản demo không yêu cầu mật khẩu hoặc OTP. IT mở màn hình cấp ID; tài khoản nhân viên mở màn hình gửi hỗ trợ và tự điền ID từ phiên.

### Tài khoản IT

| ID | Vai trò | Màn hình sau khi đăng nhập |
| --- | --- | --- |
| `itnvgl` | IT — quản lý cấp ID (`identity-admin`) | Cấp ID nhân viên (`/identity/review`) |

### 40 tài khoản nhân viên

Bộ tài khoản đã được kiểm tra trên Production ngày 15/10/2026: đăng nhập, phiên, phạm vi job, chặn đích/môi trường khác, chặn quyền quản lý ID và đăng xuất.

| ID | Họ tên giả lập | Vị trí công việc | Môi trường | Phạm vi job |
| --- | --- | --- | --- | --- |
| `binhpqt` | Phạm Quốc Thiên Bình | Kỹ sư Frontend | Sandbox | Sửa repository · `demo/binhpqt` |
| `tuannha` | Nguyễn Hoàng Anh Tuấn | Kỹ sư Backend | Staging | Đọc repository · `demo/tuannha` |
| `khangtmd` | Trần Minh Đức Khang | Kỹ sư DevOps | Sandbox | Tạo cloud · `demo/khangtmd` |
| `namlth` | Lê Thanh Hải Nam | Kỹ sư độ tin cậy SRE | Production | Đọc log · `demo/namlth` |
| `anvnm` | Võ Nhật Minh An | Chuyên viên kiểm thử thủ công | Staging | Sửa task / dự án · `demo/anvnm` |
| `longdgb` | Đặng Gia Bảo Long | Kỹ sư kiểm thử tự động | Sandbox | Sửa repository · `demo/longdgb` |
| `phucbqt` | Bùi Quốc Thiên Phúc | Kỹ sư dữ liệu | Staging | Đọc database · `demo/phucbqt` |
| `tridhm` | Đỗ Hoàng Minh Trí | Quản trị cơ sở dữ liệu | Production | Sửa database · `demo/tridhm` |
| `linhhtn` | Hồ Thanh Ngọc Linh | Thiết kế UI UX | Sandbox | Sửa task / dự án · `demo/linhhtn` |
| `anhntm` | Ngô Thị Mai Anh | Product Owner | Staging | Tạo task / dự án · `demo/anhntm` |
| `chaudhb` | Dương Hải Bảo Châu | Chuyên viên phân tích nghiệp vụ | Sandbox | Đọc task / dự án · `demo/chaudhb` |
| `ngocvtm` | Vũ Trần Minh Ngọc | Chuyên viên phân tích bảo mật | Production | Đọc log · `demo/ngocvtm` |
| `vyptk` | Phan Thị Khánh Vy | Nhân viên hỗ trợ IT | Sandbox | Đọc cấu hình · `demo/vyptk` |
| `huymqb` | Mai Quốc Bảo Huy | Trưởng nhóm Helpdesk | Staging | Sửa task / dự án · `demo/huymqb` |
| `quancmn` | Cao Minh Nhật Quân | Kỹ sư mạng | Sandbox | Sửa cấu hình · `demo/quancmn` |
| `datlgm` | Lý Gia Minh Đạt | Quản trị cấu hình mạng | Production | Điều chỉnh cấu hình · `demo/datlgm` |
| `baothg` | Tạ Hoàng Gia Bảo | Kỹ sư Android | Staging | Sửa repository · `demo/baothg` |
| `thaodtp` | Đinh Thanh Phương Thảo | Kỹ sư iOS | Sandbox | Sửa repository · `demo/thaodtp` |
| `tamcnm` | Chu Ngọc Minh Tâm | Kỹ sư ứng dụng web | Staging | Đọc repository · `demo/tamcnm` |
| `dunghqa` | Hà Quốc Anh Dũng | Điều phối phát hành | Production | Tạo repository · `demo/dunghqa` |
| `diepltn` | Lâm Thị Ngọc Diệp | Nhà khoa học dữ liệu | Sandbox | Đọc database · `demo/diepltn` |
| `sontmt` | Tô Minh Thanh Sơn | Kỹ sư Machine Learning | Staging | Tạo cloud · `demo/sontmt` |
| `nguyentgk` | Trịnh Gia Khánh Nguyên | Kỹ sư MLOps | Sandbox | Sửa cloud · `demo/nguyentgk` |
| `hanhntm` | Nguyễn Trúc Minh Hạnh | Chuyên viên rà soát AI | Production | Phê duyệt task / dự án · `demo/hanhntm` |
| `hanthg` | Trần Hoàng Gia Hân | Chuyên viên tài liệu kỹ thuật | Staging | Sửa task / dự án · `demo/hanthg` |
| `khoilqm` | Lê Quốc Minh Khôi | Kỹ sư tích hợp hệ thống | Sandbox | Sửa repository · `demo/khoilqm` |
| `nganptb` | Phạm Thị Bảo Ngân | Chuyên viên phân tích vận hành | Staging | Đọc log · `demo/nganptb` |
| `chauvtm` | Võ Thanh Minh Châu | Chuyên viên phân tích tài chính | Production | Đọc database · `demo/chauvtm` |
| `uyendnp` | Đặng Ngọc Phương Uyên | Chuyên viên hệ thống nhân sự | Sandbox | Đọc task / dự án · `demo/uyendnp` |
| `vinhbmq` | Bùi Minh Quang Vinh | Điều phối tài sản IT | Staging | Tạo task / dự án · `demo/vinhbmq` |
| `hadtt` | Đỗ Thị Thanh Hà | Chuyên viên mua sắm thiết bị | Sandbox | Sửa task / dự án · `demo/hadtt` |
| `minhhgn` | Hồ Gia Nhật Minh | Điều phối sự cố | Production | Sửa task / dự án · `demo/minhhgn` |
| `lamnhp` | Ngô Hoàng Phúc Lâm | Kỹ sư dữ liệu kiểm thử | Staging | Tạo database · `demo/lamnhp` |
| `quyendtt` | Dương Thị Tú Quyên | Chuyên viên kiểm thử accessibility | Sandbox | Đọc task / dự án · `demo/quyendtt` |
| `hieuvqm` | Vũ Quốc Minh Hiếu | Kỹ sư kiểm thử hiệu năng | Staging | Đọc log · `demo/hieuvqm` |
| `trucpnt` | Phan Ngọc Thanh Trúc | Chuyên viên tuân thủ | Staging | Đọc task / dự án · `demo/trucpnt` |
| `thanhmhd` | Mai Hoàng Đức Thành | Nhân viên sao lưu dữ liệu | Sandbox | Xuất dữ liệu database · `demo/thanhmhd` |
| `nhungcth` | Cao Thị Hồng Nhung | Chuyên viên quản lý secrets | Staging | Đọc secrets · `demo/nhungcth` |
| `kietlmq` | Lý Minh Quang Kiệt | Chuyên viên quản lý khóa mã hóa | Sandbox | Luân chuyển khóa mã hóa · `demo/kietlmq` |
| `trangtnd` | Tạ Ngọc Diệu Trang | Chuyên viên kiểm toán hệ thống | Staging | Đọc log · `demo/trangtnd` |

Mỗi ID có profile riêng và chỉ đúng đích `demo/<id>`. Phạm vi job vẫn phải qua policy: **29** trường hợp ít rủi ro được phép trong phạm vi; **9** trường hợp cần thẩm quyền riêng; **2** trường hợp secrets/khóa mã hóa bị chặn do rủi ro bảo mật. Nhãn môi trường Production dùng để thử chính sách; app không thực thi IAM, cloud hoặc database bên ngoài. Các tài khoản nhân viên không có role `identity-admin`.

[Manifest JSON của 40 ID](data/demo-identities.json) · [Hướng dẫn nhập có kiểm soát](RUNBOOK.md#bộ-40-id-demo). Người chưa có ID vẫn dùng được [chế độ khách](https://vng-support.vercel.app/guest).

## Chức năng

### Dành cho người gửi

- **Gửi linh hoạt:** mô tả tự do, chọn danh mục hoặc sử dụng không cần tài khoản.
- **Hướng dẫn theo tình huống:** máy tính, máy in, VPN, phần mềm và các vấn đề hỗ trợ thông thường.
- **Hỏi đáp có nguồn:** giải thích khái niệm và hướng dẫn dựa trên kho tri thức; hiển thị nguồn tham khảo khi có.
- **Làm rõ yêu cầu:** hỏi thông tin còn thiếu, phân biệt các thao tác dễ nhầm như restart và khôi phục cài đặt gốc.
- **Hội thoại tiếp nối:** hỏi thêm về một bước, báo đã giải quyết hoặc yêu cầu gặp nhân viên.
- **Theo dõi:** trạng thái dễ hiểu, tiến trình xử lý và lịch sử hướng dẫn được giữ khi chuyển hỗ trợ.
- **Trải nghiệm desktop/mobile:** điều hướng bàn phím, trạng thái chờ, giữ nội dung khi lỗi, URL/QR và hỗ trợ giảm chuyển động.

Màn hình người gửi tập trung vào vấn đề và bước tiếp theo. Sentiment, rule, evidence kỹ thuật, kiểm tra an toàn nội bộ, expected result và giải thích audit được trình bày trong không gian nhân viên hỗ trợ.

### Dành cho nhân viên hỗ trợ

- Hàng đợi có tìm kiếm, phân trang, bộ lọc trạng thái, nhóm tiếp nhận và mã nhân viên.
- Hồ sơ gồm nội dung gốc, dữ kiện, thông tin còn thiếu, lý do chuyển tiếp và hướng dẫn đã gửi.
- Phân tích cảm xúc khi tiếp nhận và trong phản hồi được lưu để tham khảo; hồ sơ cũ không có dữ liệu sẽ ghi rõ chưa lưu.
- Audit chi tiết ghi actor, thời gian, chuyển trạng thái, rule, evidence và phiên bản policy.
- Hỏi bổ sung, duyệt, từ chối, dừng hoặc ghi nhận hoàn tất trong giới hạn workflow; server kiểm tra version để tránh ghi đè giữa các tab.
- Gợi ý tri thức được đưa vào hàng chờ rà soát, không tự xuất bản thành nguồn trả lời.

### ID nhân viên và trình diễn

- Đăng nhập bằng ID đã cấp còn hiệu lực, không yêu cầu mật khẩu trong chế độ demo.
- Gửi và theo dõi đơn cấp ID; job/profile có phiên bản và phạm vi quyền cụ thể.
- IT được gán vai trò có thể duyệt đơn và xử lý trùng ID.
- Sổ quyền/quota DEMO-SANDBOX minh họa quy trình xin và duyệt quyền; không cấp tài nguyên thật.
- Verify hỗ trợ các bộ tình huống, input mới, đọc lại hồ sơ và đối chiếu audit. Kết quả mô phỏng được phân biệt với lời gọi AI thật.

## Workflow hỗ trợ

Các sơ đồ dưới đây được dựng từ Mermaid thành SVG để giữ đầy đủ dấu tiếng Việt và nhãn nhiều dòng trên GitHub. Bấm vào sơ đồ để mở bản đầy đủ; nguồn Mermaid được liên kết ngay bên dưới mỗi sơ đồ.

### 1. Tiếp nhận, xem trước và lưu yêu cầu

[![Workflow tiếp nhận: nhập vấn đề, áp policy, xem trước, xác nhận và lưu hồ sơ](docs/diagrams/support-intake.svg)](docs/diagrams/support-intake.svg)

[Nguồn Mermaid](docs/diagrams/support-intake.mmd). Xem trước chỉ lưu kết quả tạm có hạn dùng. Khi xác nhận, server đối chiếu fingerprint, thời hạn và phiên bản policy; preview không còn phù hợp phải được phân tích lại trước khi lưu ticket.

### 2. Hỏi tiếp, phản hồi và bàn giao nhân viên

[![Workflow tiếp nối: hỏi bổ sung, xác nhận kết quả, chuyển người và cập nhật hồ sơ](docs/diagrams/support-followup.svg)](docs/diagrams/support-followup.svg)

[Nguồn Mermaid](docs/diagrams/support-followup.mmd). Lượt hỏi mới vẫn đi qua kiểm tra policy. Giải thích một bước và phản hồi cảm xúc không tự xác nhận đã giải quyết. Nhân viên có thể hỏi bổ sung, duyệt, từ chối, dừng hoặc ghi nhận hoàn tất theo trạng thái được phép; duyệt yêu cầu không bắt buộc nhập lý do, các quyết định khác vẫn cần lý do và mọi thao tác phải đúng version. Nhánh Security risk không được approve/fulfill trong demo.

### 3. AI, bằng chứng và quyết định an toàn

[![Workflow phân tích: kiểm tra input, định tuyến server hoặc LLM, kiểm chứng bằng chứng và áp policy](docs/diagrams/ai-policy.svg)](docs/diagrams/ai-policy.svg)

[Nguồn Mermaid](docs/diagrams/ai-policy.mmd). Schema hoặc evidence sai không tạo ra phê duyệt. Dự phòng chỉ được dùng khi server tự xác định đủ căn cứ an toàn; không dùng fallback để vượt policy. [Workflow tạo câu trả lời, retrieval và cache](docs/ARCHITECTURE.md#câu-trả-lời-và-độ-trễ).

Model hỗ trợ hiểu ngôn ngữ và soạn câu trả lời; **server quyết định policy, quyền và giới hạn an toàn**. Cảm xúc không cấp quyền, thay đổi ưu tiên hoặc tự xác nhận đã giải quyết. Khi AI không sẵn sàng, app chỉ dùng hướng dẫn dự phòng đã được duyệt cho tình huống đủ căn cứ; trường hợp còn lại hỏi rõ hoặc chuyển hỗ trợ.

Retrieval dùng BM25 và kho tri thức có nguồn/revision. Hướng dẫn server đã đủ đáp ứng câu hỏi được tái sử dụng để tránh lượt diễn đạt AI dư thừa. Cache câu trả lời hợp lệ gắn phiên bản; preview có hạn sử dụng. Không bỏ kiểm tra an toàn để giảm thời gian phản hồi.

## Chạy local

Yêu cầu Node.js **22.13+** và npm. Chạy tại thư mục gốc của repo:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Chỉ sao chép file mẫu khi chưa có `.env.local`; không ghi đè cấu hình đang dùng. Mở `http://localhost:3000`. Mặc định mẫu dùng AI mock và bộ nhớ demo, không cần key thật.

| Cấu hình | Mục đích |
| --- | --- |
| `AI_PROVIDER`, `AI_MODEL` | Chọn mock hoặc OpenAI và model; mẫu model là `gpt-6-luna`. |
| `OPENAI_API_KEY` | Key riêng khi dùng OpenAI; chỉ lưu trong môi trường bảo mật. |
| `MONGODB_URI`, `MONGODB_DB` | Lưu hồ sơ Support, tri thức và dữ liệu ứng dụng. |
| `IDENTITY_MONGODB_URI`, `IDENTITY_MONGODB_DB` | Lưu identity; có thể dùng cùng cluster/database `vng_main` với collection riêng. Identity cần MongoDB hỗ trợ transaction. |
| `SUPPORT_ACCESS_MODE` | `public-demo` cho bản trình diễn reviewer công khai. |

Không commit `.env.local`, credentials hoặc dữ liệu người dùng. [Chi tiết cấu hình, bootstrap và bảo trì](RUNBOOK.md).

## Cấu trúc repo

| Thư mục | Nội dung |
| --- | --- |
| `src/app` | Trang Next.js và API routes. |
| `src/components` | Giao diện người gửi, hỗ trợ và identity. |
| `src/domain` | Kiểu dữ liệu, policy, validation, tri thức và quy tắc nghiệp vụ. |
| `src/services` | Tiếp nhận, hội thoại, review và identity. |
| `src/lib` | Model, MongoDB, retrieval, cache và các adapter. |
| `tests` | Unit, integration và kiểm thử giao diện desktop/mobile. |
| `scripts` | Kiểm tra, đo đạc và công cụ vận hành có opt-in. |
| `docs` | Tài liệu sử dụng, kiến trúc, dữ liệu và các quyết định còn áp dụng. |
| `mlai26_new/data` | Dataset và policy lịch sử để hồi quy; không phải ứng dụng thứ hai. |

```powershell
npm run check:docs
npm run lint
npm run typecheck
npm test
npm run build
```

Hướng dẫn E2E, dịch vụ thật, đối chiếu SHA triển khai và kiểm tra dependency nằm trong [RUNBOOK](RUNBOOK.md). Prompt bàn giao và báo cáo triển khai đã hết vai trò được giữ trong lịch sử Git.

## Phạm vi phiên bản hiện tại

Bản public được giữ mở để quay video và trình diễn nhanh. Đăng nhập bằng ID và reviewer công khai là lựa chọn cho demo, không xác minh danh tính như SSO. Handoff hiện được ghi nhận trong app; tích hợp thông báo, ITSM/IAM và xử lý tài nguyên thật cần cấu hình riêng trước khi dùng với dữ liệu doanh nghiệp.

[Hướng dẫn sử dụng](docs/USAGE.md) · [Bản đồ kiến trúc](docs/ARCHITECTURE.md) · [Riêng tư](docs/PRIVACY-INVENTORY.md) · [Tài liệu kỹ thuật](docs/README.md)
