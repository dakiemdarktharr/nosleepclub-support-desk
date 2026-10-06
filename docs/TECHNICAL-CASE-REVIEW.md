# Danh sách phân xử 72 mismatch development

Đo ngày 07/10/2026 ICT; xem revision, môi trường và phương pháp tại
[TECHNICAL-READINESS.md](TECHNICAL-READINESS.md). Đây là trace máy,
**chưa có adjudication độc lập**. Không thay nhãn gốc. Không suy ra mọi escalation
là lỗi: tín hiệu chỉ xác định câu hỏi chuyên gia cần kiểm tra.

AUTO = AUTO_APPROVE; INFO = NEEDS_INFORMATION; ESC = ESCALATE.
MISSING = MISSING_INFO; AUTHORITY = BEYOND_AUTHORITY; SECURITY = SECURITY_RISK.

- F: runtime báo thiếu dữ kiện; đối chiếu input đầy đủ và từng subrequest.
- A: approval không xác minh được scope/TTL/registry; claim không phải bằng chứng duyệt.
- V: thiếu verified approval; chuyên gia quyết định nhãn có phù hợp contract không.
- U: clause/task chưa ánh xạ; kiểm tra là tác vụ độc lập hay lỗi tách/context trước sửa.
- R: risk/authority gate khớp; kiểm tra evidence, phủ định và phạm vi, không tự bỏ gate.
- Q: nhãn ESC so với runtime hỏi thêm; cần phân xử contract, không phải tự cấp quyền.

Bảng chỉ lưu ID case, quyết định và mã rule/tín hiệu; không sao chép tên/nội dung
fixture chưa xác minh nguồn gốc. Báo cáo JSON local xuất bằng lệnh trong runbook
có **đủ 128 case**, evidence, reason, câu hỏi và kết quả từng subrequest cho người
phân xử được phép đọc. Bảng không thay thế việc đọc input/evidence đó.

