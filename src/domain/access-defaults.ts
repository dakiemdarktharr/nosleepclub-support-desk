import type { CanonicalRequest } from "./contracts";

// Owner-approved demo definitions, not claims about a real Jira installation.
export const jiraRoleProfiles = {
  "developer-assigned": {
    label: "Developer",
    scope: "assigned-tickets",
    description: "Xem, tạo, bình luận; chỉ sửa và chuyển trạng thái ticket được giao theo workflow được phép, trong project được cấp.",
  },
  "agent-assigned": {
    label: "Standard agent",
    scope: "assigned-queue",
    description: "Xem hàng đợi được cấp, tạo và bình luận; chỉ sửa và chuyển trạng thái ticket được giao theo workflow được phép.",
  },
} as const;
export type JiraRole = keyof typeof jiraRoleProfiles;
export function jiraRoleProfile(permission: string | undefined) {
  const key = permission?.trim().toLowerCase().replace(/\s+/g, "-");
  return key && Object.hasOwn(jiraRoleProfiles, key)
    ? jiraRoleProfiles[key as JiraRole] : undefined;
}
export type DurationProposal = { hours: number; value: string; label: string };

// Proposal only: never add a fact or treat missing entitlement expiry as infinite.
// The sender must explicitly apply it, regenerate preview, and pass all policy gates.
export function proposeAccessDuration(request: CanonicalRequest): DurationProposal | null {
  const e = request.entities;
  if (e.duration?.trim() || request.requestKind !== "ACCESS_REQUEST" ||
      request.environment === "production" || request.subrequests.length ||
      request.riskSignals.length || request.model.failure ||
      /sensitive|confidential|restricted|customer|secret|pii/i.test(e.dataSensitivity ?? "")) return null;
  let hours: number;
  if (request.serviceGroup === "NETWORK_VPN" && request.intentLabel === "VPN_SETUP" &&
      ["development", "staging"].includes(request.environment) && e.target && e.source) {
    hours = 8;
  } else {
    const permission = (e.permission ?? e.accessType ?? "").toLowerCase();
    const ordinaryGit = request.serviceGroup === "GIT_PERMISSION" &&
      e.provider?.toLowerCase() === "github" && Boolean(e.repository);
    const collaboration = request.serviceGroup === "ACCOUNT_ACCESS" &&
      ["jira", "confluence"].includes((e.targetSystem ?? e.system ?? "").toLowerCase()) && Boolean(e.resourceScope);
    if (!ordinaryGit && !collaboration) return null;
    if (["read", "read-only"].includes(permission)) hours = 8;
    else if (["write", "standard", "developer-assigned", "agent-assigned"].includes(permission)) hours = 4;
    else return null;
  }
  return { hours, value: `${hours} hours`, label: `Đề xuất ${hours} giờ; cần xác nhận và kiểm tra lại quyền, phạm vi, thời điểm hết hạn entitlement.` };
}
