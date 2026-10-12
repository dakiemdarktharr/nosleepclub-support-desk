import type { Decision, Environment, RequestKind, RiskSignal, ServiceGroup } from "./contracts";

// Versioned executable policy data. Meaning and migrations are documented independently of the engine.
export const POLICY_VERSION = "support-guidance-v5.12";
export const demoResourceLimits = {
  gpuCount: 2,
  gpuTypes: ["t4", "a10"],
  cpu: 4,
  ram: 16,
  disk: 100,
  hours: 8,
} as const;

export const bucketPriority = {
  ROUTINE: 0,
  MISSING_INFO: 1,
  BEYOND_AUTHORITY: 2,
  SECURITY_RISK: 3,
} as const;
export const riskRules: Array<{
  signal: RiskSignal;
  id: string;
  bucket: "SECURITY_RISK" | "BEYOND_AUTHORITY";
  uncertaintyClass: Decision["uncertaintyClass"];
  reason: string;
  question: string;
  serviceGroup?: ServiceGroup;
  environment?: Environment;
}> = [
  {
    signal: "SECRET",
    id: "SEC-001",
    bucket: "SECURITY_RISK",
    uncertaintyClass: "OUT_OF_POLICY",
    reason:
      "Yêu cầu chứa hoặc xin thông tin xác thực; chỉ giữ bằng chứng đã che.",
    question:
      "Reviewer xác nhận loại secret đã bị che và kênh xử lý sự cố bảo mật phù hợp nào?",
  },
  {
    signal: "PUBLIC_EXPOSURE",
    id: "SEC-002",
    bucket: "SECURITY_RISK",
    uncertaintyClass: "OUT_OF_POLICY",
    reason: "Mở truy cập từ Internet cần Security và Network xem xét.",
    question:
      "Source, target, port/protocol và phương án không public an toàn hơn là gì?",
  },
  {
    signal: "SECURITY_CONTROL",
    id: "SEC-002",
    bucket: "SECURITY_RISK",
    uncertaintyClass: "OUT_OF_POLICY",
    reason: "Không tự tắt MFA, EDR, audit hoặc kiểm soát bảo mật.",
    question:
      "Kiểm soát nào đang gây vướng và phương án chẩn đoán nào giữ nguyên kiểm soát đó?",
  },
  {
    signal: "BYPASS",
    id: "SEC-003",
    bucket: "SECURITY_RISK",
    uncertaintyClass: "OUT_OF_POLICY",
    reason: "Không bỏ qua quy trình phê duyệt hoặc change control.",
    question:
      "Approval/change record có thể xác minh cho đúng resource, action và thời hạn là gì?",
  },
  {
    signal: "INJECTION",
    id: "SEC-004",
    bucket: "SECURITY_RISK",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason: "Chỉ dẫn trong ticket không có quyền thay đổi policy.",
    question:
      "Mục tiêu nghiệp vụ thực tế và approval có thể xác minh, tách khỏi chỉ dẫn trong ticket, là gì?",
  },
  {
    signal: "DATA_EXPORT",
    id: "SEC-005",
    bucket: "SECURITY_RISK",
    uncertaintyClass: "OUT_OF_POLICY",
    reason: "Xuất dữ liệu tới đích chưa kiểm soát cần Security và Data owner.",
    question:
      "Dataset, destination được quản lý, retention và căn cứ cho phép xuất dữ liệu là gì?",
  },
  {
    signal: "UNAPPROVED_SOFTWARE",
    id: "SEC-006",
    bucket: "SECURITY_RISK",
    uncertaintyClass: "OUT_OF_POLICY",
    reason: "Phần mềm chưa được duyệt cần kiểm tra an toàn.",
    question:
      "Tên, nguồn phát hành, chữ ký và lựa chọn đã được catalog phê duyệt là gì?",
  },
  {
    signal: "DESTRUCTIVE",
    id: "SEC-007",
    serviceGroup: "DATABASE",
    environment: "production",
    bucket: "SECURITY_RISK",
    uncertaintyClass: "OUT_OF_POLICY",
    reason: "Xóa bảng hoặc dữ liệu trên database production có nguy cơ mất dữ liệu; cần Security/DBA xem xét.",
    question: "Những bảng và dữ liệu nào sẽ bị xóa? Security/DBA đã duyệt phương án xử lý và kiểm tra khả năng khôi phục từ backup chưa?",
  },
  {
    signal: "PRIVILEGED",
    id: "AUTH-003",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason: "Quyền đặc quyền cần reviewer và owner có thẩm quyền.",
    question:
      "Quyền tối thiểu thay thế là gì và owner nào phê duyệt đúng scope/thời hạn?",
  },
  {
    signal: "PRODUCTION_CHANGE",
    id: "AUTH-002",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason: "Truy cập dữ liệu hoặc thay đổi production cần reviewer.",
    question:
      "Phạm vi production, rollback và approval đúng thẩm quyền có thể xác minh là gì?",
  },
  {
    signal: "CONTROL_CHANGE",
    id: "AUTH-004",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason: "Thay đổi cấu hình, quota hoặc control cần owner xác nhận.",
    question:
      "Owner, phạm vi thay đổi, rollback và approval reference cụ thể là gì?",
  },
  {
    signal: "CONFLICT",
    id: "AUTH-006",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason: "Các dữ kiện mâu thuẫn; giữ cả hai để reviewer xác nhận.",
    question:
      "Dữ kiện nào là đúng cho service, environment, action, resource và quyền yêu cầu?",
  },
  {
    signal: "DESTRUCTIVE",
    id: "AUTH-008",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason: "Thao tác xóa dữ liệu, wipe hoặc thay thiết bị cần admin.",
    question:
      "Backup, phạm vi dữ liệu bị ảnh hưởng và người có thẩm quyền phê duyệt là gì?",
  },
  {
    signal: "INCIDENT",
    id: "AUTH-009",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason: "Incident cần chuyên viên xác định tác động và phương án xử lý.",
    question:
      "Asset, thời điểm, tác động và bằng chứng an toàn nào cần chuyển cho incident responder?",
  },
  {
    signal: "USER_HANDOFF",
    id: "HANDOFF-001",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason:
      "Bạn muốn người phụ trách hỗ trợ trực tiếp; lịch sử được giữ cho admin.",
    question: "Bạn muốn người phụ trách hỗ trợ mục tiêu cụ thể nào trước tiên?",
  },
  {
    signal: "MODEL_UNAVAILABLE",
    id: "FAIL-001",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason:
      "Lý do: Trợ lý AI chưa sẵn sàng hoặc chưa kịp phản hồi. Vì vậy, yêu cầu sẽ được chuyển cho người phụ trách xem xét.",
    question:
      "Reviewer có thể phân loại request từ evidence đã redact này không?",
  },
  {
    signal: "MODEL_OUTPUT_INVALID",
    id: "FAIL-002",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason:
      "Model trả dữ liệu không đúng schema hoặc hướng dẫn ngoài phạm vi an toàn.",
    question:
      "Reviewer xác nhận service, intent và scope canonical nào từ evidence?",
  },
  {
    signal: "MODEL_EVIDENCE_INVALID",
    id: "FAIL-003",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    reason: "Không xác minh được bằng chứng hoặc phạm vi do model trích xuất.",
    question: "Reviewer xác nhận fact nào được evidence hỗ trợ trực tiếp?",
  },
];