| Case | Expected action/bucket | Actual action/bucket | Rule kích hoạt | Tín hiệu |
| --- | --- | --- | --- | --- |
| verify-001-github-access | AUTO/ROUTINE | INFO/MISSING | INFO-001, INFO-005 | F, V |
| verify-002-small-sandbox | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, AUTH-005 | F, A, U |
| verify-003-etl-missing-specs | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| TC001 | AUTO/ROUTINE | ESC/AUTHORITY | INFO-001, AUTH-005 | F, U |
| TC002 | AUTO/ROUTINE | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| TC003 | AUTO/ROUTINE | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| TC004 | AUTO/ROUTINE | INFO/MISSING | INFO-001, INFO-005 | F, V |
| TC005 | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| TC006 | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| TC007 | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| TC008 | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| TC010 | ESC/AUTHORITY | ESC/SECURITY | SEC-005, AUTH-002, AUTH-001, AUTH-005 | F, U, R |
| TC015 | ESC/SECURITY | ESC/AUTHORITY | AUTH-002, AUTH-008, AUTH-005, INFO-001 | F, U, R |
| gt-routine-001-github-monorepo | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| gt-routine-002-confluence-rdp-runbook | AUTO/ROUTINE | ESC/AUTHORITY | INFO-001, AUTH-005 | F, U |
| gt-routine-003-jira-firewall-review | AUTO/ROUTINE | ESC/AUTHORITY | INFO-001, AUTH-005 | F, U |
| gt-routine-004-vpn-data-oncall | AUTO/ROUTINE | ESC/AUTHORITY | INFO-001, AUTH-005 | F, U |
| gt-routine-005-sandbox-webhook | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| gt-routine-006-sandbox-dbt-parser | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| gt-routine-007-github-blockchain-audit | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| gt-routine-008-jira-game-incident | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| gt-routine-009-confluence-prod-db-sop | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-002, AUTH-001, INFO-001, INFO-005 | F, V, R |
| gt-routine-010-vpn-qa-network | AUTO/ROUTINE | ESC/AUTHORITY | INFO-001, AUTH-005 | F, U |
| gt-routine-011-sandbox-k3s | AUTO/ROUTINE | ESC/SECURITY | SEC-001, AUTH-007 | F, A, R |
| gt-routine-012-github-actions-read | AUTO/ROUTINE | ESC/SECURITY | SEC-001, AUTH-007 | F, A, R |
| gt-routine-013-confluence-kafka-docs | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| gt-routine-014-jira-dataops-board | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005 | F, A, V |
| gt-routine-015-sandbox-otel | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| gt-missing-001-etl-generic | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-002-airflow-worker | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-003-kafka-connect | ESC/MISSING | ESC/AUTHORITY | AUTH-005 | F, U |
| gt-missing-004-debezium-cdc | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-005-spark-driver | ESC/MISSING | ESC/AUTHORITY | AUTH-005 | F, U |
| gt-missing-006-flink-etl | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-007-dbt-runner | ESC/MISSING | INFO/MISSING | INFO-001, INFO-005 | F, V, Q |
| gt-missing-008-postgres-uat | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-009-redis-test | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-010-mongodb-qa | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-011-clickhouse-analytics | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-012-trino-coordinator | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-013-feature-store-etl | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-014-data-quality-runner | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-missing-015-temporal-worker | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| gt-authority-001-pubg-prod-write | ESC/AUTHORITY | ESC/SECURITY | SEC-003, AUTH-002, AUTH-001, AUTH-005 | F, U, R |
| gt-authority-005-prod-service-account | ESC/AUTHORITY | ESC/SECURITY | SEC-001, AUTH-002, AUTH-001 | F, R |
| gt-authority-007-production-dump | ESC/AUTHORITY | ESC/SECURITY | SEC-005, AUTH-002, AUTH-001, INFO-001, INFO-005 | F, V, R |
| xcf-routine-001-hr-confluence-onboarding | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| xcf-routine-002-finance-vpn-month-end | AUTO/ROUTINE | ESC/AUTHORITY | INFO-001, AUTH-007 | F, A |
| xcf-routine-003-legal-jira-dsar | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| xcf-routine-004-procurement-github-sbom | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| xcf-routine-005-salesops-jira-crm | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| xcf-routine-006-marketing-sandbox-webhook | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| xcf-routine-007-customer-care-vpn | AUTO/ROUTINE | ESC/AUTHORITY | INFO-001, AUTH-005 | F, U |
| xcf-routine-008-facilities-jira-maintenance | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| xcf-routine-009-audit-confluence-controls | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| xcf-routine-010-comms-sandbox-preview | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-007, INFO-001, INFO-005, AUTH-005 | F, A, V, U |
| xcf-routine-011-eventops-vpn | AUTO/ROUTINE | ESC/AUTHORITY | GUIDE-007, AUTH-005 | F, U |
| xcf-routine-012-executive-confluence-boardpack | AUTO/ROUTINE | ESC/AUTHORITY | AUTH-002, AUTH-001, INFO-001, INFO-005, AUTH-005 | F, V, U, R |
| xcf-missing-001-hr-payroll-etl | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-002-finance-bank-etl | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-003-legal-ediscovery-db | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-004-procurement-vendor-db | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-005-sales-crm-etl | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-006-marketing-attribution-etl | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-007-care-transcript-db | ESC/MISSING | ESC/AUTHORITY | INFO-EVIDENCE-001, INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-008-facilities-iot-db | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-009-audit-evidence-server | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-010-esg-reporting-db | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-011-comms-media-db | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-missing-012-risk-fraud-etl | ESC/MISSING | ESC/AUTHORITY | INFO-001, INFO-005, AUTH-005 | F, V, U |
| xcf-authority-004-privacy-zalo-export | ESC/AUTHORITY | ESC/SECURITY | SEC-005, AUTH-002, AUTH-001, AUTH-005 | F, U, R |
| xcf-authority-007-audit-production-read | ESC/AUTHORITY | ESC/SECURITY | SEC-005, AUTH-002, AUTH-001, AUTH-005 | F, U, R |
