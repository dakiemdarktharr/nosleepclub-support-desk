import { questionFor, clarificationPlan } from "./questions";
import type {
  ApprovalScope,
  ApprovalStatus,
  CanonicalRequest,
  Decision,
  RiskSignal,
} from "./contracts";

import {
  approvalPolicy,
  bucketPriority,
  guidanceRules,
  manualReviewRules,
  POLICY_VERSION,
  productionDatabaseRule,
  productionExportAuthorityRule,
  provisioningInformationRule,
  requiredFactRules,
  resourceQuotaPolicy,
  riskRules,
  securityServiceRule,
  singleRequestPolicy,
} from "./policy-source";
import { normalize, normalizeFact, teamFor } from "./text";

// Verified approval is supplied by a server-only verifier, never by input fields or model output.
export type Approval = {
  status: ApprovalStatus;
  verificationContext?: "demo-ui-mock" | "benchmark" | "production";
  reason?: string;
  reference?: string;
  authorizedRole?: string;
  scope?: ApprovalScope;
  scopeLevel?: "exact" | "parent";
  parentScopeDeclared?: boolean;
  registryStatus?: "verified" | "pending" | "missing" | "mismatched";
  itsmStatus?: "approved" | "pending" | "rejected" | "revoked" | "missing" | "mismatched";
  sameRecord?: boolean;
  requesterMatched?: boolean;
  approverIdentityVerified?: boolean;
  approverAuthorized?: boolean;
  approverIsRequester?: boolean;
  delegatedApprover?: boolean;
  environmentAndPurposeMatched?: boolean;
  permissionEqualOrNarrower?: boolean;
  quotaAndTtlMatched?: boolean;
  standingApproval?: boolean;
  standingScopeDeclared?: boolean;
  standingRecordActive?: boolean;
};
type ApprovalResolver = (request: CanonicalRequest) => Approval;

export type PolicyEvidence = {
  entitlement?: {
    status: "allowed" | "denied" | "unknown";
    scope: "matched" | "mismatched" | "unknown";
    requesterAuthenticated: boolean;
    requesterIdentityMatched: boolean;
    source?: string;
  };
  resourceQuota?: {
    status: "within_limit" | "exceeded" | "unavailable";
    source?: string;
    projectId?: string;
    teamId?: string;
    activeUsageIncluded?: boolean;
    evaluationComplete?: boolean;
  };
  accessTtlWithinPolicy?: boolean;
  endpointManaged?: "verified" | "unmanaged" | "unknown";
  vpnSubnet?: "approved" | "denied" | "unknown";
  vpnDurationWithinPolicy?: boolean;
  breakGlass?: {
    status: "verified" | "invalid" | "unknown";
    incidentId?: string;
    scopeNarrowVerified?: boolean;
    shortTtlVerified?: boolean;
    auditAndAlertEnabled?: boolean;
    postReviewRequired?: boolean;
  };
  dataClassification?:
    | "synthetic"
    | "non_sensitive"
    | "ordinary"
    | "customer"
    | "confidential"
    | "sensitive"
    | "restricted"
    | "regulated"
    | "unknown";
  secretExposureExcluded?: boolean;
};
type PolicyEvidenceResolver = (request: CanonicalRequest) => PolicyEvidence;

const cloudProvisioningIntentLabels = new Set([
  "CLOUD_SANDBOX",
  "CLOUD_VM_REQUEST",
  "GPU_REQUEST",
]);

const cloudSandboxIntentLabels = new Set(["CLOUD_SANDBOX", "GPU_REQUEST"]);

function isEphemeralCloudSandbox(request: CanonicalRequest) {
  return (
    cloudSandboxIntentLabels.has(request.intentLabel) &&
    ["sandbox", "development", "staging"].includes(request.environment) &&
    ["ephemeral", "temporary"].includes(
      normalizeFact(request.entities.resourceLifecycle ?? ""),
    )
  );
}

function isCloudProvisioningRequest(request: CanonicalRequest) {
  return request.serviceGroup === "CLOUD_GPU" &&
    cloudProvisioningIntentLabels.has(request.intentLabel);
}

function isGuidanceOnly(request: CanonicalRequest) {
  return (
    ["GUIDANCE", "SAFE_DIAGNOSTIC"].includes(request.requestKind) &&
    ["guidance", "diagnose", "restart", "query_help", "view_logs"].includes(
      request.requestedAction,
    )
  );
}

const placeholder =
  /^(unknown|chua biet|khong biet|bat ky|default|gap|urgent|any|all|not provided|n\/a)$/i;

