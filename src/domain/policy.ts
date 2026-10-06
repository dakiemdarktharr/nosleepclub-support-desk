import { questionFor, clarificationPlan } from "./questions";
import type {
  ApprovalScope,
  ApprovalStatus,
  CanonicalRequest,
  Decision,
  RiskSignal,
} from "./contracts";

import {
  bucketPriority,
  demoResourceLimits,
  guidanceRules,
  POLICY_VERSION,
  productionDatabaseRule,
  riskRules,
  securityServiceRule,
} from "./policy-source";
import { normalize, teamFor } from "./text";

// Verified approval is supplied by a server-only verifier, never by input fields or model output.
export type Approval = {
  status: ApprovalStatus;
  reason?: string;
  reference?: string;
  authorizedRole?: string;
  scope?: ApprovalScope;
  expiresAt?: string;
};
type ApprovalResolver = (request: CanonicalRequest) => Approval;

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
      required = [
        "provider",
        "environment",
        "duration",
        "purpose",
        "budgetOrQuota",
        ...(/GPU/.test(request.intentLabel)
          ? ["gpuType", "quantity"]
          : ["cpu", "ram", "disk"]),
      ];
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
  return [
    ...new Set([
      ...required.filter((field) => isMissing(field, e[field])),
      ...request.missingFields,
    ]),
  ];
}

export function requiresApproval(request: CanonicalRequest) {
  return (
    request.requestKind === "ACCESS_REQUEST" ||
    request.riskSignals.some((signal) =>
      ["PRIVILEGED", "PRODUCTION_CHANGE"].includes(signal),
    ) ||
    /ACCESS|PERMISSION|MEMBERSHIP|ROLE_CHANGE/.test(request.intentLabel) ||
    ["CLOUD_GPU", "GIT_PERMISSION"].includes(request.serviceGroup) ||
    (request.serviceGroup === "SOFTWARE_LICENSE" &&
      request.requestKind !== "GUIDANCE" &&
      request.requestKind !== "SAFE_DIAGNOSTIC")
  );
}

function approvalFields(approval: Approval, request: CanonicalRequest) {
  return {
    approvalStatus: approval.status,
    approvalReference:
      approval.reference || request.entities.approvalReference || undefined,
  };
}