export const productionDatabaseRule = {
  id: "AUTH-001",
  bucket: "BEYOND_AUTHORITY" as const,
  uncertaintyClass: "AUTHORITY_REQUIRED" as const,
  reason:
    "Direct database/data access hoặc export production luôn cần Data owner và reviewer.",
  question:
    "Data scope, destination, retention và approval đúng vai trò cho production là gì?",
};

// A stated business purpose still requires technical authorization. Explicit
// sensitive data or an uncontrolled destination keeps the Security route.
export const productionExportAuthorityRule = {
  id: "AUTH-EXPORT-001",
  signal: "DATA_EXPORT" as RiskSignal,
  bucket: "BEYOND_AUTHORITY" as const,
  uncertaintyClass: "AUTHORITY_REQUIRED" as const,
  securityIndicators:
    /\b(?:customer|khach hang|user data|user records|du lieu nguoi dung|confidential|pii|privacy|dsar|personal data|dump|laptop|personal|external|public|unmanaged|drive|repo(?:sitory)?|bucket|storage|may phan tich|may ca nhan|ca nhan|ben ngoai)\b/,
  reason: "Đọc hoặc xuất dữ liệu production cần DBA/Data owner xác nhận quyền và phạm vi.",
  question: "DBA/Data owner đã duyệt những bảng nào, mức quyền nào và thời hạn đến khi nào?",
  destinationQuestion: "Dữ liệu sẽ được lưu ở đâu và giữ trong bao lâu?",
};

