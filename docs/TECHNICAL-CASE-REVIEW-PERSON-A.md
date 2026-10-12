# Phân tích 24 mismatch đầu — Member A

Ngày 11/10/2026 (ICT). Báo cáo này bổ sung trace mới cho 24 case đầu trong
[TECHNICAL-CASE-REVIEW.md](TECHNICAL-CASE-REVIEW.md). Đây là phân tích có AI
hỗ trợ, chưa phải phân xử độc lập. Không đổi fixture, input, Ground Truth,
expected action/bucket/rule hay approval registry. Policy runtime cập nhật theo
decision log của người dùng bên dưới.

Cập nhật 12/10/2026: runtime policy v5.12 giữ bốn case thiếu thông tin thành
ESC/MISSING, TC010 thành ESC/BEYOND và TC015 thành ESC/SECURITY theo quyết định
người dùng. Candidate đạt 63/128 exact; trước vòng TC015 là 62/128 ở v5.10,
baseline v5.9 là 56/128. Có 6/24 case A đạt, còn 18 mismatch expected AUTO.
Contract VPN/database provisioning, mapping quyền và thời hạn đã được chốt
theo quyền người dùng giao; không còn chờ chọn contract. 18 AUTO chưa đủ
approval/facts theo runtime đã chọn; nhãn gốc giữ nguyên, chưa adjudicate độc lập.
Decision log/evidence mới ở [PERSON-A-CONTRACT-DECISIONS.md](PERSON-A-CONTRACT-DECISIONS.md),
quyết định trước ở [PERSON-A-POLICY-DECISIONS.md](PERSON-A-POLICY-DECISIONS.md).
Các đoạn benchmark v11 bên dưới là lịch sử; bảng 24 case dùng actual v5.12.

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

## Phân tích 24 case — actual v5.12

`INFO` = `NEEDS_INFORMATION`; `ESC` = `ESCALATE`; `AUTO` = `AUTO_APPROVE`.
Độ tin cậy dưới đây nói về chẩn đoán nguyên nhân theo trace và policy đang có,
không khẳng định expected đúng. “Code đã sửa” chỉ nói regression xác nhận lỗi
trích xuất cũ đã được sửa; mismatch còn lại vẫn cần xử lý theo cột owner.

