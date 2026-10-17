import type { AuditEvent, CanonicalRequest, SupportRequest, SupportSummary } from "./contracts";
import { faqIntents, faqTopic } from "./faq-intent";
import { incidentLabels, incidentTopic } from "./shared-support";
import { canReview } from "./transitions";

export type GroupCandidate = Pick<SupportRequest,
  "id" | "version" | "status" | "input" | "originalQuestion" | "createdAt" | "updatedAt" | "decision" | "incidentId"
> & {
  canonical: Pick<CanonicalRequest, "serviceGroup" | "intentLabel" | "subrequests" | "redactions" | "riskSignals" | "model"> | null;
  events: Pick<AuditEvent, "afterStatus">[];
  knowledgeCandidate?: Pick<NonNullable<SupportRequest["knowledgeCandidate"]>, "status">;
};

const topicLabels = {
  "vpn:connection": "lỗi kết nối VPN",
  "vpn:disconnect": "VPN ngắt kết nối",
  "wifi:connection": "lỗi kết nối Wi-Fi",
  "printer:offline": "máy in offline",
};

/** Only the existing closed FAQ grammar or a site-scoped incident can share a
 * reply. Re-evaluate current content so a follow-up can leave its old group. */
export function requestGroup(row: GroupCandidate): { key: string; topic: string } | null {
  const { canonical, decision, input } = row;
  if (!canReview(row.status, "SEND_MESSAGE") || input.mode !== "freeform" ||
      !canonical || !decision || decision.bucket === "SECURITY_RISK" ||
      canonical.redactions.length || canonical.subrequests.length > 1 ||
      canonical.model.failure || canonical.riskSignals.some(risk => risk !== "USER_HANDOFF")) return null;
  const faq = faqTopic(input.rawText);
  const incident = row.incidentId && incidentTopic(input.rawText);
  let scope: string;
  let topic: string;
  if (faq && canonical.intentLabel === faqIntents[faq] &&
      Object.keys(input.fields).every(key => ["employeeId", "department"].includes(key))) {
    scope = faq;
    topic = topicLabels[faq];
  } else if (incident && input.fields.incidentSite &&
      Object.keys(input.fields).every(key => ["employeeId", "department", "incidentSite"].includes(key))) {
    scope = row.incidentId!;
    topic = `${incidentLabels[incident].toLocaleLowerCase("vi-VN")} tại ${input.fields.incidentSite.toUpperCase()}`;
  } else return null;
  return {
    key: JSON.stringify(["reply-group-v1", scope, row.status, decision.policyVersion,
      decision.uncertaintyClass, decision.assignedTeam, input.verifyRunId ?? "support"]),
    topic,
  };
}

export type SharedReply = { id: string; timestamp: string; text: string };
export type GroupReply = SharedReply & { recipientCount: number };
export type SupportQueueItem = SupportSummary & { group?: { id: string; count: number } };
export type RequestGroupMember = SupportSummary & { text: string };
export type RequestGroupDetail = {
  id: string;
  title: string;
  membership: string;
  members: RequestGroupMember[];
  replies: GroupReply[];
};