export const provisioningInformationRule = {
  id: "INFO-PROVISION-001",
  intentLabels: ["CLOUD_VM_REQUEST", "DATABASE_PROVISION"] as readonly string[],
  sizingFields: ["cpu", "ram", "disk", "duration"] as readonly string[],
  reason: "Yêu cầu cấp tài nguyên còn thiếu cấu hình hoặc thời hạn; cần team phụ trách kiểm tra trước khi cấp.",
  question: "Infra/DBA đề xuất cấu hình CPU, RAM, dung lượng đĩa và thời hạn sử dụng nào phù hợp với công việc này?",
  nextStep: "Team Infra/DBA xác nhận cấu hình, thời hạn sử dụng và phê duyệt trước khi cấp tài nguyên.",
};

export const requiredFactRules: Array<{
  id: string;
  serviceGroup: ServiceGroup;
  intentLabels: readonly string[];
  requestKinds: readonly RequestKind[];
  systems?: readonly string[];
  fields: readonly string[];
}> = [
  {
    id: "FACT-VPN-001", serviceGroup: "NETWORK_VPN",
    intentLabels: ["VPN_SETUP"], requestKinds: ["ACCESS_REQUEST"],
    fields: ["service", "source", "target", "environment", "duration", "reason"],
  },
  {
    id: "FACT-DB-PROVISION-001", serviceGroup: "DATABASE",
    intentLabels: ["DATABASE_PROVISION"], requestKinds: ["ROUTINE_WORKFLOW", "CONFIGURATION_CHANGE"],
    fields: ["system", "environment", "cpu", "ram", "disk", "duration", "reason"],
  },
  {
    id: "FACT-COLLAB-001", serviceGroup: "ACCOUNT_ACCESS",
    intentLabels: ["REQUEST_STANDARD_ACCESS", "REQUEST_READ_ACCESS", "REQUEST_WRITE_ACCESS"],
    requestKinds: ["ACCESS_REQUEST"], systems: ["jira", "confluence"],
    fields: ["targetSystem", "resourceScope", "accessType", "duration", "reason"],
  },
];

export const permissionMappings: Array<{
  serviceGroup: ServiceGroup;
  system?: string;
  field: "permission" | "accessType";
  value: string;
  pattern: RegExp;
}> = [
  { serviceGroup: "GIT_PERMISSION", field: "permission", value: "write",
    pattern: /\b(?:push (?:a |the )?(?:branch|code)|day (?:branch|code))\b/ },
  { serviceGroup: "ACCOUNT_ACCESS", system: "jira", field: "accessType", value: "standard",
    pattern: /\b(?:browse|create (?:issues?|tickets?)|transition (?:issues?|tickets?)|role user|user(?:\/editor)? role)\b/ },
  { serviceGroup: "ACCOUNT_ACCESS", system: "confluence", field: "accessType", value: "write",
    pattern: /\b(?:role editor|editor role|quyen editor|editor|quyen edit|edit (?:access|permission|confluence))\b/ },
  { serviceGroup: "ACCOUNT_ACCESS", system: "confluence", field: "accessType", value: "read-only",
    pattern: /\b(?:quyen view|view (?:access|permission|confluence|page))\b/ },
  { serviceGroup: "ACCOUNT_ACCESS", system: "confluence", field: "accessType", value: "standard",
    pattern: /\b(?:quyen comment|comment (?:access|permission|in|trong))\b/ },
];

