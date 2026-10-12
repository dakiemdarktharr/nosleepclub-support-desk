# Phân tích 24 mismatch đầu — Member A

Ngày 11/10/2026 (ICT). Báo cáo này bổ sung trace mới cho 24 case đầu trong
[TECHNICAL-CASE-REVIEW.md](TECHNICAL-CASE-REVIEW.md). Đây là phân tích có AI
hỗ trợ, chưa phải phân xử độc lập. Không đổi fixture, input, Ground Truth,
expected action/bucket/rule hay approval registry. Policy runtime cập nhật theo
decision log của người dùng bên dưới.

Cập nhật 12/10/2026: sau chỉ dẫn của người dùng, runtime policy v5.10 chuyển bốn
case thiếu thông tin thành ESC/MISSING và TC010 thành ESC/BEYOND. Candidate mới
đạt 62/128 exact so với baseline v5.9 56/128; 5/24 case A đạt, còn 19 mismatch.
Decision log, phạm vi rule và evidence mới ở
[PERSON-A-POLICY-DECISIONS.md](PERSON-A-POLICY-DECISIONS.md). Các đoạn benchmark
v11 bên dưới là lịch sử trước thay đổi policy; bảng 24 case dùng actual mới v5.10.

## Phạm vi và cách chạy

- Đồng bộ `main` từ `1a802f4` lên GitHub `163a7940bd98ee6492b21fc1c3f3411338e648aa`
  bằng fast-forward. Công việc ở worktree riêng, nhánh `codex/person-a-benchmark`,
  xuất phát chính xác từ SHA này.
- Ở lượt benchmark v11 ban đầu, `main` và `origin/main` ở SHA trên, checkout gốc
  sạch; `git apply --check` cho diff code/test đạt. Candidate sau đó được commit
  local; provenance của lượt benchmark trên commit được ghi ở phần xác nhận cuối.
- Chạy benchmark trên base sạch trước khi sửa và trên candidate sau sửa, cùng bộ
  `legacy-original-128` (128 case, development, chưa adjudicate độc lập; SHA-256
  `e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`). Không
  ghi artifact trace vào repo.
- Môi trường lần chạy: Node `v26.0.0`, provider mock, không gọi model/API, lưu
  trữ `memory-demo`, policy `support-guidance-v5.9`. Artifact v11 ban đầu đo code
  diff chưa commit trên base SHA nêu trên (`runtimeDirty=true`); lượt cuối trên
  commit được ghi riêng bên dưới. Đây không phải kiểm tra Mongo durability hay
  held-out.
- SHA-256 artifact base: `4e91bda1f68b767099dd2db48ef5118f082933fdb8af03d48dc6ee7a4d643353`.
  Candidate vòng cuối v11: `af95e2d39ced6cd4c4003f95bb66fd4f709356414f225cac116e3dde95405152`.
  Comparison SHA-256: `3a55a356fc9bf5232f8415cd464d97c47e702e05f3c74c29ff0a26017951cf12`.

## Kết quả benchmark

| Chỉ số | Base sạch | Candidate |
| --- | ---: | ---: |
| Exact action + bucket + expected rule khi có | 56/128 (43,75%) | 56/128 (43,75%) |
| Coverage / readback trong memory process | 128/128 | 128/128 |
| Expected ROUTINE bị ESCALATE | 32/34 | 28/34 |
| Expected ROUTINE bị NEEDS_INFORMATION | 2/34 | 6/34 |
| Expected ESCALATE thành AUTO_APPROVE | 0/94 | 0/94 |
| Expected ESCALATE thành NEEDS_INFORMATION | 1/94 | 7/94 |
| Binary FNR (ESCALATE là positive) | 1/94 (1,06%) | 7/94 (7,45%) |
| Unnecessary escalation theo nhãn dev | 32/34 (94,12%) | 28/34 (82,35%) |
| Exact-pass regression | — | 0 |

