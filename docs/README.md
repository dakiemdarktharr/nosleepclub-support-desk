# Tài liệu VNG Support

Bắt đầu từ [README sản phẩm](../README.md). Chỉ dùng báo cáo có SHA/môi trường phù hợp với phiên bản đang kiểm tra; số test đạt không phải accuracy model hay tác động người dùng.

## Đọc theo nhu cầu

| Nhu cầu | Tài liệu |
| --- | --- |
| Gửi, theo dõi, xử lý yêu cầu | [Hướng dẫn sử dụng](USAGE.md) |
| Demo cho giám khảo | [Onboarding](JUDGE-ONBOARDING.md), [dataset Verify](JUDGE-DATASETS.md), [brief](../Challenge_Brief_OrganizationAI_VN.docx.md) |
| Vận hành, cấu hình ID/Mongo, đo lại | [RUNBOOK](../RUNBOOK.md) |
| Kiến trúc và AI/policy | [Module](ARCHITECTURE.md), [retrieval](RAG-RETRIEVAL.md), [answer validation](RAG-ANSWER.md), [quản trị tri thức](KNOWLEDGE-REVIEW.md) |
| Đánh giá và riêng tư | [Evaluation](EVALUATION.md), [sentiment](SENTIMENT-EVALUATION.md), [PII inventory](PRIVACY-INVENTORY.md) |
| Chất lượng và latency v5.20 | [Bốn vấn đề, contract và số đo baseline](QUALITY-LATENCY-2026-10-15.md) |
| Khôi phục AI và hướng dẫn dự phòng v5.18 | [Contract và kiểm tra 15/10](AI-RESILIENCE-2026-10-15.md) |
| Rà soát mismatch v5.17 | [Báo cáo mới](MISMATCH-FOLLOWUP-2026-10-14.md), [đối chiếu từng case](MISMATCH-FOLLOWUP-2026-10-14.json) |
| Quyền/quota và mismatch v5.16 | [Báo cáo](AUTHORITY-REVIEW-2026-10-14.md), [13 quyết định](decisions/DEMO-AUTHORITY-CONTRACT.md) |
| Mismatch và regression v5.15 | [Báo cáo 39 case](MISMATCH-REVIEW-2026-10-14.md), [metadata và so sánh](MISMATCH-REVIEW-2026-10-14.json) |
| Bằng chứng sau tích hợp main v5.14 | [Rà soát tích hợp](INTEGRATION-AUDIT-2026-10-14.md) |
| Feedback đã có trên main | [Báo cáo do chủ repo cung cấp](USER-TEST-FINDINGS.md); đọc giới hạn provenance trong tài liệu |
| Bằng chứng riêng của base đã chốt | [Rà soát 14/10/2026](REPO-AUDIT-2026-10-14.md) |
| Thu thập bằng chứng còn thiếu | [Protocol độc lập](INDEPENDENT-EVALUATION-PROTOCOL.md), [slide/video/checklist](SUBMISSION-CONTENT.md) |

## Quyết định thiết kế có nguồn gốc

Các quyết định dưới đây là của dự án mô phỏng. Giữ nguyên nội dung để truy vết; đối chiếu runtime policy khi áp dụng.

- [PERSON-A-CONTRACT-DECISIONS](decisions/PERSON-A-CONTRACT-DECISIONS.md)
- [PERSON-A-POLICY-DECISIONS](decisions/PERSON-A-POLICY-DECISIONS.md)

## Báo cáo lịch sử

Các báo cáo này thuộc commit/ngày ghi trong từng file, không đại diện HEAD hiện tại. Không xóa bằng chứng chỉ vì chỉ số cũ thấp.

- [BUILD-LOG-READINESS](archive/BUILD-LOG-READINESS.md)
- [CI-GUIDE-NAVIGATION-FIX](archive/CI-GUIDE-NAVIGATION-FIX.md)
- [COMPETITION-READINESS](archive/COMPETITION-READINESS.md)
- [ENTERPRISE-FEEDBACK](archive/ENTERPRISE-FEEDBACK.md)
- [EVIDENCE-WORKFLOW-FOLLOWUP](archive/EVIDENCE-WORKFLOW-FOLLOWUP.md)
- [FEEDBACK-EVIDENCE-REVIEW](archive/FEEDBACK-EVIDENCE-REVIEW.md)
- [GUEST-SUPPORT-DELIVERY](archive/GUEST-SUPPORT-DELIVERY.md)
- [IDENTITY-ID-ONLY-DEMO](archive/IDENTITY-ID-ONLY-DEMO.md)
- [IDENTITY-UX-DELIVERY](archive/IDENTITY-UX-DELIVERY.md)
- [IDENTITY-UX-PLAN](archive/IDENTITY-UX-PLAN.md)
- [INTENT-REVIEW-FIXES](archive/INTENT-REVIEW-FIXES.md)
- [IT-REVIEW-UI](archive/IT-REVIEW-UI.md)
- [MODEL-INTENT-ROUTING](archive/MODEL-INTENT-ROUTING.md)
- [REPO-BUGFIX-REVIEW](archive/REPO-BUGFIX-REVIEW.md)
- [SENTIMENT-INTEGRATION-REVIEW](archive/SENTIMENT-INTEGRATION-REVIEW.md)
- [SENTIMENT-MODEL-DIAGNOSTICS](archive/SENTIMENT-MODEL-DIAGNOSTICS.md)
- [TECHNICAL-CASE-REVIEW-PERSON-A](archive/TECHNICAL-CASE-REVIEW-PERSON-A.md)
- [TECHNICAL-CASE-REVIEW](archive/TECHNICAL-CASE-REVIEW.md)
- [TECHNICAL-READINESS](archive/TECHNICAL-READINESS.md)
- [UI-POLISH-ROLE-ENTRY](archive/UI-POLISH-ROLE-ENTRY.md)
- [UI-REVIEW-VNG](archive/UI-REVIEW-VNG.md)