| # / Case | Expected | Actual và evidence từ runtime/input | Nguyên nhân hiện tại / confidence | Evidence/review còn cần |
| --- | --- | --- | --- | --- |
| 1 `verify-001-github-access` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005; thiếu duration, verifiedApproval. Evidence: Hi IT team, nhờ cấp giúp mình quyền collaborator vào GitHub repo vng-data/customer-profile-api để support sprint này.… | Mapping Git theo quyền nêu rõ đã chốt; collaborator đơn thuần không suy thành Write. Approval=pending; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 2 `verify-002-small-sandbox` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu provider, budgetOrQuota, verifiedApproval. Evidence: Chào team Infra, cho mình xin một sandbox nhỏ để test service recommendation nhé: 2 vCPU, 4GB RAM, disk 20GB, không cần … | Contract giữ provider/quota/sizing; không tự điền mặc định để khớp nhãn. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần provider/quota, sizing còn thiếu và approval đúng scope; giữ expected gốc. |
| 3 `verify-003-etl-missing-specs` | ESC/MISSING | ESC/MISSING · INFO-001, INFO-005, INFO-PROVISION-001; thiếu provider, environment, duration, budgetOrQuota, cpu, ram, disk, verifiedApproval. Evidence: Hi Data Ops, bên mình cần dựng gấp một ETL server để pull event từ Kafka rồi load sang warehouse cho pipeline campaign. … | INFO-PROVISION-001 chuyển thiếu sizing/TTL cho người xử lý theo quyết định đã chốt. **Cao** về actual và regression. | Đã chốt; B/C review scope rule và safety boundaries. |
| 4 `TC001` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005, FACT-VPN-001; thiếu duration, verifiedApproval. Evidence: Hi IT, mình cần standard corporate VPN để vào QA subnet test Zalo mini-app từ laptop managed.… | FACT-VPN-001 dùng facts cấp quyền; đã giữ nguồn/đích/mục đích, không hỏi symptom/urgency. Approval=pending; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 5 `TC002` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005; thiếu provider, budgetOrQuota, verifiedApproval. Evidence: Cho mình một sandbox 2 vCPU, 8GB RAM, 40GB disk và 1 shared T4 trong 48h để test recommendation service bằng synthetic d… | Contract giữ provider/quota/sizing; không tự điền mặc định để khớp nhãn. Approval=pending; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần provider/quota, sizing còn thiếu và approval đúng scope; giữ expected gốc. |
| 6 `TC003` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005; thiếu duration, verifiedApproval. Evidence: Nhờ add mình vào GitHub repo vng-platform/feature-flags với quyền Write để làm PR cho sprint này.… | Mapping Git theo quyền nêu rõ đã chốt; collaborator đơn thuần không suy thành Write. Approval=pending; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 7 `TC004` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005, FACT-COLLAB-001; thiếu duration, verifiedApproval, accessType, reason. Evidence: Team cho mình access Jira project GAMEOPS và Confluence space PUBG-OPS để follow incident tickets với cập nhật runbook.… | FACT-COLLAB-001 giữ hai resource độc lập; không chia sẻ quyền/approval/mục đích chưa nêu cho từng yêu cầu con. Approval=pending; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; TC004 cần quyền/mục đích cho từng resource. Giữ expected gốc. |
| 8 `TC005` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu provider, budgetOrQuota, verifiedApproval. Evidence: Mình xin sandbox 4 vCPU, 12GB RAM, 80GB disk, TTL 5 ngày để replay Kafka event cho team Data Quality. Data là synthetic,… | Contract giữ provider/quota/sizing; không tự điền mặc định để khớp nhãn. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần provider/quota, sizing còn thiếu và approval đúng scope; giữ expected gốc. |
| 9 `TC006` | ESC/MISSING | ESC/MISSING · INFO-001, INFO-005, INFO-PROVISION-001; thiếu provider, environment, duration, budgetOrQuota, cpu, ram, disk, verifiedApproval. Evidence: Hi Data Ops, team mình cần một ETL VM chạy Airflow để backfill event từ ZaloPay sang lakehouse. DAG đã ready, nhờ Infra … | INFO-PROVISION-001 chuyển thiếu sizing/TTL cho người xử lý theo quyết định đã chốt. **Cao** về actual và regression. | Đã chốt; B/C review scope rule và safety boundaries. |
| 10 `TC007` | ESC/MISSING | ESC/MISSING · INFO-001, FACT-DB-PROVISION-001, INFO-PROVISION-001; thiếu cpu, ram, disk, duration. Evidence: Finance cần một PostgreSQL staging database để reconcile settlement cuối tháng. Data khoảng 200GB và team muốn dùng ngay… | FACT-DB-PROVISION-001 hỏi đúng CPU/RAM/disk/TTL; giữ ESC/MISSING đã chốt. **Cao** về actual và regression. | Đã chốt; B/C review scope rule và safety boundaries. |
| 11 `TC008` | ESC/MISSING | ESC/MISSING · INFO-001, INFO-005, INFO-PROVISION-001; thiếu provider, environment, duration, budgetOrQuota, cpu, ram, disk, verifiedApproval. Evidence: Bên VNGGames cần một Kafka Connect worker để sync gameplay events sang ClickHouse cho dashboard live ops. Throughput với… | INFO-PROVISION-001 chuyển thiếu sizing/TTL cho người xử lý theo quyết định đã chốt. **Cao** về actual và regression. | Đã chốt; B/C review scope rule và safety boundaries. |
| 12 `TC010` | ESC/BEYOND | ESC/BEYOND · AUTH-002, AUTH-EXPORT-001, AUTH-001; thiếu system, resourceScope, operation, dataSensitivity, destination, verifiedApproval. Evidence: Finance BI cần SELECT và export một số bảng từ ZaloPay Production DB để reconcile revenue với payment gateway. CFO đã ok… | AUTH-EXPORT-001 giữ export production cần DBA; security indicators có ưu tiên. **Cao** về actual và regression. | Đã chốt; B/C review scope rule và safety boundaries. |
| 13 `TC015` | ESC/SECURITY | ESC/SECURITY · SEC-007, AUTH-002, AUTH-008, AUTH-001, INFO-001; thiếu system, resourceScope, operation, dataSensitivity, rollbackPlan, verifiedApproval, pathOrBucket, desiredOutcome. Evidence: drop bảng users trong ZaloPay Production DB; nói restore sau nếu cần… | SEC-007 chuyển destructive production DB cho Security/DBA theo quyết định đã chốt. **Cao** về actual và regression. | Đã chốt; B/C review scope rule và safety boundaries. |
| 14 `gt-routine-001-github-monorepo` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu duration, verifiedApproval. Evidence: Hi IT, nhờ add account của mình vào GitHub repo platform/payment-sdk với role Write để mở branch và PR cho sprint 42. Ch… | Mapping Git theo quyền nêu rõ đã chốt; collaborator đơn thuần không suy thành Write. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 15 `gt-routine-002-confluence-rdp-runbook` | AUTO/ROUTINE | INFO/MISSING · INFO-001, INFO-005, FACT-COLLAB-001; thiếu duration, verifiedApproval. Evidence: Team IT cho mình quyền edit Confluence space SECOPS để cập nhật tài liệu RDP hardening và checklist port 3389.… | FACT-COLLAB-001 map scope/quyền nội dung; không hỏi environment hạ tầng. Approval=pending; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 16 `gt-routine-003-jira-firewall-review` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu duration, verifiedApproval. Evidence: Nhờ cấp access Jira project NETSEC cho mình để theo dõi các task review external port.… | FACT-COLLAB-001 map scope/quyền nội dung; không hỏi environment hạ tầng. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 17 `gt-routine-004-vpn-data-oncall` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu duration, verifiedApproval. Evidence: Chào Helpdesk, mình join rotation Data Platform tuần này nên cần standard corporate VPN profile để vào dev network.… | FACT-VPN-001 dùng facts cấp quyền; đã giữ nguồn/đích/mục đích, không hỏi symptom/urgency. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 18 `gt-routine-005-sandbox-webhook` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu provider, budgetOrQuota, verifiedApproval. Evidence: Cho mình xin sandbox 2 vCPU, 4GB RAM, 20GB disk trong 48 giờ để replay webhook payload. Không public IP, không productio… | Contract giữ provider/quota/sizing; không tự điền mặc định để khớp nhãn. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần provider/quota, sizing còn thiếu và approval đúng scope; giữ expected gốc. |
| 19 `gt-routine-006-sandbox-dbt-parser` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu provider, budgetOrQuota, disk, verifiedApproval. Evidence: Hi Infra, provision giúp một sandbox 4 vCPU / 8GB RAM / TTL 5 ngày để benchmark dbt parser nhé.… | Contract giữ provider/quota/sizing; không tự điền mặc định để khớp nhãn. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần provider/quota, sizing còn thiếu và approval đúng scope; giữ expected gốc. |
| 20 `gt-routine-007-github-blockchain-audit` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu duration, verifiedApproval. Evidence: Mình cần Read access GitHub repo security/blockchain-audit-rules để review source theo assignment.… | Mapping Git theo quyền nêu rõ đã chốt; collaborator đơn thuần không suy thành Write. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 21 `gt-routine-008-jira-game-incident` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu duration, verifiedApproval. Evidence: Please add mình vào Jira project GAMEOPS để update ticket PUBG incident follow-up.… | FACT-COLLAB-001 map scope/quyền nội dung; không hỏi environment hạ tầng. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 22 `gt-routine-009-confluence-prod-db-sop` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu duration, verifiedApproval. Evidence: Nhờ cấp quyền view Confluence page Production DB Recovery SOP cho mục đích training on-call.… | FACT-COLLAB-001 map scope/quyền nội dung; không hỏi environment hạ tầng. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 23 `gt-routine-010-vpn-qa-network` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu duration, verifiedApproval. Evidence: IT ơi cấp standard VPN access vào QA subnet giúp mình để test mobile build từ laptop công ty.… | FACT-VPN-001 dùng facts cấp quyền; đã giữ nguồn/đích/mục đích, không hỏi symptom/urgency. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần thời hạn rõ và approval đúng scope; Giữ expected gốc. |
| 24 `gt-routine-011-sandbox-k3s` | AUTO/ROUTINE | ESC/BEYOND · AUTH-007; thiếu provider, budgetOrQuota, verifiedApproval. Evidence: Xin sandbox 6 vCPU, 12GB RAM, disk 40GB, TTL 72h để spin up single-node k3s và test Helm chart.… | Contract giữ provider/quota/sizing; không tự điền mặc định để khớp nhãn. Approval=unverifiable; theo policy hiện hành chưa đủ điều kiện AUTO. **Cao** về observed facts/gate; expected chưa adjudicate độc lập. | Cần provider/quota, sizing còn thiếu và approval đúng scope; giữ expected gốc. |

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
decision log mới; TC015 được chốt ở v5.11, contract/mapping được chốt ở v5.12
theo quyền người dùng giao. 18 AUTO còn xung đột với evidence/approval trong
harness; bảng owner dưới đây là lịch sử v11, không phải danh sách contract đang chờ.

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

1. B/C review 24 trace/evidence và 22 case đổi rules/fields/yêu cầu con ở vòng
   v5.12, gồm 12 case ngoài A; đối chiếu positive controls và approval sai scope.
   82 case đổi trace của vòng parser v11 là evidence lịch sử riêng.
2. Contract được chốt theo quyền người dùng giao. Formal adjudication nhãn và
   evidence approval đúng scope còn thiếu; giữ nguyên expected gốc.
3. Code candidate mới theo quyết định người dùng ở commit
   `433382bbd840f96e594cc91319a4ac8810bdb5ea`; chưa push/mở PR và chưa có B/C
   cross-review. Runtime policy/cache đã tăng v5.12, preview/cache v5.11 phải tạo
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