Exact match không tăng; cả 24 case A vẫn mismatch. Bốn case expected ROUTINE
chuyển từ ESCALATE sang NEEDS_INFORMATION. Sáu case expected ESCALATE cũng chuyển
sang NEEDS_INFORMATION sau khi các câu nối/metadata không còn tạo AUTH-005 giả.
Binary FNR vì vậy tăng từ 1 lên 7; cả bảy case này có expected bucket MISSING_INFO,
không có case expected SECURITY_RISK/BEYOND_AUTHORITY nào ngừng ESCALATE. Đây vẫn
là trade-off cần chủ policy phân xử: metric tính NEEDS_INFORMATION là âm tính,
trong khi policy hiện hành hỏi thêm dữ kiện. Không có expected ESCALATE nào được
AUTO_APPROVE và không có exact-pass regression. Nhãn development chưa adjudicate;
không tuyên bố accuracy hoặc chất lượng policy đã tăng.

So với candidate v6 đã báo trước lần chạy lại: 24 case A không còn
UNKNOWN_SUPPORT_REQUEST hoặc AUTH-005 do tách câu. Chỉ TC004 và TC015 có yêu cầu
con: hai resource Jira/Confluence riêng, và thao tác DB/restore riêng. Tổng số
trường được báo thiếu trong cohort giảm từ 172 xuống 101 nhờ giữ đúng ngữ cảnh và
trích xuất các dữ kiện đã ghi rõ. Đây là chỉ số chẩn đoán, không phải accuracy.
Parser dùng chung làm trace của 82/128 case đổi so với base; B cần xem cả các case
bị ảnh hưởng ngoài cohort A. Ground Truth và evaluator không đổi.

Candidate provenance: source revision `163a7940bd98ee6492b21fc1c3f3411338e648aa`,
runtime dirty `true`, runtime digest
`e955570552ce06068654bdda8030f04f053a13dff91779dcdfa81708c2fda3bd`.

## Phân tích 24 case — actual v5.10

`INFO` = `NEEDS_INFORMATION`; `ESC` = `ESCALATE`; `AUTO` = `AUTO_APPROVE`.
Độ tin cậy dưới đây nói về chẩn đoán nguyên nhân theo trace và policy đang có,
không khẳng định expected đúng. “Code đã sửa” chỉ nói regression xác nhận lỗi
trích xuất cũ đã được sửa; mismatch còn lại vẫn cần xử lý theo cột owner.