export const manualReviewRules = [
  {
    factRuleId: "FACT-VPN-001", id: "AUTH-VPN-001", team: "Network / Reviewer",
    reason: "Cấp quyền VPN cần Network xác nhận phạm vi và cấu hình trước khi thực hiện.",
    question: "Network đã xác nhận thiết bị, mạng đích, profile VPN và thời điểm thu hồi quyền chưa?",
  },
  {
    factRuleId: "FACT-DB-PROVISION-001", id: "AUTH-DB-PROVISION-001", team: "DBA/Data / Reviewer",
    reason: "Cấp database mới cần DBA xác nhận cấu hình và phương án vận hành.",
    question: "DBA đã xác nhận cấu hình, workload, backup và ngày thu hồi database chưa?",
  },
  {
    factRuleId: "FACT-COLLAB-001", id: "AUTH-COLLAB-001", team: "IAM/IT / Resource owner",
    reason: "Phạm vi quyền nội dung này cần IAM và owner tài nguyên xử lý trước khi cấp.",
    question: "Owner đã xác nhận project/space/page, mức quyền tối thiểu và thời điểm thu hồi chưa?",
  },
];

export const securityServiceRule = {
  id: "AUTH-010",
  bucket: "BEYOND_AUTHORITY" as const,
  uncertaintyClass: "AUTHORITY_REQUIRED" as const,
  reason: "Request thuộc Security phải qua security/reviewer flow.",
  question:
    "Security owner xác nhận asset, evidence, impact và requested action cụ thể nào?",
};

export const guidanceRules = [
  {
    id: "GUIDE-001",
    labels: ["DEVICE_SHUTDOWN_GUIDANCE", "DEVICE_RESTART_GUIDANCE"],
    topic: "restart",
  },
  {
    id: "GUIDE-002",
    labels: [
      "DEVICE_FREEZE",
      "DEVICE_WONT_BOOT",
      "DEVICE_SLOW",
      "DEVICE_CRASH",
      "DEVICE_BATTERY",
    ],
    topic: "device",
  },
  {
    id: "GUIDE-003",
    labels: ["VPN_SETUP", "VPN_LOGIN", "VPN_NOT_CONNECTING"],
    topic: "vpn",
  },
  {
    id: "GUIDE-004",
    labels: [
      "WIFI_NOT_WORKING",
      "NETWORK_UNREACHABLE",
      "DNS_RESOLUTION",
      "BANDWIDTH_ISSUE",
      "CERTIFICATE_ERROR",
    ],
    topic: "wifi",
  },
  {
    id: "GUIDE-005",
    labels: [
      "APPROVED_CATALOG_LOOKUP",
      "SOFTWARE_CRASH",
      "SOFTWARE_COMPATIBILITY",
      "SOFTWARE_PERFORMANCE",
      "LICENSE_ACTIVATION",
    ],
    topic: "software",
  },
  {
    id: "GUIDE-006",
    labels: [
      "ACCOUNT_LOGIN",
      "ACCOUNT_LOCKED",
      "PASSWORD_RESET",
      "MFA_SETUP",
      "MFA_FAILURE",
      "SSO_FAILURE",
    ],
    topic: "account",
  },
  {
    id: "GUIDE-007",
    labels: [
      "DEVICE_PRINTER",
      "DEVICE_DISPLAY",
      "DEVICE_AUDIO",
      "DEVICE_CAMERA",
    ],
    topic: "peripherals",
  },
  {
    id: "GUIDE-008",
    labels: [
      "GENERAL_HOW_TO",
      "DATABASE_QUERY_HELP",
      "GIT_HELP",
      "COMPLIANCE_QUESTION",
    ],
    topic: "general",
  },
] as const;
export type GuidanceTopic = (typeof guidanceRules)[number]["topic"];
