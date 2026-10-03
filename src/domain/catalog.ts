import type { ServiceGroup } from "./contracts";

type Service = {
  label: string;
  team: string;
  labels: string[];
  fields: string[];
};
const words = (text: string) => text.split(" ");
export const catalog: Record<ServiceGroup, Service> = {
  DEVICE_BOOT: {
    label: "Máy tính & thiết bị",
    team: "IT Helpdesk",
    labels: words(
      "DEVICE_SHUTDOWN_GUIDANCE DEVICE_RESTART_GUIDANCE DEVICE_RESET_GUIDANCE DEVICE_FACTORY_RESET DEVICE_WONT_BOOT DEVICE_FREEZE DEVICE_SLOW DEVICE_CRASH DEVICE_UPDATE_DRIVER DEVICE_BATTERY DEVICE_DISPLAY DEVICE_AUDIO DEVICE_CAMERA DEVICE_PRINTER DEVICE_LOST_STOLEN DEVICE_REPLACEMENT DEVICE_WIPE",
    ),
    fields: words(
      "deviceType ownership symptom requestedAction deviceId location urgency dataLossRisk backup",
    ),
  },
  ACCOUNT_ACCESS: {
    label: "Tài khoản & quyền truy cập",
    team: "IAM/IT",
    labels: words(
      "ACCOUNT_LOGIN ACCOUNT_LOCKED PASSWORD_RESET MFA_SETUP MFA_FAILURE SSO_FAILURE REQUEST_STANDARD_ACCESS REQUEST_READ_ACCESS REQUEST_WRITE_ACCESS REQUEST_ADMIN_ACCESS REQUEST_ROOT_ACCESS GROUP_MEMBERSHIP ROLE_CHANGE REVOKE_ACCESS SERVICE_ACCOUNT ACCOUNT_DEACTIVATION",
    ),
    fields: words(
      "targetSystem environment accessType duration reason approvalStatus approvalReference",
    ),
  },
  DATABASE: {
    label: "Cơ sở dữ liệu",
    team: "DBA/Data",
    labels: words(
      "DATABASE_CONNECTION DATABASE_READ_ACCESS DATABASE_WRITE_ACCESS DATABASE_QUERY_HELP DATABASE_QUERY_ERROR DATABASE_PERFORMANCE DATABASE_PROVISION DATABASE_SCHEMA_CHANGE DATABASE_DATA_CORRECTION DATABASE_EXPORT DATABASE_IMPORT DATABASE_BACKUP DATABASE_RESTORE DATABASE_MIGRATION DATABASE_PRODUCTION_INCIDENT",
    ),
    fields: words(
      "databaseType system resourceScope environment operation permission dataSensitivity dataVolume destination duration rollbackPlan approvalReference reason",
    ),
  },
  NETWORK_VPN: {
    label: "Mạng, VPN & DNS",
    team: "Network",
    labels: words(
      "VPN_SETUP VPN_LOGIN VPN_NOT_CONNECTING WIFI_NOT_WORKING NETWORK_UNREACHABLE DNS_RESOLUTION DNS_CHANGE PROXY_CONFIG FIREWALL_DIAGNOSTIC FIREWALL_CHANGE PORT_OPEN_REQUEST PUBLIC_EXPOSURE REMOTE_ACCESS BANDWIDTH_ISSUE CERTIFICATE_ERROR",
    ),
    fields: words(
      "service source target environment protocol port publicExposure requestedAction affectedUsers symptom urgency",
    ),
  },
  SOFTWARE_LICENSE: {
    label: "Phần mềm & bản quyền",
    team: "IT",
    labels: words(
      "SOFTWARE_INSTALL SOFTWARE_UPDATE SOFTWARE_UNINSTALL SOFTWARE_CRASH SOFTWARE_COMPATIBILITY SOFTWARE_PERFORMANCE LICENSE_ACTIVATION LICENSE_REQUEST APPROVED_CATALOG_LOOKUP BROWSER_EXTENSION UNSIGNED_SOFTWARE UNAPPROVED_SOFTWARE DEVELOPER_TOOL_SETUP",
    ),
    fields: words(
      "software version os requestedAction approvedCatalogStatus installationSource licenseDuration licenseType businessPurpose approvalReference",
    ),
  },
  CLOUD_GPU: {
    label: "Máy chủ đám mây & GPU",
    team: "Cloud/ML Infra",
    labels: words(
      "CLOUD_SANDBOX CLOUD_VM_REQUEST GPU_REQUEST GPU_QUOTA GPU_CAPACITY CLOUD_STORAGE CLOUD_COST CLOUD_BUDGET PUBLIC_IP RESOURCE_SCALE RESOURCE_DELETE CLOUD_CREDENTIAL",
    ),
    fields: words(
      "provider resourceType gpuType quantity cpu ram disk environment duration publicIp purpose budgetOrQuota estimatedCost cleanupPlan approvalStatus approvalReference",
    ),
  },
  KUBERNETES: {
    label: "Nền tảng Kubernetes",
    team: "Platform",
    labels: words(
      "K8S_VIEW_LOGS K8S_VIEW_METRICS K8S_RESTART_POD K8S_SCALE_WORKLOAD K8S_NAMESPACE_REQUEST K8S_DEPLOY K8S_MANIFEST_CHANGE K8S_ROLLBACK K8S_EXEC_POD K8S_CLUSTER_ACCESS K8S_SECRET_ACCESS K8S_INGRESS_CHANGE K8S_CLUSTER_ADMIN",
    ),
    fields: words(
      "cluster namespace workload environment requestedAction privilegeLevel duration rollbackPlan secretAccess",
    ),
  },
  CI_CD: {
    label: "CI/CD & triển khai",
    team: "DevOps",
    labels: words(
      "PIPELINE_VIEW_LOGS PIPELINE_RERUN PIPELINE_FAILED PIPELINE_PERMISSION PIPELINE_CONFIG_CHANGE STAGING_DEPLOY PRODUCTION_DEPLOY PRODUCTION_ROLLBACK SECRET_UPDATE RELEASE_APPROVAL BYPASS_APPROVAL_GATE",
    ),
    fields: words(
      "repository pipeline environment requestedAction reason branchOrTag configChange secretChange rollbackPlan approvalReference",
    ),
  },
  MONITORING: {
    label: "Giám sát & sự cố",
    team: "SRE",
    labels: words(
      "MONITORING_VIEW_LOGS MONITORING_VIEW_METRICS ALERT_NOT_RECEIVED ALERT_FALSE_POSITIVE ALERT_THRESHOLD ALERT_ROUTING INCIDENT_REPORT INCIDENT_TRIAGE SERVICE_DEGRADED SERVICE_OUTAGE P1_INCIDENT P2_INCIDENT SLO_BREACH",
    ),
    fields: words(
      "service alertId symptom startTime timeWindow dashboardOrLogSource affectedScope severity requestedAction environment urgency",
    ),
  },
  STORAGE: {
    label: "Lưu trữ & sao lưu",
    team: "Storage/Data",
    labels: words(
      "STORAGE_ACCESS STORAGE_QUOTA FILE_SHARE BUCKET_ACCESS BACKUP_REQUEST BACKUP_FAILURE RESTORE_REQUEST DATA_RECOVERY DATA_DELETE DATA_RETENTION DATA_EXPORT ARCHIVE_REQUEST",
    ),
    fields: words(
      "storageType pathOrBucket operation dataSensitivity destination retention productionData approvalReference",
    ),
  },
  SECURITY: {
    label: "Bảo mật & quy định",
    team: "Security",
    labels: words(
      "PHISHING_REPORT MALWARE_SUSPECTED SUSPICIOUS_LOGIN LOST_DEVICE_SECURITY SECRET_EXPOSURE CREDENTIAL_LEAK VULNERABILITY_REPORT POLICY_EXCEPTION MFA_DISABLE_REQUEST EDR_DISABLE_REQUEST SECURITY_INCIDENT DATA_BREACH AUDIT_EVIDENCE COMPLIANCE_QUESTION",
    ),
    fields: words(
      "asset assetOrService environment incidentType issue evidence detectedAt impact requestedAction urgency containmentRequested containsSecret containsCustomerData reporterContact approvalReference incidentId",
    ),
  },
  GIT_PERMISSION: {
    label: "Kho mã nguồn Git",
    team: "DevOps",
    labels: words("GIT_READ_ACCESS GIT_WRITE_ACCESS GIT_ADMIN_ACCESS GIT_HELP"),
    fields: words(
      "provider repository environment permission duration reason approvalReference",
    ),
  },
  OTHER: {
    label: "Khác / chưa rõ nhóm",
    team: "Classifier/reviewer",
    labels: words(
      "UNKNOWN_SUPPORT_REQUEST GENERAL_HOW_TO CROSS_FUNCTION_REQUEST UNCLASSIFIED_ACCESS UNCLASSIFIED_INCIDENT UNCLASSIFIED_CHANGE REQUEST_CLASSIFICATION_HELP",
    ),
    fields: words(
      "summary targetServiceOrDevice environmentIfKnown desiredOutcome reason urgency",
    ),
  },
};