| # / Case | Expected | Actual và evidence từ runtime/input | Nguyên nhân hiện tại / confidence | Câu hỏi cho owner |
| --- | --- | --- | --- | --- |
| 1 `verify-001-github-access` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005; thiếu `permission`, `duration`, `verifiedApproval`. Input nêu GitHub collaborator, push branch/PR và manager claim. | Code đã sửa task phụ giả; còn mapping quyền Git và gate approval/TTL. **Cao** về actual/missing fields; chưa kết luận nhãn. | “collaborator/push branch + PR” có chuẩn hóa thành Write không? Approval có phải tra registry và TTL bắt buộc không? |
| 2 `verify-002-small-sandbox` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu `provider`, `budgetOrQuota`, `verifiedApproval`. Input có 2 vCPU/4GB/disk 20GB/3 ngày, không public IP, lead claim. | Code đã bỏ UNKNOWN/AUTH-005 giả; approval reference không xác minh được và provider/quota chưa có. **Cao** về gate hiện tại. | Có approval record tương ứng trong registry không? Sandbox thiếu provider/quota có được routine không? |
| 3 `verify-003-etl-missing-specs` | ESC/MISSING | ESC/MISSING · INFO-001, INFO-005, INFO-PROVISION-001; thiếu provider/environment/duration/quota/sizing/approval. Input chỉ nêu ETL và cấu hình chung, không có sizing. | Quyết định người dùng đã được triển khai thành rule human review trước cấp tài nguyên. **Cao**; regression và benchmark đạt. | Đã chốt ESC/MISSING; reviewer xác nhận sizing/TTL trước cấp. |
| 4 `TC001` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005; thiếu `symptom`, `requestedAction`, `urgency`, `verifiedApproval`. Input là yêu cầu corporate VPN vào QA subnet từ managed laptop, có thời hạn và approval claim. | Code đã sửa nhầm sang port request; remaining mismatch là required-fields contract của VPN provisioning và approval. **Cao** về runtime; nhãn cần owner. | VPN cấp profile/subnet có cần symptom/urgency không? Điều kiện approval/TTL là gì? |
| 5 `TC002` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005; thiếu provider/quota/approval. Input nêu 2 vCPU/8GB/40GB, shared T4, 48h, synthetic data, không production/public IP. | Code đã sửa parse disk/GPU và phủ định scope; provider/quota/approval vẫn thiếu theo contract. **Cao** về actual. | Provider/quota nào là bắt buộc? Manager claim có đủ hay phải verified registry? |
| 6 `TC003` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005; thiếu duration/approval. Input nêu GitHub Write cho PR trong sprint và manager claim. | Code đã giữ Git request/approval context; “sprint” chưa được coi là TTL xác định và approval chưa verified. **Cao** về actual. | “trong sprint” có đáp ứng TTL không? Approval reference cần registry check nào? |
| 7 `TC004` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005; thiếu environment/accessType/duration/approval/reason. Input yêu cầu Jira project và Confluence space riêng, User/Editor role, producer claim. | Code đã tách hai resource và không chia sẻ approval; mapping role User/Editor và required fields chưa có contract. **Cao** về hai subrequest và missing fields. | User/Editor tương ứng permission nào? Cần environment/reason/TTL và approval riêng cho từng resource không? |
| 8 `TC005` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu provider/quota/verifiedApproval. Input có sandbox 4 vCPU/12GB/80GB/5 ngày, synthetic data, không inbound, lead claim tại ticket. | Approval claim/reference chưa xác minh; provider/quota chưa nêu. Không thấy mismatch extraction còn lại. **Cao** về actual gate. | Xác nhận registry có approval hợp lệ không; routine sandbox cần provider/quota đến mức nào? |
| 9 `TC006` | ESC/MISSING | ESC/MISSING · INFO-001, INFO-005, INFO-PROVISION-001; thiếu provider/environment/TTL/quota/sizing/approval. Input nêu ETL VM/Airflow, DAG sẵn, sizing và thời gian giữ máy chưa chốt. | Quyết định chuyển người vì thiếu sizing/TTL đã áp dụng; parser giữ đúng context. **Cao**; regression và benchmark đạt. | Đã chốt ESC/MISSING; Infra xác nhận cấu hình và ngày thu hồi. |
| 10 `TC007` | ESC/MISSING | ESC/MISSING · INFO-001, INFO-PROVISION-001; thiếu `resourceScope`, `permission`, `duration`. Input xin PostgreSQL staging DB để reconcile; CPU/RAM và ngày release chưa chốt. | Action đã khớp quyết định người dùng; required fields DATABASE_PROVISION vẫn dùng contract DB access. **Cao** về action; contract fields còn mở. | ESC/MISSING đã chốt. Database provisioning cần bộ fields nào khác DB access? |
| 11 `TC008` | ESC/MISSING | ESC/MISSING · INFO-001, INFO-005, INFO-PROVISION-001; thiếu provider/environment/TTL/quota/sizing/approval. Input nêu Kafka Connect worker; throughput/retention/instance size/timeframe chưa chốt. | Quyết định human review trước cấp worker đã áp dụng. **Cao**; regression và benchmark đạt. | Đã chốt ESC/MISSING; Infra xác nhận sizing/TTL. |
| 12 `TC010` | ESC/BEYOND | ESC/BEYOND · AUTH-002, AUTH-EXPORT-001, AUTH-001; input yêu cầu SELECT/export từ production DB để reconcile; có business purpose nhưng chưa có DBA sign-off, không nêu đích ngoài kiểm soát. | Quyết định người dùng đã áp dụng theo scope nghiệp vụ; action vẫn ESCALATE, security indicators vẫn giữ Security. **Cao**; regression và benchmark đạt. | Đã chốt BEYOND_AUTHORITY. DBA xác minh tables/quyền/TTL/destination trước xử lý. |
| 13 `TC015` | ESC/SECURITY | ESC/BEYOND · AUTH-002, AUTH-008, AUTH-001, INFO-001; input yêu cầu drop bảng users trong production DB; câu laptop freeze/restore là context. | Code đã đưa destructive DB request lên đúng nhánh DB; policy hiện kích AUTHORITY, không SECURITY. **Cao** về observed rules; nhãn bucket chưa adjudicate. | Destructive production DB change thuộc SECURITY hay BEYOND_AUTHORITY? |
| 14 `gt-routine-001-github-monorepo` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu duration/verifiedApproval. Input nêu GitHub Write, branch/PR, sprint 42 và approval reference. | Code đã bỏ task phụ giả; approval chưa xác minh và TTL không rõ. **Cao** về actual gate. | TTL của sprint có đủ không; registry chứa approval reference này không? |
| 15 `gt-routine-002-confluence-rdp-runbook` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005; thiếu environment/accessType/duration/approval. Input nêu quyền edit Confluence cho tài liệu RDP/port, đồng thời nói không mở network port. | Code đã sửa false port request; còn access contract và approval. **Cao** về code fix/missing fields. | Required fields/approval cho quyền Confluence là gì; manager email có thể verify thế nào? |
| 16 `gt-routine-003-jira-firewall-review` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu environment/accessType/duration/verifiedApproval. Input chỉ xin Browse/Create Issue để review external-port tasks và nói không đổi firewall. | Code đã sửa false network task; approval reference chưa verify, access fields còn thiếu. **Cao** về actual. | Jira Browse/Create có mapping chuẩn nào và approval reference cần kiểm tra gì? |
| 17 `gt-routine-004-vpn-data-oncall` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu symptom/requestedAction/urgency/verifiedApproval. Input xin corporate VPN vào dev network từ laptop công ty, có onboarding approval claim. | Code đã nhận diện VPN provisioning; policy dùng bộ fields VPN troubleshooting và approval chưa xác minh. **Cao** về contract hiện tại. | VPN access provisioning có cần symptom/urgency? Có onboarding approval record và TTL hợp lệ không? |
| 18 `gt-routine-005-sandbox-webhook` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu provider/quota/verifiedApproval. Input nêu 2 vCPU/4GB/20GB/48h, không public IP/production data, lead approval claim. | Code đã bỏ false subrequest; registry approval, provider/quota là residual gates. **Cao** về actual. | Approval có record được verify không? Sandbox routine cần provider/quota không? |
| 19 `gt-routine-006-sandbox-dbt-parser` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu provider/quota/disk/verifiedApproval. Input nêu 4 vCPU/8GB/5 ngày, synthetic schema, ticket approval; disk không nêu. | Approval chưa verified; provider/quota thiếu, disk cũng đang là required field. **Cao** về missing list. | Disk có bắt buộc cho loại sandbox này không? Approval/provider/quota contract nào áp dụng? |
| 20 `gt-routine-007-github-blockchain-audit` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu duration/verifiedApproval. Input nêu GitHub Read để review source, assignment và approval reference. | Code đã giữ danh sách phủ định khỏi tạo task phụ; approval chưa verified và TTL thiếu. **Cao** về actual. | Assignment/Read access cần verified approval và duration nào để routine? |
| 21 `gt-routine-008-jira-game-incident` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu environment/accessType/duration/verifiedApproval. Input nêu Jira transition issue; không truy cập server/DB; producer claim. | Code đã ngăn false DB/network subrequest; còn approval và permission-field mapping. **Cao** về actual. | Jira transition issue mapping và approval scope/TTL cần gì? |
| 22 `gt-routine-009-confluence-prod-db-sop` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu environment/duration/verifiedApproval. Input xin đọc Confluence page có “Production DB” trong tiêu đề và nói rõ không xin DB access. | Code đã loại false production-DB/security signal; AUTH-007 vẫn giữ vì approval chưa verify. **Cao** về code fix và actual gate. | Approval reference có kiểm chứng được không; read-only Confluence cần TTL/fields nào? |
| 23 `gt-routine-010-vpn-qa-network` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu symptom/requestedAction/urgency/verifiedApproval. Input xin standard VPN vào QA subnet, có hạn đến cuối sprint và approval reference. | Code đã giữ approval reference và nhận VPN; vẫn thiếu verified record và VPN contract fields. **Cao** về actual. | “đến cuối sprint” có đủ TTL không; VPN access có cần symptom/urgency? |
| 24 `gt-routine-011-sandbox-k3s` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu provider/quota/verifiedApproval. Input nêu sandbox 6 vCPU/12GB/40GB/72h, không public ingress, không mount secret thật, lead claim. | Code đã sửa false SECRET từ phủ định; approval chưa verified, provider/quota thiếu. **Cao** về actual gate. | Có approval record hợp lệ không; sandbox cần provider/quota nào để auto? |