function isMissing(field: string, value?: string) {
  if (!value?.trim() || placeholder.test(normalize(value))) return true;
  if (field === "duration") {
    const interval = !/^[-−–]/.test(value.trim().normalize("NFKC")) && /^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)\s*(?:hours?|hrs?|h|days?|minutes?|phut)$/.test(
      normalizeFact(value),
    );
    const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.trim()) &&
      Number.isFinite(Date.parse(value.trim())) &&
      new Date(`${value.trim().slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.trim().slice(0, 10);
    if (!interval && !timestamp) return true;
  }
  if (
    field === "reason" &&
    (/^(debug|test|needed|can gap|khac phuc|support)$/i.test(
      normalize(value),
    ) ||
      value.trim().length < 8)
  )
    return true;
  if (
    field === "resourceScope" &&
    /^(all|everything|toan bo)$/i.test(normalize(value))
  )
    return true;
  return false;
}

function requiredFactRuleFor(request: CanonicalRequest) {
  return requiredFactRules.find((rule) =>
    rule.serviceGroup === request.serviceGroup && rule.requestKinds.includes(request.requestKind) &&
    rule.intentLabels.includes(request.intentLabel) &&
    (!rule.systems || rule.systems.includes(normalize(request.entities.targetSystem || request.entities.system || ""))),
  );
}

export function missingFacts(request: CanonicalRequest): string[] {
  const { entities: e, serviceGroup, requestKind } = request;
  if (request.intentLabel === "DEVICE_RESET_GUIDANCE") return ["resetType"];
  const guide = guidanceRules.find((rule) =>
    rule.labels.some((label) => label === request.intentLabel),
  );
  if (guide && isGuidanceOnly(request)) return request.missingFields;

  let required: string[];
  switch (serviceGroup) {
    case "DATABASE":
      required = [
        "system",
        "resourceScope",
        "environment",
        "permission",
        "duration",
        "reason",
      ];
      break;
    case "ACCOUNT_ACCESS":
      required = [
        "targetSystem",
        "environment",
        "accessType",
        "duration",
        "reason",
      ];
      break;
    case "GIT_PERMISSION":
      required = ["provider", "repository", "permission", "duration", "reason"];
      break;
    case "CLOUD_GPU":
      required = cloudProvisioningIntentLabels.has(request.intentLabel)
        ? [
            "provider",
            "environment",
            "duration",
            "purpose",
            ...(/GPU/.test(request.intentLabel)
              ? ["gpuType", "quantity"]
              : ["cpu", "ram", "disk"]),
            ...(cloudSandboxIntentLabels.has(request.intentLabel)
              ? ["resourceLifecycle", "dataSensitivity"]
              : []),
          ]
        : [];
      break;
    case "DEVICE_BOOT":
      required = [
        "deviceId",
        "location",
        "symptom",
        "urgency",
        "requestedAction",
      ];
      break;
    case "NETWORK_VPN":
      required = [
        "service",
        "source",
        "target",
        "environment",
        "symptom",
        "requestedAction",
        "urgency",
        ...(/PORT|FIREWALL|PUBLIC|REMOTE/.test(request.intentLabel) ||
        Boolean(e.protocol)
          ? ["port"]
          : []),
      ];
      break;
    case "KUBERNETES":
      required = [
        "cluster",
        "namespace",
        "workload",
        "environment",
        "requestedAction",
        ...(["restart", "scale"].includes(request.requestedAction)
          ? ["duration"]
          : []),
      ];
      break;
    case "CI_CD":
      required = [
        "repository",
        "pipeline",
        "environment",
        "requestedAction",
        "reason",
      ];
      break;
    case "MONITORING":
      required = [
        "service",
        "environment",
        "symptom",
        "timeWindow",
        "dashboardOrLogSource",
        "requestedAction",
        "urgency",
      ];
      break;
    case "SOFTWARE_LICENSE":
      required = [
        "software",
        "version",
        "os",
        "approvedCatalogStatus",
        "businessPurpose",
        "licenseDuration",
        "licenseType",
      ];
      break;
    case "STORAGE":
      required = [
        "pathOrBucket",
        "operation",
        "dataSensitivity",
        "destination",
      ];
      break;
    case "SECURITY":
      required = [
        "assetOrService",
        "environment",
        "issue",
        "evidence",
        "requestedAction",
        "urgency",
        "reporterContact",
      ];
      break;
    default:
      required = [
        "summary",
        "targetServiceOrDevice",
        "environmentIfKnown",
        "desiredOutcome",
        "reason",
        "urgency",
      ];
  }
  // Only ask facts that can change this intent's decision; never demand access fields for diagnosis.
  const intent = request.intentLabel;
  if (/DATABASE_(CONNECTION|QUERY_ERROR|PERFORMANCE)/.test(intent))
    required = ["system", "environment", "symptom"];
  else if (
    /DATABASE_(BACKUP|RESTORE|EXPORT|IMPORT|MIGRATION|SCHEMA_CHANGE|DATA_CORRECTION)/.test(
      intent,
    )
  )
    required = [
      "system",
      "resourceScope",
      "environment",
      "operation",
      "dataSensitivity",
      ...(/EXPORT|BACKUP/.test(intent) ? ["destination"] : ["rollbackPlan"]),
    ];
  else if (/PIPELINE_(FAILED|VIEW_LOGS|RERUN)/.test(intent))
    required = ["repository", "pipeline", "environment"];
  else if (/K8S_VIEW_(LOGS|METRICS)/.test(intent))
    required = ["cluster", "namespace", "workload", "environment"];
  else if (/MONITORING_VIEW/.test(intent))
    required = ["service", "environment"];
  else if (
    /PORT_OPEN_REQUEST|FIREWALL_CHANGE|REMOTE_ACCESS|PUBLIC_EXPOSURE/.test(
      intent,
    )
  )
    required = ["source", "target", "port", "protocol", "environment"];
  else if (/SOFTWARE_(CRASH|PERFORMANCE|COMPATIBILITY)/.test(intent))
    required = ["software", "os", "symptom"];
  else if (/LICENSE_/.test(intent))
    required = ["software", "licenseDuration", "businessPurpose"];
  else if (/BACKUP_REQUEST|BACKUP_FAILURE/.test(intent))
    required = ["pathOrBucket", "dataSensitivity", "destination"];
  else if (/RESTORE_REQUEST|DATA_RECOVERY/.test(intent))
    required = ["pathOrBucket", "dataSensitivity", "desiredOutcome"];
  else if (/STORAGE_ACCESS|BUCKET_ACCESS/.test(intent))
    required = ["pathOrBucket", "permission", "duration", "reason"];
  else if (requestKind === "INCIDENT")
    required = ["symptom", "affectedScope", "startTime"];
  const contract = requiredFactRuleFor(request);
  if (contract) required = [...contract.fields];
  return [
    ...new Set([
      ...required.filter((field) => isMissing(field, e[field])),
      ...request.missingFields,
    ]),
  ];
}

function requestedPermission(request: CanonicalRequest) {
  return normalizeFact(
    request.entities.permission ?? request.entities.accessType ?? "",
  );
}

function hasSensitiveData(request: CanonicalRequest, evidence?: PolicyEvidence) {
  const classification = normalizeFact(request.entities.dataSensitivity ?? "")
    .replace(/[-_]/g, " ");
  const verifiedClassification = evidence?.dataClassification;
  const userClassificationIsSensitive =
    !/\b(?:non|not)\s+(?:sensitive|restricted|regulated)\b/.test(classification) &&
    /\b(?:sensitive|restricted|regulated|pii|personal|customer|secret|confidential)\b/.test(classification);
  return (
    userClassificationIsSensitive ||
    ["customer", "confidential", "sensitive", "restricted", "regulated"].includes(
      verifiedClassification ?? "unknown",
    )
  );
}

function isGitHubActionsRequest(request: CanonicalRequest) {
  const target = normalizeFact(
    [
      request.entities.provider,
      request.entities.targetSystem,
      request.entities.pipeline,
      request.entities.requestedAction,
      request.intentLabel,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return /github/.test(target) && /actions|workflow|pipeline/.test(target);
}

function isGitHubWorkflowChange(request: CanonicalRequest) {
  return (
    request.serviceGroup === "CI_CD" &&
    isGitHubActionsRequest(request) &&
    (/WORKFLOW|SECRET|PIPELINE_CONFIG_CHANGE|SECRET_UPDATE/.test(request.intentLabel) ||
      /workflow|secret|pipeline/.test(normalizeFact(request.requestedAction)) &&
      /change|edit|write|update|modify/.test(normalizeFact(request.requestedAction)))
  );
}

function isDataExportRequest(request: CanonicalRequest) {
  return (
    request.riskSignals.includes("DATA_EXPORT") ||
    /EXPORT/.test(request.intentLabel) ||
    normalizeFact(request.requestedAction) === "export" ||
    normalizeFact(request.entities.operation ?? "") === "export"
  );
}

export function requiresApproval(request: CanonicalRequest) {
  const vpnRoutineAccess =
    request.serviceGroup === "NETWORK_VPN" &&
    request.intentLabel === "VPN_SETUP" &&
    request.requestKind === "ACCESS_REQUEST";
  const productionScope =
    request.environment === "production" && !vpnRoutineAccess;
  const elevatedPermission = /^(admin|root|owner|cluster-admin)$/.test(
    requestedPermission(request),
  );
  const routineSandbox = isEphemeralCloudSandbox(request);

  return (
    request.riskSignals.some(
      (signal) =>
        [
          "PRIVILEGED",
          "PRODUCTION_CHANGE",
          "CONTROL_CHANGE",
          "DESTRUCTIVE",
          "DATA_EXPORT",
        ].includes(signal) &&
        !(vpnRoutineAccess && signal === "PRODUCTION_CHANGE"),
    ) ||
    elevatedPermission ||
    productionScope ||
    isDataExportRequest(request) ||
    hasSensitiveData(request) ||
    isGitHubWorkflowChange(request) ||
    (isCloudProvisioningRequest(request) && !routineSandbox) ||
    (request.serviceGroup === "SOFTWARE_LICENSE" &&
      request.requestKind !== "GUIDANCE" &&
      request.requestKind !== "SAFE_DIAGNOSTIC")
  );
}

function requiresEntitlement(request: CanonicalRequest) {
  return (
    request.requestKind === "ACCESS_REQUEST" ||
    /ACCESS|PERMISSION|MEMBERSHIP|ROLE_CHANGE/.test(request.intentLabel) ||
    request.serviceGroup === "GIT_PERMISSION" ||
    isGitHubWorkflowChange(request) ||
    (request.serviceGroup === "CI_CD" &&
      /VIEW_LOGS|LOGS/.test(request.intentLabel))
  );
}

function hasVerifiedEntitlement(evidence: PolicyEvidence) {
  return (
    evidence.entitlement?.status === "allowed" &&
    evidence.entitlement.scope === "matched" &&
    evidence.entitlement.requesterAuthenticated &&
    evidence.entitlement.requesterIdentityMatched &&
    Boolean(evidence.entitlement.source?.trim())
  );
}

function hasRoutineAccessTtl(request: CanonicalRequest, evidence: PolicyEvidence) {
  if (
    request.serviceGroup === "NETWORK_VPN" &&
    request.intentLabel === "VPN_SETUP"
  )
    return evidence.vpnDurationWithinPolicy === true;
  return evidence.accessTtlWithinPolicy === true;
}

function hasAuthoritativeQuota(evidence: PolicyEvidence) {
  const quota = evidence.resourceQuota;
  return Boolean(
    quota?.source?.trim() &&
      quota.projectId?.trim() &&
      quota.teamId?.trim() &&
      quota.activeUsageIncluded &&
      quota.evaluationComplete,
  );
}

function selfApprovalAllowed(approval: Approval) {
  if (approval.verificationContext === "demo-ui-mock")
    return approvalPolicy.selfApproval.demoUiMockAllowed;
  if (approval.verificationContext === "benchmark")
    return approvalPolicy.selfApproval.benchmarkAllowed;
  if (approval.verificationContext === "production")
    return approvalPolicy.selfApproval.productionAllowed;
  return false;
}

function verifiedApproval(approval: Approval) {
  return (
    approval.status === "verified" &&
    approval.scope === "matched" &&
    (approval.scopeLevel !== "parent" || approval.parentScopeDeclared === true) &&
    approval.registryStatus === "verified" &&
    approval.itsmStatus === "approved" &&
    approval.sameRecord === true &&
    approval.requesterMatched === true &&
    approval.approverIdentityVerified === true &&
    approval.approverAuthorized === true &&
    (approval.approverIsRequester === false ||
      (approval.approverIsRequester === true &&
        selfApprovalAllowed(approval))) &&
    approval.delegatedApprover === false &&
    approval.environmentAndPurposeMatched === true &&
    approval.permissionEqualOrNarrower === true &&
    approval.quotaAndTtlMatched === true &&
    (approval.standingApproval !== true ||
      (approval.standingScopeDeclared === true &&
        approval.standingRecordActive === true))
  );
}

function approvalRoleMatches(approval: Approval, rolePattern: RegExp) {
  return (
    verifiedApproval(approval) &&
    rolePattern.test(normalizeFact(approval.authorizedRole ?? ""))
  );
}

function approvalRoleForRule(ruleId: string) {
  if (ruleId.startsWith("SEC-")) return /security/;
  if (ruleId === "AUTH-001" || ruleId === "AUTH-DB-PROVISION-001")
    return /dba|database.?owner|data.?owner/;
  if (ruleId === "AUTH-EXPORT-001") return /data.?owner|dba/;
  if (ruleId === "AUTH-002") return /resource.?owner|system.?owner|production.?owner/;
  if (ruleId === "AUTH-003") return /iam|system.?owner|resource.?owner|security/;
  if (ruleId === "AUTH-004") return /control.?owner|capacity.?owner|quota.?owner|budget.?owner|security/;
  if (ruleId === "AUTH-QUOTA") return /capacity.?owner|quota.?owner|budget.?owner/;
  if (ruleId === "AUTH-VPN-001") return /network.?owner|vpn.?owner|network/;
  if (ruleId === "AUTH-COLLAB-001") return /resource.?owner|system.?owner|iam/;
  if (ruleId === "AUTH-010") return /security/;
  if (ruleId === "AUTH-008") return /admin|dba|resource.?owner|database.?owner/;
  return undefined;
}

function requiredApprovalRole(request: CanonicalRequest, evidence: PolicyEvidence) {
  if (request.riskSignals.some((signal) =>
    ["SECRET", "PUBLIC_EXPOSURE", "SECURITY_CONTROL", "BYPASS", "INJECTION", "UNAPPROVED_SOFTWARE"].includes(signal),
  ))
    return /security/;
  if (isDataExportRequest(request))
    return hasSensitiveData(request, evidence)
      ? /data.?owner|security/
      : /data.?owner|dba/;
  if (hasSensitiveData(request, evidence))
    return /data.?owner|security/;
  if (isGitHubWorkflowChange(request))
    return /security/;
  if (isCloudProvisioningRequest(request))
    return /capacity.?owner|quota.?owner|budget.?owner|cloud.?owner|resource.?owner/;
  if (request.serviceGroup === "DATABASE")
    return /dba|database.?owner|data.?owner/;
  if (request.serviceGroup === "NETWORK_VPN")
    return /network.?owner|vpn.?owner|network|manager/;
  if (request.serviceGroup === "GIT_PERMISSION")
    return /repository.?owner|resource.?owner|iam|manager/;
  if (request.serviceGroup === "ACCOUNT_ACCESS")
    return /resource.?owner|system.?owner|iam|manager/;
  if (request.serviceGroup === "SOFTWARE_LICENSE")
    return /license.?owner|budget.?owner|software.?owner|manager/;
  if (request.environment === "production")
    return /production.?owner|service.?owner|resource.?owner|system.?owner/;
  return /iam|service.?owner|resource.?owner|system.?owner|manager/;
}

function approvalClearsRule(
  approval: Approval,
  rule: { id: string },
  request: CanonicalRequest,
  evidence: PolicyEvidence,
) {
  if (
    rule.id === "AUTH-009" &&
    request.requestKind === "INCIDENT" &&
    evidence.breakGlass?.status === "verified" &&
    Boolean(evidence.breakGlass.incidentId?.trim()) &&
    evidence.breakGlass.scopeNarrowVerified === true &&
    evidence.breakGlass.shortTtlVerified === true &&
    evidence.breakGlass.auditAndAlertEnabled === true &&
    evidence.breakGlass.postReviewRequired === true &&
    approvalRoleMatches(approval, /emergency.?approver|incident.?commander|on.?call/)
  )
    return true;
  const rolePattern = approvalRoleForRule(rule.id);
  // A single approver may hold several mapped roles; dual control is not required.
  return Boolean(rolePattern && approvalRoleMatches(approval, rolePattern));
}

function isVerifiedVpnPath(request: CanonicalRequest, evidence: PolicyEvidence) {
  return (
    request.serviceGroup === "NETWORK_VPN" &&
    request.intentLabel === "VPN_SETUP" &&
    request.requestKind === "ACCESS_REQUEST" &&
    hasVerifiedEntitlement(evidence) &&
    evidence.endpointManaged === "verified" &&
    evidence.vpnSubnet === "approved" &&
    evidence.vpnDurationWithinPolicy === true
  );
}

function entitlementDecision(base: Decision, status: "denied" | "unknown") {
  return {
    ...base,
    action: "ESCALATE" as const,
    handlingMode: "HUMAN_REVIEW" as const,
    bucket: "BEYOND_AUTHORITY" as const,
    uncertaintyClass: "AUTHORITY_REQUIRED" as const,
    riskLevel: "MEDIUM" as const,
    ruleIds: ["AUTH-ENTITLEMENT-001"],
    userReason:
      status === "denied"
        ? "Entitlement hiện tại không cho phép đúng resource và quyền yêu cầu."
        : "Chưa xác minh được entitlement của người gửi cho đúng resource và quyền yêu cầu.",
    adminReason:
      "AUTH-ENTITLEMENT-001: chỉ nguồn entitlement server-side khớp danh tính và scope mới cho phép AUTO.",
    reviewerQuestions: [
      "IAM xác nhận danh tính người gửi, resource, quyền và environment nào đang được entitlement cho phép?",
    ],
    questions: [],
    nextStep: "Chờ IAM xác minh entitlement; lời khai trong ticket không thay thế nguồn này.",
    assignedTeam: "IAM/IT / Resource owner",
  };
}

function accessTtlDecision(base: Decision): Decision {
  return {
    ...base,
    action: "ESCALATE",
    handlingMode: "HUMAN_REVIEW",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    riskLevel: "MEDIUM",
    ruleIds: ["AUTH-TTL-001"],
    questions: [],
    reviewerQuestions: [
      "Policy owner xác nhận TTL mặc định theo service và mức rủi ro nào cho quyền này?",
    ],
    userReason: "Chưa xác minh được thời hạn truy cập nằm trong policy của service và mức rủi ro.",
    adminReason: "AUTH-TTL-001: quyền routine chỉ AUTO khi nguồn policy xác nhận TTL; không dùng thời hạn tự khai thay cho policy.",
    nextStep: "IAM hoặc policy owner xác minh TTL trước khi cấp quyền.",
    assignedTeam: "IAM / Policy owner",
  };
}

function approverRoleDecision(base: Decision, approval: Approval): Decision {
  return {
    ...base,
    action: "ESCALATE",
    handlingMode: "HUMAN_REVIEW",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    riskLevel: "HIGH",
    ruleIds: ["AUTH-APPROVER-ROLE-001"],
    questions: [],
    reviewerQuestions: [
      "Xác minh approver có role mapping cho đúng resource, action và environment không?",
    ],
    userReason: "Approver không có thẩm quyền đã xác minh cho action và resource này.",
    adminReason:
      `AUTH-APPROVER-ROLE-001: role=${approval.authorizedRole ?? "unknown"}; danh tính, role mapping và scope phải do backend xác minh.`,
    nextStep: "Yêu cầu approver có thẩm quyền phù hợp; không nhận ủy quyền ngoài hệ thống.",
    assignedTeam: "Resource owner / IAM",
  };
}

function approvalStateDecision(base: Decision, approval: Approval): Decision {
  if (approval.status === "pending")
    return {
      ...base,
      action: "NEEDS_INFORMATION",
      handlingMode: "HUMAN_REVIEW",
      bucket: "BEYOND_AUTHORITY",
      uncertaintyClass: "AUTHORITY_REQUIRED",
      ruleIds: ["AUTH-APPROVAL-PENDING"],
      missingFields: [],
      questions: [],
      reviewerQuestions: [],
      userReason: "Approval đang chờ quyết định; yêu cầu được giữ lại và chưa thực hiện.",
      adminReason:
        "AUTH-APPROVAL-PENDING: chờ registry và ITSM cập nhật cùng approval record; đánh giá lại khi trạng thái đổi.",
      nextStep: "Giữ request chờ; không thực thi trước khi approval được xác minh.",
      assignedTeam: "Approver / IAM",
    };

  const revoked = approval.status === "revoked";
  const rejected = approval.status === "rejected";
  return {
    ...base,
    action: "ESCALATE",
    handlingMode: "HUMAN_REVIEW",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    ruleIds: [revoked ? "AUTH-APPROVAL-REVOKED" : rejected ? "AUTH-APPROVAL-REJECTED" : "AUTH-007"],
    missingFields: [],
    questions: [],
    reviewerQuestions: [
      revoked
        ? "Dừng phần chưa thực hiện và thu hồi quyền đã cấp khi có thể; record mới nào cho phép tiếp tục?"
        : rejected
          ? "Nếu scope hoặc approval thay đổi, hãy tạo request mới để xác minh lại."
          : "Xác minh record approval trên registry và ITSM, cùng danh tính, scope, environment và purpose.",
    ],
    userReason: revoked
      ? "Approval đã bị thu hồi; dừng việc chưa thực hiện."
      : rejected
        ? "Approval đã bị từ chối; request này không được thực hiện."
        : "Không xác minh được approval hợp lệ cho đúng request.",
    adminReason: approval.reason ?? `Approval status=${approval.status}; chưa được phép thực hiện.`,
    nextStep: revoked
      ? "Thu hồi quyền/tài nguyên đã cấp nếu hệ thống cho phép; approval mới cần cho request tiếp theo."
      : rejected
        ? "Đóng request hiện tại; request mới cần scope hoặc approval mới."
        : "Chuyển reviewer xác minh nguồn approval; không dùng lời khai hoặc file đính kèm làm thay thế.",
    assignedTeam: "IAM / Resource owner",
  };
}

function resourceQuotaDecision(
  base: Decision,
  status: NonNullable<PolicyEvidence["resourceQuota"]>["status"],
): Decision {
  const unavailable = status === "unavailable";
  return {
    ...base,
    action: "ESCALATE",
    handlingMode: "HUMAN_REVIEW",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "AUTHORITY_REQUIRED",
    riskLevel: "MEDIUM",
    ruleIds: ["AUTH-QUOTA"],
    reviewerQuestions: [
      unavailable
        ? "Cloud/Capacity owner xác nhận quota và ngân sách còn lại của project/team, gồm tài nguyên đang hoạt động, ở nguồn nào?"
        : "Cloud/Capacity owner có thể duyệt ngoại lệ quota/ngân sách nào cho project/team và thời hạn sử dụng?",
    ],
    userReason:
      unavailable
        ? "Chưa xác minh được quota và ngân sách hiện có cho nhóm tài nguyên này."
        : "Yêu cầu vượt quota hoặc ngân sách hiện có; cần người phụ trách xác nhận ngoại lệ.",
    adminReason:
      `AUTH-QUOTA: cần nguồn quota authoritative theo project/team, tính cả tài nguyên đang hoạt động${
        resourceQuotaPolicy.mayApplyPerUserLimit ? " và giới hạn user nếu được cấu hình" : ""
      }; không dùng quota do ticket tự khai.`,
    nextStep: unavailable
      ? "Chờ Cloud/Capacity owner hoặc quota service xác minh; không cấp tài nguyên khi chưa có kết quả."
      : "Reviewer xử lý ngoại lệ với Cloud/Capacity owner; không cấp vượt quota trước khi được xác minh.",
  };
}

function approvalFields(approval: Approval, request: CanonicalRequest) {
  return {
    approvalStatus: approval.status,
    approvalReference:
      approval.reference || request.entities.approvalReference || undefined,
  };
}

function isProductionExportAuthorityRequest(request: CanonicalRequest) {
  if (
    request.serviceGroup !== "DATABASE" ||
    request.environment !== "production" ||
    request.intentLabel !== "DATABASE_EXPORT" ||
    isMissing("reason", request.entities.reason || request.entities.businessPurpose)
  ) return false;
  const evidence = normalize(
    [
      ...request.evidence.map((item) => item.quote),
      request.entities.destination || "",
      request.entities.dataSensitivity || "",
    ].join(" "),
  );
  return !productionExportAuthorityRule.securityIndicators.test(evidence);
}

function evaluateSinglePolicy(
  request: CanonicalRequest,
  approval: Approval,
  evidence: PolicyEvidence,
): Decision {
  const missing = missingFacts(request);
  const quotaIsOverLimit =
    isCloudProvisioningRequest(request) &&
    evidence.resourceQuota?.status === "exceeded" &&
    hasAuthoritativeQuota(evidence);
  const approvalRequired =
    requiresApproval(request) || quotaIsOverLimit || hasSensitiveData(request, evidence);
  const productionExportAuthority = isProductionExportAuthorityRequest(request);
  const rawMatched = riskRules.filter((rule) =>
    request.riskSignals.includes(rule.signal) &&
    (!rule.serviceGroup || rule.serviceGroup === request.serviceGroup) &&
    (!rule.environment || rule.environment === request.environment) &&
    !(rule.signal === "DATA_EXPORT" && productionExportAuthority),
  );
  if (productionExportAuthority && request.riskSignals.includes("DATA_EXPORT"))
    rawMatched.push(productionExportAuthorityRule);
  const databaseAuthority =
    request.serviceGroup === "DATABASE" &&
    (request.environment === "production" ||
      request.intentLabel === "DATABASE_EXPORT" ||
      request.requestedAction === "export");
  if (databaseAuthority && !rawMatched.some((rule) => rule.id === "AUTH-001"))
    rawMatched.push({
      ...productionDatabaseRule,
      signal: "PRODUCTION_CHANGE" as RiskSignal,
    });
  if (request.serviceGroup === "SECURITY")
    rawMatched.push({
      ...securityServiceRule,
      signal: "INCIDENT" as RiskSignal,
    });

  const vpnException = isVerifiedVpnPath(request, evidence);
  const matched = rawMatched.filter((rule) => {
    if (vpnException && rule.id === "AUTH-002") return false;
    return !approvalClearsRule(approval, rule, request, evidence);
  });
  const approvedRiskRules = rawMatched.length > 0 && matched.length === 0;

  const base: Decision = {
    action: "NEEDS_INFORMATION",
    requestKind: request.requestKind,
    handlingMode: "GUIDE",
    riskLevel: "UNKNOWN",
    bucket: "MISSING_INFO",
    uncertaintyClass: "MISSING_FACTS",
    ruleIds: [],
    safeEvidence: request.evidence.map((item) => item.quote),
    missingFields: missing,
    questions: [],
    targetedQuestions: [],
    userReason: "",
    adminReason: "",
    nextStep: "Bổ sung các thông tin bên dưới.",
    assignedTeam: teamFor(request.serviceGroup),
    policyVersion: POLICY_VERSION,
    ...approvalFields(approval, request),
    subrequestOutcomes: [],
  };

  if (matched.length) {
    const bucket = matched.reduce(
      (current, rule) =>
        bucketPriority[rule.bucket] > bucketPriority[current]
          ? rule.bucket
          : current,
      "BEYOND_AUTHORITY" as "SECURITY_RISK" | "BEYOND_AUTHORITY",
    );
    const winning = matched.filter((rule) => rule.bucket === bucket);
    const databaseDestruction = winning.find((rule) =>
      rule.signal === "DESTRUCTIVE" && rule.bucket === "SECURITY_RISK",
    );
    const approvalRevoked = approval.status === "revoked";
    const approvalRejected = approval.status === "rejected";
    const approvalStatusRule = approvalRevoked
      ? "AUTH-APPROVAL-REVOKED"
      : approvalRejected
        ? "AUTH-APPROVAL-REJECTED"
        : undefined;
    const approvalStatusQuestion = approvalRevoked
      ? "Dừng phần chưa thực hiện và thu hồi quyền/tài nguyên đã cấp khi có thể; approval mới nào cho phép tiếp tục?"
      : approvalRejected
        ? "Đóng request hiện tại; nếu scope hoặc approval đổi, hãy tạo request mới để xác minh lại."
        : undefined;
    return {
      ...base,
      action: "ESCALATE",
      handlingMode: "HUMAN_REVIEW",
      riskLevel: matched.some(
        (rule) => !rule.id.startsWith("FAIL") && rule.id !== "HANDOFF-001",
      )
        ? "HIGH"
          : request.riskSignals.includes("USER_HANDOFF")
          ? "MEDIUM"
          : "UNKNOWN",
      bucket,
      uncertaintyClass: winning.some(
        (rule) => rule.uncertaintyClass === "OUT_OF_POLICY",
      )
        ? "OUT_OF_POLICY"
        : "AUTHORITY_REQUIRED",
      ruleIds: [...new Set([
        ...matched.map((rule) => rule.id),
        ...(approvalStatusRule ? [approvalStatusRule] : []),
      ])],
      userReason: approvalStatusQuestion
        ? `${winning[0].reason} ${approvalRevoked ? "Approval đã bị thu hồi." : "Approval đã bị từ chối."}`
        : winning[0].reason,
      adminReason: `${matched
        .map((rule) => `${rule.id}: ${rule.reason}`)
        .join(" ")}${approvalStatusRule ? ` ${approvalStatusRule}: stop execution and require a new approval.` : ""}`,
      assignedTeam:
        bucket === "SECURITY_RISK"
          ? request.riskSignals.includes("PUBLIC_EXPOSURE")
            ? "Security / Network"
            : request.riskSignals.includes("DATA_EXPORT") || databaseDestruction
              ? "Security / DBA/Data"
              : "Security"
          : databaseAuthority
            ? "DBA/Data / Reviewer"
            : base.assignedTeam,
      nextStep: approvalRevoked
        ? "Dừng việc chưa thực hiện; thu hồi quyền/tài nguyên đã cấp khi có thể và yêu cầu approval mới."
        : approvalRejected
          ? "Đóng request này; request mới cần scope hoặc approval mới."
          : "Reviewer kiểm tra evidence và phạm vi; hệ thống không thực hiện thay đổi thật.",
      questions: [],
      reviewerQuestions:
        approvalStatusQuestion
          ? [approvalStatusQuestion]
          : productionExportAuthority && bucket === "BEYOND_AUTHORITY"
          ? [productionExportAuthorityRule.question, productionExportAuthorityRule.destinationQuestion]
          : request.riskSignals.includes("PUBLIC_EXPOSURE")
        ? [
            "Nguồn, đích và cổng nào cần kết nối? Có thể dùng VPN hoặc giới hạn địa chỉ nguồn không?",
            "Ai chịu trách nhiệm phê duyệt và đóng kết nối sau thời hạn?",
          ]
        : request.riskSignals.includes("SECRET")
          ? [
              "Thông tin bí mật đã lộ cần được thu hồi ở hệ thống nào? Không yêu cầu người dùng gửi lại giá trị.",
            ]
          : databaseDestruction
            ? [databaseDestruction.question]
          : request.riskSignals.includes("PRIVILEGED") ||
              request.riskSignals.includes("PRODUCTION_CHANGE")
            ? [
                "Ai có thẩm quyền duyệt hệ thống này? Quyền tối thiểu và thời hạn nào đáp ứng công việc?",
                "Mã phê duyệt, phạm vi tài nguyên và kế hoạch khôi phục đã được xác minh chưa?",
              ]
            : [
                "Xác nhận phạm vi và người có thẩm quyền xử lý.",
                ...missing.slice(0, 2).map((field) => questionFor(field)),
              ],
    };
  }

  if (request.workEvidence) {
    const work = request.workEvidence;
    return {
      ...base,
      action: "NEEDS_INFORMATION",
      handlingMode: "GUIDE",
      bucket: "MISSING_INFO",
      uncertaintyClass: "MISSING_FACTS",
      ruleIds: ["INFO-EVIDENCE-001"],
      missingFields: work.requirements.map((item) => item.artifact),
      clarificationFields: [],
      questions: work.requirements.map((item) => `${item.artifact}. Phạm vi: ${item.range}.`),
      targetedQuestions: work.requirements.map((item) => item.reason),
      reviewerQuestions: [],
      assignedTeam: "Trợ lý",
      userReason: "Cần nguồn dữ liệu có thể kiểm chứng trước khi thực hiện công việc.",
      adminReason: "INFO-EVIDENCE-001: thiếu artefact hoặc công cụ đọc nguồn; chưa có bản nháp hoàn chỉnh để review.",
      nextStep: work.nextAction,
      approvalStatus: "not_required",
    };
  }

  if (request.conversation && request.requestedAction === "answer")
    return {
      ...base,
      action: "AUTO_APPROVE",
      requestKind: "GUIDANCE",
      handlingMode: "LLM_ASSIST",
      riskLevel: "LOW",
      bucket: "ROUTINE",
      uncertaintyClass: "NONE",
      ruleIds: [
        "CHAT-001",
        ...(request.conversation.ignoredOverride
          ? ["CHAT-INJECTION-IGNORED"]
          : []),
      ],
      missingFields: [],
      questions: [],
      approvalStatus: "not_required",
      assignedTeam: "Trợ lý",
      userReason: "Trợ lý có thể trả lời câu hỏi này trực tiếp.",
      adminReason:
        "CHAT-001: read-only answer; no execution or approval authority. " +
        (request.conversation.ignoredOverride
          ? "Ignored instruction override; remaining question passed risk checks."
          : ""),
      nextStep:
        "Đọc câu trả lời hoặc hỏi rõ hơn; chỉ chuyển nhân viên khi bạn yêu cầu.",
    };

  if (
    requiresApproval(request) &&
    !["not_required", "pending", "verified"].includes(approval.status)
  )
    return {
      ...base,
      action: "ESCALATE",
      handlingMode: "HUMAN_REVIEW",
      bucket: "BEYOND_AUTHORITY",
      uncertaintyClass: "AUTHORITY_REQUIRED",
      ruleIds: ["AUTH-007"],
      userReason:
        "Approval bị từ chối, hết hạn, không xác minh được hoặc sai phạm vi.",
      adminReason: approval.reason ?? "Approval verification failed",
      questions: [
        "Bạn có mã phê duyệt mới cho đúng hệ thống và thời hạn cần dùng không?",
      ],
      reviewerQuestions: [
        "Xác minh người duyệt, phạm vi tài nguyên, quyền và thời hạn trên hệ thống phê duyệt.",
      ],
      nextStep:
        "Reviewer yêu cầu approval hợp lệ đúng scope; không nhận secret hoặc ảnh nhạy cảm.",
    };

  const guide = guidanceRules.find((rule) =>
    rule.labels.some((label) => label === request.intentLabel),
  );

  if (
    request.serviceGroup === "OTHER" ||
    request.intentLabel === "UNKNOWN_SUPPORT_REQUEST"
  ) {
    const unresolved = [...new Set(missing)];

    return {
      ...base,
      action: "ESCALATE",
      handlingMode: "HUMAN_REVIEW",
      bucket: "BEYOND_AUTHORITY",
      uncertaintyClass: "OUT_OF_POLICY",
      ruleIds: ["AUTH-005"],
      missingFields: unresolved,
      questions: unresolved.length
        ? clarificationPlan(request, unresolved).questions
        : ["Bạn muốn làm được việc gì và vấn đề xảy ra ở ứng dụng nào?"],
      reviewerQuestions: [
        "Chủ chính sách xác nhận quy định áp dụng hoặc ngoại lệ nào cho dịch vụ và mục tiêu này? Nhóm nào được giao tiếp nhận?",
      ],
      userReason: "Chưa ánh xạ được request vào service/owner trong policy.",
      adminReason:
        "AUTH-005: classifier/reviewer phải xác định owner; không tự chọn IT Helpdesk.",
      assignedTeam: unresolved.length ? "Classifier/reviewer" : "Policy owner / Classifier/reviewer",
      nextStep:
        "Classifier/reviewer xác nhận service, owner và scope trước khi xử lý.",
    };
  }

  if (
    request.serviceGroup === "CLOUD_GPU" &&
    !cloudProvisioningIntentLabels.has(request.intentLabel)
  )
    return {
      ...base,
      action: "ESCALATE",
      handlingMode: "HUMAN_REVIEW",
      bucket: "BEYOND_AUTHORITY",
      uncertaintyClass: "OUT_OF_POLICY",
      ruleIds: ["AUTH-005"],
      missingFields: [],
      questions: [],
      reviewerQuestions: [
        "Cloud policy owner xác nhận service, owner, facts bắt buộc và giới hạn áp dụng cho loại yêu cầu này?",
      ],
      assignedTeam: "Policy owner / Cloud/ML Infra",
      userReason: "Loại yêu cầu cloud này chưa có contract xử lý an toàn trong policy.",
      adminReason:
        "AUTH-005: không áp dụng quota hoặc AUTO provisioning rule cho cloud intent chưa được cấu hình.",
      nextStep: "Policy owner xác nhận phạm vi và quy trình tiếp nhận trước khi xử lý.",
    };

  if (missing.length) {
    const uniqueMissing = [...new Set(missing)];
    const plan = clarificationPlan(request, uniqueMissing);
    const questions = plan.questions;
    const factRule = requiredFactRuleFor(request);
    const provisioningReview =
      provisioningInformationRule.intentLabels.includes(request.intentLabel) &&
      uniqueMissing.some((field) =>
        provisioningInformationRule.sizingFields.includes(field),
      );
    return {
      ...base,
      action: provisioningReview ? "ESCALATE" : base.action,
      handlingMode: provisioningReview ? "HUMAN_REVIEW" : base.handlingMode,
      reviewerQuestions: provisioningReview ? [provisioningInformationRule.question] : undefined,
      nextStep: provisioningReview ? provisioningInformationRule.nextStep : base.nextStep,
      missingFields: uniqueMissing,
      clarificationFields: plan.fields,
      questions,
      ruleIds: [
        request.intentLabel === "DEVICE_RESET_GUIDANCE"
          ? "INFO-RESET"
          : "INFO-001",
        ...(missing.includes("verifiedApproval") ? ["INFO-005"] : []),
        ...(factRule ? [factRule.id] : []),
        ...(provisioningReview ? [provisioningInformationRule.id] : []),
      ],
      userReason:
        provisioningReview
          ? provisioningInformationRule.reason
          : request.intentLabel === "DEVICE_RESET_GUIDANCE"
          ? questions[0]
          : "Cần thêm dữ kiện cụ thể để đánh giá đúng phạm vi.",
      adminReason: `${factRule ? factRule.id + ": " : ""}${provisioningReview ? provisioningInformationRule.id + ": " : ""}Thiếu hoặc mơ hồ: ${uniqueMissing.join(", ")}. Không suy diễn scope/approval.`,
    };
  }

  if (quotaIsOverLimit) {
    if (["pending", "rejected", "revoked"].includes(approval.status))
      return approvalStateDecision(base, approval);
    if (
      !approvalRoleMatches(
        approval,
        /capacity.?owner|quota.?owner|budget.?owner/,
      )
    )
      return resourceQuotaDecision(base, "exceeded");
  }

  if (approvalRequired && !verifiedApproval(approval))
    return approvalStateDecision(base, approval);
  if (
    approvalRequired &&
    !approvalRoleMatches(approval, requiredApprovalRole(request, evidence))
  )
    return approverRoleDecision(base, approval);

  if (requiresEntitlement(request) && !hasVerifiedEntitlement(evidence))
    return entitlementDecision(
      base,
      evidence.entitlement?.status === "denied" ? "denied" : "unknown",
    );
  if (
    requiresEntitlement(request) &&
    !approvalRequired &&
    !hasRoutineAccessTtl(request, evidence)
  )
    return accessTtlDecision(base);

  if (isCloudProvisioningRequest(request)) {
    const quota = evidence.resourceQuota;
    if (!hasAuthoritativeQuota(evidence) || quota?.status === "unavailable")
      return resourceQuotaDecision(base, "unavailable");
    if (
      quota?.status === "exceeded" &&
      !approvalRoleMatches(approval, /capacity.?owner|quota.?owner|budget.?owner/)
    )
      return resourceQuotaDecision(base, "exceeded");
  }

  if (guide && isGuidanceOnly(request)) {
    const medium = ["vpn", "wifi", "software", "account"].includes(guide.topic);
    return {
      ...base,
      action: "AUTO_APPROVE",
      handlingMode: medium ? "LLM_ASSIST" : "GUIDE",
      riskLevel: medium ? "MEDIUM" : "LOW",
      bucket: "ROUTINE",
      uncertaintyClass: "NONE",
      ruleIds: [guide.id],
      missingFields: [],
      questions: [],
      userReason: "Có thể hướng dẫn các bước an toàn để bạn tự thực hiện.",
      adminReason: `${guide.id}: guidance-only; không cấp quyền, xóa dữ liệu hoặc thực thi tool.`,
      nextStep:
        "Làm theo hướng dẫn; có thể nhờ nhân viên hỗ trợ bất cứ lúc nào.",
    };
  }
  const nonProduction = !["production", "unknown"].includes(
    request.environment,
  );
  const safeDeviceIntents = new Set([
    "DEVICE_WONT_BOOT",
    "DEVICE_FREEZE",
    "DEVICE_SLOW",
    "DEVICE_CRASH",
    "DEVICE_BATTERY",
    "DEVICE_DISPLAY",
    "DEVICE_AUDIO",
    "DEVICE_CAMERA",
    "DEVICE_PRINTER",
  ]);
  const targetSystem = normalizeFact(
    request.entities.targetSystem ?? request.entities.system ?? "",
  );
  const ordinaryContent = ["ordinary", "synthetic", "non_sensitive"].includes(
    evidence.dataClassification ?? "unknown",
  );
  const actionText = normalizeFact(request.requestedAction);
  const jiraReadOrTicketUpdate =
    targetSystem.includes("jira") &&
    (["read-only", "read", "standard"].includes(requestedPermission(request)) ||
      request.intentLabel === "JIRA_TICKET_UPDATE" ||
      /(?:update|edit|comment).*(?:ticket|issue)|(?:ticket|issue).*(?:update|edit|comment)/.test(actionText));
  const confluenceReadOrPageEdit =
    targetSystem.includes("confluence") &&
    (["read-only", "read", "standard"].includes(requestedPermission(request)) ||
      request.intentLabel === "CONFLUENCE_PAGE_EDIT" ||
      /(?:read|view|edit|update).*(?:page)|(?:page).*(?:read|view|edit|update)/.test(actionText));
  const restrictedSettingsRequest =
    /ADMIN|PROJECT_SETTINGS|SPACE_SETTINGS|GLOBAL_SETTINGS/.test(request.intentLabel) ||
    /admin|project settings|space settings|global settings/.test(actionText);
  const routineCollaborationAccess =
    request.serviceGroup === "ACCOUNT_ACCESS" &&
    (jiraReadOrTicketUpdate || confluenceReadOrPageEdit) &&
    !restrictedSettingsRequest &&
    ordinaryContent;
  const githubActionsRead =
    request.serviceGroup === "CI_CD" &&
    isGitHubActionsRequest(request) &&
    (request.intentLabel === "PIPELINE_VIEW_LOGS" ||
      request.requestedAction === "view_logs") &&
    evidence.secretExposureExcluded === true;
  const approvedGithubWorkflowChange =
    isGitHubWorkflowChange(request) &&
    approvalRoleMatches(approval, /security/) &&
    hasVerifiedEntitlement(evidence);
  const safeCloudSandbox =
    isEphemeralCloudSandbox(request) &&
    ["synthetic", "non_sensitive"].includes(
      evidence.dataClassification ?? "unknown",
    );
  const approvedCloudProvisioning =
    isCloudProvisioningRequest(request) &&
    hasAuthoritativeQuota(evidence) &&
    evidence.resourceQuota?.status === "within_limit" &&
    approvalRoleMatches(
      approval,
      /capacity.?owner|quota.?owner|budget.?owner|cloud.?owner|resource.?owner/,
    );
  const approvedQuotaException =
    isCloudProvisioningRequest(request) &&
    hasAuthoritativeQuota(evidence) &&
    evidence.resourceQuota?.status === "exceeded" &&
    approvalRoleMatches(approval, /capacity.?owner|quota.?owner|budget.?owner/);

  const allowed =
    (nonProduction &&
      request.serviceGroup === "DATABASE" &&
      request.intentLabel === "DATABASE_READ_ACCESS" &&
      ["read", "read-only"].includes(request.entities.permission)) ||
    (request.serviceGroup === "ACCOUNT_ACCESS" &&
      !["jira", "confluence"].some((system) => targetSystem.includes(system)) &&
      ["REQUEST_STANDARD_ACCESS", "REQUEST_READ_ACCESS"].includes(
        request.intentLabel,
      ) &&
      ["read-only", "standard", "read"].includes(
        requestedPermission(request),
      )) ||
    (request.serviceGroup === "GIT_PERMISSION" &&
      ["GIT_READ_ACCESS", "GIT_WRITE_ACCESS"].includes(request.intentLabel) &&
      ["read", "read-only", "triage", "write"].includes(
        request.entities.permission,
      )) ||
    (isCloudProvisioningRequest(request) &&
      safeCloudSandbox &&
      evidence.resourceQuota?.status === "within_limit" &&
      hasAuthoritativeQuota(evidence)) ||
    approvedCloudProvisioning ||
    approvedQuotaException ||
    (nonProduction &&
      request.serviceGroup === "CI_CD" &&
      ["diagnose", "rerun"].includes(request.requestedAction)) ||
    (githubActionsRead &&
      request.serviceGroup === "CI_CD" &&
      hasVerifiedEntitlement(evidence)) ||
    approvedGithubWorkflowChange ||
    (routineCollaborationAccess && hasVerifiedEntitlement(evidence)) ||
    (nonProduction &&
      request.serviceGroup === "KUBERNETES" &&
      ["view_logs", "diagnose", "restart", "scale"].includes(
        request.requestedAction,
      )) ||
    (request.serviceGroup === "MONITORING" &&
      ["view_logs", "view_metrics", "diagnose", "investigate"].includes(
        request.requestedAction,
      )) ||
    (nonProduction &&
      request.serviceGroup === "NETWORK_VPN" &&
      request.requestedAction === "diagnose") ||
    isVerifiedVpnPath(request, evidence) ||
    (request.serviceGroup === "SOFTWARE_LICENSE" &&
      request.entities.approvedCatalogStatus === "approved") ||
    (request.serviceGroup === "DEVICE_BOOT" &&
      safeDeviceIntents.has(request.intentLabel) &&
      ["repair", "diagnosis", "hardware_check", "boot_assistance"].includes(
        request.requestedAction,
      ));

  if (allowed) {
    const routineRule =
      request.serviceGroup === "DATABASE"
        ? "ROUTINE-002"
        : request.serviceGroup === "CLOUD_GPU"
          ? "ROUTINE-003"
          : request.serviceGroup === "DEVICE_BOOT"
            ? "ROUTINE-004"
            : ["NETWORK_VPN", "MONITORING"].includes(request.serviceGroup)
              ? "ROUTINE-005"
              : "ROUTINE-001";
    return {
      ...base,
      action: "AUTO_APPROVE",
      handlingMode: "SIMULATED_WORKFLOW",
      riskLevel: "LOW",
      bucket: "ROUTINE",
      uncertaintyClass: "NONE",
      ruleIds: [routineRule],
      missingFields: [],
      questions: [],
      userReason:
        "Đủ điều kiện tạo workflow mô phỏng trong phạm vi đã xác minh.",
      adminReason: `${routineRule}: safe path đúng service/action; đủ dữ kiện và approval bắt buộc đã xác minh.`,
      nextStep:
        "Đã mô phỏng tiếp nhận; chưa có thao tác hạ tầng hay cấp quyền thật.",
    };
  }

  if (approvedRiskRules) {
    const approvedBucket = rawMatched.reduce(
      (current, rule) =>
        bucketPriority[rule.bucket] > bucketPriority[current]
          ? rule.bucket
          : current,
      "BEYOND_AUTHORITY" as Decision["bucket"],
    );
    return {
      ...base,
      action: "AUTO_APPROVE",
      handlingMode: "SIMULATED_WORKFLOW",
      riskLevel: "HIGH",
      bucket: approvedBucket,
      uncertaintyClass: "NONE",
      ruleIds: [
        ...new Set(rawMatched.map((rule) => rule.id)),
        "APPROVAL-SCOPE-VERIFIED",
      ],
      missingFields: [],
      questions: [],
      reviewerQuestions: [],
      userReason: "Approval đã xác minh đúng scope và vai trò cho action này.",
      adminReason:
        "Một approver có thẩm quyền đã duyệt scope khớp; không yêu cầu dual control. Chỉ mô phỏng workflow, không thực thi production.",
      nextStep: "Ghi audit approval và scope; thao tác thật vẫn do hệ thống được cấp quyền thực hiện.",
    };
  }

  const reviewRule = manualReviewRules.find((rule) =>
    rule.factRuleId === requiredFactRuleFor(request)?.id,
  );
  if (reviewRule) return {
    ...base, action: "ESCALATE", handlingMode: "HUMAN_REVIEW",
    bucket: "BEYOND_AUTHORITY", uncertaintyClass: "AUTHORITY_REQUIRED",
    ruleIds: [reviewRule.id], assignedTeam: reviewRule.team,
    questions: [], reviewerQuestions: [reviewRule.question],
    userReason: reviewRule.reason,
    adminReason: `${reviewRule.id}: ${reviewRule.reason}`,
    nextStep: "Team phụ trách kiểm tra phạm vi và tiếp nhận xử lý; chưa có thao tác cấp quyền hoặc hạ tầng thật.",
  };

  return {
    ...base,
    action: "ESCALATE",
    handlingMode: "HUMAN_REVIEW",
    bucket: "BEYOND_AUTHORITY",
    uncertaintyClass: "OUT_OF_POLICY",
    ruleIds: ["AUTH-005"],
    assignedTeam: "Policy owner / " + base.assignedTeam,
    questions: [],
    reviewerQuestions: [
      "Chủ chính sách có quy định nào áp dụng cho phạm vi này, hay cần xét ngoại lệ? Phương án an toàn được cho phép là gì?",
    ],
    userReason: "Phạm vi này chưa có rule tự xử lý an toàn.",
    adminReason:
      "AUTH-005: không có safe execution path; reviewer xác định authority và integration.",
    nextStep:
      "Chuyển team phụ trách xác nhận owner, scope và phương án an toàn.",
  };
}

function approvalFor(
  request: CanonicalRequest,
  approval: Approval | ApprovalResolver,
) {
  return typeof approval === "function" ? approval(request) : approval;
}

function evidenceFor(
  request: CanonicalRequest,
  evidence: PolicyEvidence | PolicyEvidenceResolver,
) {
  return typeof evidence === "function" ? evidence(request) : evidence;
}

export function evaluatePolicy(
  request: CanonicalRequest,
  approval: Approval | ApprovalResolver = { status: "pending" },
  evidence: PolicyEvidence | PolicyEvidenceResolver = {},
): Decision {
  const synchronizeQuestions = (decision: Decision): Decision => ({
    ...decision,
    targetedQuestions: decision.reviewerQuestions ?? decision.questions,
  });
  const parent = synchronizeQuestions(
    evaluateSinglePolicy(
      request,
      approvalFor(request, approval),
      evidenceFor(request, evidence),
    ),
  );
  if (!request.subrequests.length) return parent;

  if (request.subrequests.length > singleRequestPolicy.maxSubrequests) {
    if (parent.bucket === "SECURITY_RISK") return parent;
    const childDecisions = request.subrequests
      .map((part) => {
        const child: CanonicalRequest = {
          ...part,
          subrequests: [],
          redactions: [],
          model: request.model,
        };
        return evaluateSinglePolicy(child, approvalFor(child, approval), evidenceFor(child, evidence));
      });
    const highestPriorityDecision = [parent, ...childDecisions]
      .filter((decision) =>
        ["SECURITY_RISK", "BEYOND_AUTHORITY"].includes(decision.bucket),
      )
      .sort((left, right) => bucketPriority[right.bucket] - bucketPriority[left.bucket])[0];
    if (highestPriorityDecision)
      return synchronizeQuestions(highestPriorityDecision);
    return synchronizeQuestions({
      ...parent,
      action: "NEEDS_INFORMATION",
      handlingMode: "GUIDE",
      bucket: "MISSING_INFO",
      uncertaintyClass: "MISSING_FACTS",
      ruleIds: ["INFO-SINGLE-REQUEST-001"],
      missingFields: ["singleRequest"],
      questions: [singleRequestPolicy.userMessage],
      reviewerQuestions: [],
      userReason: singleRequestPolicy.userMessage,
      adminReason: `INFO-SINGLE-REQUEST-001: ${request.subrequests.length} subrequests were extracted; process one request at a time.`,
      nextStep: singleRequestPolicy.userMessage,
      assignedTeam: "Người gửi yêu cầu",
      subrequestOutcomes: [],
    });
  }

  const childDecisions = request.subrequests.map((part) => {
    const child: CanonicalRequest = {
      ...part,
      subrequests: [],
      redactions: [],
      model: request.model,
    };
    return {
      request: child,
      decision: synchronizeQuestions(
        evaluateSinglePolicy(
          child,
          approvalFor(child, approval),
          evidenceFor(child, evidence),
        ),
      ),
    };
  });
  const all = [parent, ...childDecisions.map((item) => item.decision)];
  const winner = all.reduce((current, decision) =>
    bucketPriority[decision.bucket] > bucketPriority[current.bucket]
      ? decision
      : current,
  );
  const riskRank = { UNKNOWN: 0, LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
  const riskLevel = all.reduce<Decision["riskLevel"]>(
    (current, decision) =>
      riskRank[decision.riskLevel] > riskRank[current]
        ? decision.riskLevel
        : current,
    "UNKNOWN",
  );
  return synchronizeQuestions({
    ...winner,
    riskLevel,
    ruleIds: [...new Set(all.flatMap((decision) => decision.ruleIds))],
    safeEvidence: [
      ...new Set(all.flatMap((decision) => decision.safeEvidence)),
    ],
    missingFields: [
      ...new Set(all.flatMap((decision) => decision.missingFields)),
    ],
    questions: [
      ...new Set(all.flatMap((decision) => decision.questions)),
    ].slice(0, 3),
    reviewerQuestions: [
      ...new Set(all.flatMap((decision) => decision.reviewerQuestions ?? [])),
    ],
    userReason: `Ticket có ${childDecisions.length} yêu cầu con; áp dụng kết quả ưu tiên cao nhất. ${winner.userReason}`,
    adminReason: `Evaluated ${childDecisions.length} subrequests independently. ${all
      .map((decision) => `${decision.bucket}:${decision.ruleIds.join("+")}`)
      .join("; ")}`,
    subrequestOutcomes: childDecisions.map(
      ({ request: child, decision }, index) => ({
        index,
        intentLabel: child.intentLabel,
        serviceGroup: child.serviceGroup,
        action: decision.action,
        bucket: decision.bucket,
        ruleIds: decision.ruleIds,
        questions: decision.questions,
      }),
    ),
  });
}