export const commonFields = words(
  "impact environment urgency desiredOutcome approvalStatus dataSensitivity department employeeId",
);
export const fieldOptions: Record<string, string[]> = {
  department: [
    "it",
    "engineering",
    "product",
    "sales",
    "marketing",
    "finance",
    "human_resources",
    "operations",
    "other",
  ],
  resetType: ["unknown", "restart", "factory_reset"],
  environment: ["unknown", "sandbox", "development", "staging", "production"],
  environmentIfKnown: [
    "unknown",
    "sandbox",
    "development",
    "staging",
    "production",
  ],
  deviceType: ["Laptop", "Desktop", "Monitor", "Printer", "Mobile", "Other"],
  ownership: ["Unknown", "Personal", "Corporate", "Shared"],
  requestedAction: [
    "guidance",
    "diagnose",
    "restart",
    "repair",
    "boot_assistance",
    "diagnosis",
    "hardware_check",
    "replace",
    "wipe",
    "view_logs",
    "view_metrics",
    "investigate",
    "rerun",
    "scale",
    "deploy",
    "change",
  ],
  accessType: ["read-only", "standard", "write", "admin", "root", "owner"],
  permission: [
    "read-only",
    "read",
    "triage",
    "write",
    "admin",
    "root",
    "owner",
    "maintain",
  ],
  privilegeLevel: ["read-only", "standard", "admin", "cluster-admin"],
  operation: [
    "read",
    "write",
    "provision",
    "query_help",
    "export",
    "import",
    "backup",
    "restore",
    "delete",
    "change",
  ],
  urgency: ["normal", "low", "high", "critical"],
  approvalStatus: ["not_provided", "claimed", "pending"],
  dataSensitivity: [
    "unknown",
    "synthetic",
    "internal",
    "customer",
    "confidential",
  ],
  dataLossRisk: ["Unknown", "No", "Yes"],
  backup: ["Unknown", "No", "Yes"],
  publicExposure: ["unknown", "no", "yes"],
  publicIp: ["unknown", "no", "yes"],
  secretAccess: ["unknown", "no", "yes"],
  containsSecret: ["unknown", "no", "yes"],
  containsCustomerData: ["unknown", "no", "yes"],
  productionData: ["unknown", "no", "yes"],
  configChange: ["unknown", "no", "yes"],
  secretChange: ["unknown", "no", "yes"],
  approvedCatalogStatus: ["unknown", "approved", "unapproved"],
  protocol: ["TCP", "UDP", "HTTPS", "SSH", "RDP", "Other"],
};
export const fieldLabels: Record<string, string> = {
  department: "Phòng ban",
  employeeId: "Mã nhân viên",
  impact: "Mức độ ảnh hưởng",
  urgency: "Mức độ khẩn cấp",
  desiredOutcome: "Bạn muốn đạt được điều gì",
  dataSensitivity: "Loại dữ liệu",
  deviceType: "Loại thiết bị",
  dataLossRisk: "Có nguy cơ mất dữ liệu không",
  backup: "Đã sao lưu chưa",
  accessType: "Quyền cần dùng",
  databaseType: "Loại cơ sở dữ liệu",
  operation: "Việc cần làm",
  dataVolume: "Dung lượng dữ liệu",
  destination: "Nơi nhận dữ liệu",
  rollbackPlan: "Cách khôi phục nếu có lỗi",
  source: "Máy hoặc mạng nguồn",
  target: "Máy hoặc dịch vụ đích",
  protocol: "Giao thức kết nối",
  port: "Cổng kết nối",
  publicExposure: "Cho phép truy cập từ Internet",
  affectedUsers: "Những người bị ảnh hưởng",
  software: "Tên phần mềm",
  version: "Phiên bản",
  os: "Hệ điều hành",
  approvedCatalogStatus: "Phần mềm có trong danh mục được phép không",
  installationSource: "Nguồn cài đặt",
  licenseDuration: "Thời hạn sử dụng bản quyền",
  businessPurpose: "Mục đích công việc",
  provider: "Nhà cung cấp",
  resourceType: "Loại tài nguyên",
  gpuType: "Loại GPU",
  quantity: "Số lượng",
  cpu: "Số lõi xử lý",
  ram: "Bộ nhớ (GB)",
  disk: "Ổ đĩa (GB)",
  publicIp: "Cần địa chỉ Internet công khai",
  purpose: "Mục đích sử dụng",
  estimatedCost: "Chi phí dự kiến (USD)",
  cleanupPlan: "Kế hoạch thu hồi tài nguyên",
  cluster: "Cụm máy chủ",
  namespace: "Không gian làm việc",
  workload: "Ứng dụng cần xử lý",
  privilegeLevel: "Mức quyền",
  secretAccess: "Cần truy cập thông tin bí mật",
  repository: "Kho mã nguồn",
  pipeline: "Quy trình triển khai",
  branchOrTag: "Nhánh hoặc phiên bản",
  configChange: "Có thay đổi cấu hình",
  secretChange: "Có thay đổi thông tin bí mật",
  service: "Dịch vụ",
  alertId: "Mã cảnh báo",
  startTime: "Thời điểm bắt đầu lỗi",
  affectedScope: "Phạm vi ảnh hưởng",
  severity: "Mức nghiêm trọng",
  storageType: "Loại lưu trữ",
  pathOrBucket: "Thư mục hoặc vùng lưu trữ",
  retention: "Thời gian lưu giữ",
  productionData: "Có dữ liệu đang vận hành thật",
  asset: "Thiết bị hoặc hệ thống liên quan",
  incidentType: "Loại sự cố",
  evidence: "Dấu hiệu quan sát được",
  detectedAt: "Thời điểm phát hiện",
  containmentRequested: "Biện pháp ngăn chặn mong muốn",
  containsSecret: "Có chứa thông tin bí mật",
  containsCustomerData: "Có chứa dữ liệu khách hàng",
  reporterContact: "Cách liên hệ người báo",
  summary: "Tóm tắt vấn đề",
  targetServiceOrDevice: "Dịch vụ hoặc thiết bị cần hỗ trợ",
  environmentIfKnown: "Môi trường (nếu biết)",
  verifiedApproval: "Phê duyệt được xác minh",

  intentLabel: "Nhu cầu cụ thể",
  system: "Hệ thống",
  targetSystem: "Hệ thống đích",
  resourceScope: "Phạm vi tài nguyên",
  environment: "Môi trường",
  duration: "Thời hạn",
  approvalReference: "Mã phê duyệt (cần xác minh)",
  approvalStatus: "Thông tin phê duyệt",
  permission: "Quyền yêu cầu",
  deviceId: "Mã thiết bị",
  location: "Vị trí",
  requestedAction: "Thao tác mong muốn",
  ownership: "Thiết bị thuộc ai",
  symptom: "Triệu chứng",
  reason: "Lý do",
  incidentId: "Mã sự cố",
  resetType: "Cách đặt lại máy",
  budgetOrQuota: "Quota/budget đã kiểm tra",
  licenseType: "Loại license",
  timeWindow: "Khoảng thời gian quan sát",
  dashboardOrLogSource: "Dashboard/log source/alert ID",
  assetOrService: "Asset hoặc service bị ảnh hưởng",
  issue: "Vấn đề hoặc nghi vấn",
};
export function labelForField(name: string) {
  return fieldLabels[name] ?? name.replace(/([A-Z])/g, " $1");
}
export const allFields = new Set([
  "intentLabel",
  "symptom",
  "resetType",
  ...commonFields,
  ...Object.values(catalog).flatMap((service) => service.fields),
]);
export function validIntent(group: ServiceGroup, intent: string) {
  return catalog[group].labels.includes(intent);
}