## Các sửa đổi và kiểm tra

Candidate chỉ sửa parser trong `src/domain/text.ts` và thêm regression trong
`tests/sprint1-regression.test.ts`:

- Phân biệt yêu cầu quyền Jira/Confluence và VPN doanh nghiệp chuẩn (kể cả khi
  không ghi chữ `profile`) với thao tác mở port/network hoặc DB thực sự.
- Gộp sizing, throughput, trạng thái và ràng buộc phạm vi vào yêu cầu cấp phát
  tài nguyên tương ứng; không tạo UNKNOWN_SUPPORT_REQUEST giả từ các câu nối,
  tiêu đề tài liệu hoặc lời phủ định.
- Giữ lời khai/phần dẫn chiếu về phê duyệt của manager như ngữ cảnh chưa xác minh;
  parser không coi lời khai là verified approval, và vẫn giữ các hành động độc lập
  riêng, kể cả khi được nối sau “only/chi”.
- Nhận provider/repository/purpose, disk ở cả hai thứ tự và số shared/dedicated
  GPU từ dữ kiện rõ ràng; không coi dung lượng dataset là sizing disk, không tự
  thêm TTL, quota hoặc provider hạ tầng.
- Giữ scope quyền Git và nguồn laptop của VPN cùng request; tách hai resource
  Jira/Confluence khi được yêu cầu cùng câu, không chia sẻ approval giữa chúng.
