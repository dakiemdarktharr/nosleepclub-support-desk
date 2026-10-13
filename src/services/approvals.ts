import type { CanonicalRequest, ServiceGroup } from "@/domain/contracts";
import type { Approval } from "@/domain/policy";
import { approvalPolicy } from "@/domain/policy-source";
import { requiresApproval } from "@/domain/policy";
import { normalizeFact } from "@/domain/text";

type DemoApproval = {
  reference: string;
  role: string;
  service: ServiceGroup;
  scope: Record<string, string>;
};

// Synthetic registry samples are not enough to verify v5.14 approval: this app
// has no paired ITSM source or authenticated requester/approver identity adapter.
const demoApprovals: DemoApproval[] = [
  {
    reference: "DEMO-1001",
    role: "service_owner_or_dba_delegate",
    service: "DATABASE",
    scope: {
      system: "postgresql",
      resourceScope: "demo_inventory",
      environment: "staging",
      permission: "read-only",
      duration: "2 hours",
    },
  },
  {
    reference: "DEMO-ACCOUNT-1001",
    role: "system_owner",
    service: "ACCOUNT_ACCESS",
    scope: {
      targetSystem: "jira-demo",
      environment: "staging",
      accessType: "standard",
      duration: "8 hours",
    },
  },
  {
    reference: "DEMO-GIT-1001",
    role: "repository_owner",
    service: "GIT_PERMISSION",
    scope: {
      provider: "github",
      repository: "docrelay-demo",
      permission: "write",
      duration: "8 hours",
    },
  },
  {
    reference: "DEMO-GPU-1001",
    role: "quota_or_budget_owner",
    service: "CLOUD_GPU",
    scope: {
      provider: "internal cloud",
      environment: "development",
      gpuType: "t4",
      quantity: "1",
      duration: "4 hours",
      purpose: "model testing",
      resourceLifecycle: "ephemeral",
      dataSensitivity: "synthetic",
    },
  },
  {
    reference: "DEMO-LICENSE-1001",
    role: "license_or_budget_owner",
    service: "SOFTWARE_LICENSE",
    scope: {
      software: "demo ide",
      version: "1",
      os: "macos",
      approvedCatalogStatus: "approved",
      businessPurpose: "application development",
      licenseDuration: "30 days",
      licenseType: "named-user",
    },
  },
];

export function verifyApproval(request: CanonicalRequest): Approval {
  if (!requiresApproval(request))
    return { status: "not_required", scope: "matched" };
  const reference = request.entities.approvalReference;
  const permissionRank: Record<string, number> = {
    "read-only": 0,
    read: 0,
    triage: 1,
    standard: 1,
    write: 2,
    maintain: 3,
    admin: 4,
    root: 5,
    owner: 5,
    "cluster-admin": 5,
  };
  const permissionIsWithinApproval = (requested: string, approved: string) => {
    const requestedRank = permissionRank[normalizeFact(requested)];
    const approvedRank = permissionRank[normalizeFact(approved)];
    return requestedRank === undefined || approvedRank === undefined
      ? normalizeFact(requested) === normalizeFact(approved)
      : requestedRank <= approvedRank;
  };
  const scopeMatches = (approval: DemoApproval) =>
    request.serviceGroup === approval.service &&
    Object.entries(approval.scope).every(([key, expected]) => {
      const actual =
        key === "environment" ? request.environment : request.entities[key];
      if (key === "permission" || key === "accessType")
        return permissionIsWithinApproval(actual ?? "", expected);
      return normalizeFact(actual ?? "") === normalizeFact(expected);
    });
  const candidates = demoApprovals.filter(scopeMatches);
  const entry = reference
    ? demoApprovals.find((approval) => approval.reference === reference)
    : approvalPolicy.ticketReferenceRequired ||
        !approvalPolicy.uniqueScopeMatchRequired ||
        candidates.length !== 1
      ? undefined
      : candidates[0];
  if (!entry)
    return {
      status: reference || candidates.length > 1 ? "unverifiable" : "pending",
      reference,
      scope: candidates.length > 1 ? "unknown" : "unknown",
      reason:
        candidates.length > 1
          ? "Có nhiều approval record khớp scope; backend không thể tự chọn một record duy nhất."
          : reference
            ? "Reference không tồn tại trong registry server-side."
            : undefined,
    };
  const metadata = { reference: entry.reference, authorizedRole: entry.role };
  if (!scopeMatches(entry))
    return {
      status: "invalid",
      scope: "mismatched",
      reason:
        "Synthetic approval sai service/resource/environment/action/quyền hoặc thời hạn.",
      ...metadata,
    };
  return {
    status: "unverifiable",
    scope: "matched",
    reason:
      `Registry sample khớp scope nhưng chưa đối chiếu được cùng record trên ${approvalPolicy.sourceSystems.join(" và ")} hoặc xác minh danh tính/quyền duyệt.`,
    ...metadata,
  };
}