function evaluateSinglePolicy(
  request: CanonicalRequest,
  approval: Approval,
): Decision {
  const missing = missingFacts(request);
  if (requiresApproval(request) && approval.status !== "verified")
    missing.push("verifiedApproval");
  const matched = riskRules.filter((rule) =>
    request.riskSignals.includes(rule.signal),
  );
  const databaseAuthority =
    request.serviceGroup === "DATABASE" &&
    (request.environment === "production" ||
      request.intentLabel === "DATABASE_EXPORT" ||
      request.requestedAction === "export");
  if (databaseAuthority && !matched.some((rule) => rule.id === "AUTH-001"))
    matched.push({
      ...productionDatabaseRule,
      signal: "PRODUCTION_CHANGE" as RiskSignal,
    });
  if (request.serviceGroup === "SECURITY")
    matched.push({
      ...securityServiceRule,
      signal: "INCIDENT" as RiskSignal,
    });

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
      ruleIds: [...new Set(matched.map((rule) => rule.id))],
      userReason: winning[0].reason,
      adminReason: matched
        .map((rule) => `${rule.id}: ${rule.reason}`)
        .join(" "),
      assignedTeam:
        bucket === "SECURITY_RISK"
          ? request.riskSignals.includes("PUBLIC_EXPOSURE")
            ? "Security / Network"
            : request.riskSignals.includes("DATA_EXPORT")
              ? "Security / DBA/Data"
              : "Security"
          : databaseAuthority
            ? "DBA/Data / Reviewer"
            : base.assignedTeam,
      nextStep:
        "Reviewer kiểm tra evidence và phạm vi; hệ thống không thực hiện thay đổi thật.",
      questions: [],
      reviewerQuestions: request.riskSignals.includes("PUBLIC_EXPOSURE")
        ? [
            "Nguồn, đích và cổng nào cần kết nối? Có thể dùng VPN hoặc giới hạn địa chỉ nguồn không?",
            "Ai chịu trách nhiệm phê duyệt và đóng kết nối sau thời hạn?",
          ]
        : request.riskSignals.includes("SECRET")
          ? [
              "Thông tin bí mật đã lộ cần được thu hồi ở hệ thống nào? Không yêu cầu người dùng gửi lại giá trị.",
            ]
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

  if (missing.length) {
    const uniqueMissing = [...new Set(missing)];
    const plan = clarificationPlan(request, uniqueMissing);
    const questions = plan.questions;
    return {
      ...base,
      missingFields: uniqueMissing,
      clarificationFields: plan.fields,
      questions,
      ruleIds: [
        request.intentLabel === "DEVICE_RESET_GUIDANCE"
          ? "INFO-RESET"
          : "INFO-001",
        ...(missing.includes("verifiedApproval") ? ["INFO-005"] : []),
      ],
      userReason:
        request.intentLabel === "DEVICE_RESET_GUIDANCE"
          ? questions[0]
          : "Cần thêm dữ kiện cụ thể để đánh giá đúng phạm vi.",
      adminReason: `Thiếu hoặc mơ hồ: ${uniqueMissing.join(", ")}. Không suy diễn scope/approval.`,
    };
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
  if (
    request.serviceGroup === "CLOUD_GPU" &&
    (!Number.isFinite(Number(request.entities.duration?.match(/\d+/)?.[0])) ||
      !/^(\d+)\s*(hours?|hrs?|h|gio|tieng)$/i.test(
        normalize(request.entities.duration ?? ""),
      ) ||
      Number(request.entities.duration?.match(/\d+/)?.[0]) >
        demoResourceLimits.hours ||
      (/GPU/.test(request.intentLabel) &&
        (!/^\d+$/.test(request.entities.quantity ?? "") ||
          Number(request.entities.quantity) < 1 ||
          Number(request.entities.quantity) > demoResourceLimits.gpuCount ||
          !(demoResourceLimits.gpuTypes as readonly string[]).includes(
            (request.entities.gpuType ?? "").toLowerCase(),
          ))) ||
      ["cpu", "ram", "disk"].some(
        (field, index) =>
          request.entities[field] &&
          (!Number.isFinite(Number(request.entities[field])) ||
            Number(request.entities[field]) <= 0 ||
            Number(request.entities[field]) >
              [
                demoResourceLimits.cpu,
                demoResourceLimits.ram,
                demoResourceLimits.disk,
              ][index]),
      ))
  )
    return {
      ...base,
      action: "ESCALATE",
      handlingMode: "HUMAN_REVIEW",
      bucket: "BEYOND_AUTHORITY",
      uncertaintyClass: "AUTHORITY_REQUIRED",
      riskLevel: "MEDIUM",
      ruleIds: ["AUTH-QUOTA"],
      reviewerQuestions: ["Owner có thể duyệt số lượng, cấu hình, thời hạn và ngân sách nào? Có phương án giảm tài nguyên về giới hạn mô phỏng không?"],
      userReason:
        "Tài nguyên vượt giới hạn mô phỏng hoặc chưa xác định được quy mô an toàn.",
      adminReason:
        "Demo quota: tối đa 2 GPU T4/A10, 4 CPU, 16 GB RAM, 100 GB disk, 8 giờ; cần người phụ trách xác nhận phần vượt giới hạn.",
      nextStep: "Nhân viên kiểm tra chi phí và khả năng cấp tài nguyên.",
    };

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

  const allowed =
    (nonProduction &&
      request.serviceGroup === "DATABASE" &&
      request.intentLabel === "DATABASE_READ_ACCESS" &&
      ["read", "read-only"].includes(request.entities.permission)) ||
    (nonProduction &&
      request.serviceGroup === "ACCOUNT_ACCESS" &&
      ["REQUEST_STANDARD_ACCESS", "REQUEST_READ_ACCESS"].includes(
        request.intentLabel,
      ) &&
      ["read-only", "standard", "read"].includes(
        request.entities.accessType,
      )) ||
    (request.serviceGroup === "GIT_PERMISSION" &&
      ["GIT_READ_ACCESS", "GIT_WRITE_ACCESS"].includes(request.intentLabel) &&
      ["read", "read-only", "triage", "write"].includes(
        request.entities.permission,
      )) ||
    (request.serviceGroup === "CLOUD_GPU" &&
      ["sandbox", "development"].includes(request.environment)) ||
    (nonProduction &&
      request.serviceGroup === "CI_CD" &&
      ["view_logs", "diagnose", "rerun"].includes(request.requestedAction)) ||
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

export function evaluatePolicy(
  request: CanonicalRequest,
  approval: Approval | ApprovalResolver = { status: "pending" },
): Decision {
  const synchronizeQuestions = (decision: Decision): Decision => ({
    ...decision,
    targetedQuestions: decision.reviewerQuestions ?? decision.questions,
  });
  const parent = synchronizeQuestions(
    evaluateSinglePolicy(request, approvalFor(request, approval)),
  );
  if (!request.subrequests.length) return parent;

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
        evaluateSinglePolicy(child, approvalFor(child, approval)),
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