- Nhận DATABASE_PROVISION/CLOUD_VM_REQUEST theo resource thực sự được xin;
  nhận DATABASE_SCHEMA_CHANGE trước symptom khi có drop table rõ ràng, và phân
  biệt RESTORE_REQUEST với BACKUP_REQUEST. Rule authority/destructive không đổi.
- Giữ business-purpose confirmation, thiếu DBA sign-off, thời hạn cấp tạm và câu
  uncertainty có giới hạn như context; phối hợp SELECT/read + export cùng target
  không tự sinh task thiếu đối tượng. Thao tác với target riêng vẫn tách riêng.
- Giữ phủ định `mount` khi dò secret. Có regression dương tính để hành động mở
  port/DB hoặc mount secret thật vẫn nằm trên safety path; có regression đảm bảo
  lời “đã OK” không nuốt mất thao tác chuyển tiền độc lập.

Đã chạy trên candidate cuối: `npm test` (45 file pass, 1 skipped; 744 tests pass,
1 skipped), `npm run lint`, `npm run typecheck`, `npm run build` — đều pass.
Thêm 35 regression so với v6; benchmark test gồm 22 test trong suite cuối.
Hai script `development-report.test.mjs` và `mongo-smoke-guard.test.mjs`: 15 pass;
đây là kiểm tra evaluator/guard, không kết nối Mongo thật.
Không chạy E2E, Mongo thật, held-out hay test với dịch vụ/credentials ngoài.

## Xác nhận trên commit candidate (2026-10-12 ICT)

- Code và regression test được commit tại `c682c7d2a29be913f223b3e4e7881941c26c731f`
  trên nhánh `codex/person-a-benchmark`, parent đúng base
  `163a7940bd98ee6492b21fc1c3f3411338e648aa`. Lượt benchmark cuối chạy trên SHA
  này, `runtimeDirty=false`; runtime digest là
  `e955570552ce06068654bdda8030f04f053a13dff91779dcdfa81708c2fda3bd`.
- Lệnh benchmark: `npx vitest run tests/support-verify.test.ts` (22/22 pass);
  sau đó so sánh bằng
  `node scripts/development-report.mjs /tmp/vng-support-evaluation-c682c7d-person-a.json --baseline /tmp/vng-support-evaluation-163a794.json --out /tmp/vng-support-comparison-c682c7d-person-a.json`.
- Môi trường: Node `v26.0.0`, provider mock, không gọi model/API, storage
  `memory-demo`, policy `support-guidance-v5.9`; cùng dataset
  `legacy-original-128`, 128 case, SHA-256
  `e817c4ac2fe64d7231b6664070703a12f74c00ecd312f958041720e7cbd6a1da`.
- Kết quả: 56/128 exact (43,75%), 128/128 readback, không có exact-pass
  regression. So với base, exact không tăng; FNR `7/94` (7,45%), unnecessary
  escalation `28/34` (82,35%). Các action mismatch còn lại tập trung ở nhóm
  expected ESC/MISSING và cần owner xác nhận contract.
- Artifact candidate SHA-256
  `8cb74531226aeee018bab4cd11b1938dc064467857d5efb13a2f0a4b5acd55e0`;
  comparison SHA-256
  `194ea888b2440db71259afb824f2617f96fb3e77c5b3967ab3ef6ee8d0a6dd24`.
  Cả hai được giữ local trong `/tmp`; `artifacts/original-fixture-evaluation.json`
  được khôi phục về SHA-256 `c827c1e11a044abaa29c1f3a97b298f70954217831f9391309437716c1ad1121`.
- Trên cùng code trước commit: `npm test` (744 pass, 1 skip), `npm run lint`,
  `npm run typecheck`, `npm run build`,
  `node --test scripts/mongo-smoke-guard.test.mjs scripts/development-report.test.mjs`
  (15 pass), và `npx vitest run tests/sprint1-regression.test.ts` (69 pass) đều
  đạt. Build có cập nhật artifact retrieval tracked; file được phục hồi nguyên
  trạng thái sau khi kiểm tra.

## Các quyết định owner tại v11

Bảng dưới là trạng thái v11. Người dùng đã chốt nhóm 4 ESC/MISSING và TC010 ở
decision log mới. Hiện còn 18 AUTO, TC015 và các required-fields/mapping contract
cần xác nhận; quyền tự soạn câu hỏi không tự xác minh approval hay đổi contract.

| Nhóm trong 24 case A | Số case | Căn cứ và đề xuất phân xử |
| --- | ---: | --- |
| Expected AUTO/ROUTINE | 18 | Tất cả vẫn thiếu verifiedApproval hoặc có reference không xác minh được. Giữ gate hiện tại; owner xác nhận expected label có phù hợp phạm vi/sizing/TTL/approval thật sự trong input không. Nếu bổ sung bộ có approval kiểm chứng được, tạo bộ adjudicated riêng với provenance; không ghi đè fixture gốc để tăng điểm. |
| Expected ESC/MISSING | 4 | `verify-003`, `TC006`–`TC008`: bucket đã là MISSING_INFO, runtime hỏi NEEDS_INFORMATION. Owner chọn contract “hỏi thêm” hay “chuyển người vì thiếu thông tin”, rồi mới thay action/nhãn theo biên bản quyết định. |
| Expected bucket khác risk rules hiện hành | 2 | `TC010`: production export kích SEC-005, expected BEYOND_AUTHORITY. `TC015`: destructive DB kích AUTH-008/AUTH-002/AUTH-001, expected SECURITY_RISK. Owner xác nhận precedence và phạm vi rule; parser không thay bucket theo kỳ vọng fixture. |

Ngoài ba nhóm trên, owner cần làm rõ required fields cho VPN_SETUP và
DATABASE_PROVISION: runtime đang dùng fields rộng của service, ví dụ symptom cho
VPN access và permission cho provisioning DB. Đây là thay đổi contract cần được
ghi lại, không phải thêm dữ kiện không có trong ticket. Với Git, chuẩn hóa quyền
collaborator/push branch và scope User/Editor cũng cần định nghĩa rõ.

Lần chạy này cải thiện các lỗi extraction đã có evidence và regression; không
chứng minh tối ưu tuyệt đối hoặc tăng độ chính xác. Tiếp tục tối ưu exact match
trong 24 case A cần các quyết định trên; chạy lại cùng code/dataset sẽ không giải
quyết mâu thuẫn contract. Cross-review và đánh giá độc lập chưa được thực hiện.

## Handoff đề xuất

1. B (cross-review) đọc 24 trace/evidence đầy đủ và 82 case có trace thay đổi,
   đối chiếu cả positive controls/extra operations trong regression.
2. Chủ policy/adjudicator ghi quyết định cho ba nhóm và required-fields contract
   nêu trên. Chỉ cập nhật policy/nhãn sau adjudication được ghi lại.
3. Code candidate mới theo quyết định người dùng ở commit
   `183ef1edf97229e4cd5085d923fdc302bb939266`; chưa push/mở PR và chưa có B/C
   cross-review. Runtime policy/cache đã tăng v5.10, preview/cache v5.9 phải tạo
   lại. Evidence trên commit sạch được ghi trong decision log mới. Candidate v11
   và benchmark lịch sử tại c682c7d được giữ ở phần xác nhận bên trên.

Artifact raw và comparison giữ local, không đưa trace vào repo:

- `/tmp/vng-support-evaluation-163a794-person-a-reviewed-v11.json`
- `/tmp/vng-support-person-a-comparison-v11.json`
- `/tmp/vng-support-evaluation-c682c7d-person-a.json`
- `/tmp/vng-support-comparison-c682c7d-person-a.json`

## Vòng tối ưu tiếp theo — thử và loại

Ngày 11/10/2026, thử gộp các câu trạng thái capacity/budget/sizing vào yêu cầu
cấp tài nguyên đứng trước. So với v11 trên cùng 128 case, v12 đạt 54/128 exact
(42,19%), giảm từ 56/128 (43,75%); false-negative của nhãn ESCALATE tăng từ
7/94 lên 18/94. Hai exact pass bị hồi quy là `gt-authority-008-eleven-gpu` và
`xcf-authority-010-localization-dubbing-gpu`. Tổng cộng 13 trace đổi; 11 case
expected ESCALATE/MISSING_INFO chuyển sang NEEDS_INFORMATION, nhưng contract hiện
tại chưa cho phép coi hai action này tương đương.

Nguyên nhân là các câu nhắc budget owner/capacity gần yêu cầu tài nguyên không
chỉ là sizing context: chúng có thể là bằng chứng đang thiếu thẩm quyền. Gộp
chúng làm mất `AUTH-005` đang giữ yêu cầu ở nhánh chuyển người. Vì không có quyết
định owner để đổi contract, đã bỏ toàn bộ code/test của thử nghiệm này và giữ
candidate v11. Runtime digest sau rollback khớp v11:
`e955570552ce06068654bdda8030f04f053a13dff91779dcdfa81708c2fda3bd`.

Comparison v12 (dùng để rà hồi quy, không phát hành):
`/tmp/vng-support-person-a-comparison-v12.json`, SHA-256
`da59c4dc090c4360920f42a7d74a070e654f568787a5ee9d6c4ef7b6ae59c8a7`.
Artifact tracked `artifacts/original-fixture-evaluation.json` đã được khôi phục
nguyên trạng, SHA-256 `c827c1e11a044abaa29c1f3a97b298f70954217831f9391309437716c1ad1121`.

Các quyết định chưa được người dùng chốt vẫn còn mở; Ground Truth không cập nhật.
