import { z } from "zod";
import { serviceGroups } from "./contracts";

export const metricIds = ["human_response", "support_completion", "requester_wait"] as const;
export const completionEvents = ["FULFILL", "REQUESTER_RESOLVED"] as const;
export type ServiceMetric = (typeof metricIds)[number];
export const metricLabels: Record<ServiceMetric, string> = {
  human_response: "Phản hồi đầu tiên của nhân viên",
  support_completion: "Hoàn tất hỗ trợ",
  requester_wait: "Chờ người gửi bổ sung",
};
const identifier = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/);
const instant = z.string().datetime().transform(value => new Date(value).toISOString());
const interval = z.object({ startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).strict();
export const calendarSchema = z.object({
  id: identifier, version: identifier, timeZone: z.string().max(100),
  mode: z.enum(["CONTINUOUS", "BUSINESS"]),
  week: z.array(z.object({ day: z.number().int().min(0).max(6), intervals: z.array(interval).max(8) }).strict()).max(7),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(2000),
}).strict().superRefine((calendar, ctx) => {
  try { new Intl.DateTimeFormat("en", { timeZone: calendar.timeZone }); }
  catch { ctx.addIssue({ code: "custom", message: "Invalid time zone" }); }
  if (new Set(calendar.week.map(row => row.day)).size !== calendar.week.length)
    ctx.addIssue({ code: "custom", message: "Duplicate weekday" });
  for (const row of calendar.week) {
    const sorted = [...row.intervals].sort((a, b) => a.startMinute - b.startMinute);
    if (sorted.some((item, i) => item.endMinute <= item.startMinute || (i > 0 && sorted[i - 1].endMinute > item.startMinute)))
      ctx.addIssue({ code: "custom", message: "Invalid or overlapping business intervals" });
  }
  if (calendar.mode === "BUSINESS" && !calendar.week.some(row => row.intervals.length))
    ctx.addIssue({ code: "custom", message: "Business calendar requires working intervals" });
  if (calendar.holidays.some(day => !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day))
    ctx.addIssue({ code: "custom", message: "Invalid holiday" });
});
export type ServiceCalendar = z.infer<typeof calendarSchema>;
export const scopeSchema = z.object({
  organizationId: identifier.optional(), serviceId: identifier.optional(), serviceOwnerId: identifier.optional(),
  requestType: identifier.optional(), priority: identifier.optional(), requesterSegment: identifier.optional(),
}).strict();
export type ServiceScope = z.infer<typeof scopeSchema>;
export const serviceLevelPolicySchema = z.object({
  id: identifier, version: identifier, metric: z.enum(metricIds),
  definitionVersion: identifier,
  completionEvents: z.array(z.enum(completionEvents)).min(1),
  effectiveFrom: instant, effectiveUntil: instant.nullable(),
  status: z.enum(["DRAFT", "SHADOW", "ACTIVE", "RETIRED"]),
  kind: z.enum(["SLI", "SLO", "SLA", "OLA"]),
  ownerId: identifier.nullable(), approvalReference: identifier.nullable(),
  scope: scopeSchema, precedence: z.number().int().min(0).max(1000),
  targetMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  warningBeforeMs: z.number().int().nonnegative().nullable(),
  calendar: calendarSchema.nullable(),
  pauseReasons: z.array(z.enum(["REQUESTER", "APPROVAL", "VENDOR", "OTHER_TEAM"])),
  alertTeams: z.array(identifier), audience: z.enum(["REVIEWER", "REQUESTER"]),
}).strict().superRefine((policy, ctx) => {
  if (policy.effectiveUntil && policy.effectiveUntil <= policy.effectiveFrom)
    ctx.addIssue({ code: "custom", message: "Invalid effective interval" });
  if (policy.status === "ACTIVE" && (!policy.ownerId || !policy.approvalReference || !policy.targetMs || !policy.calendar || !policy.alertTeams.length || policy.kind === "SLI"))
    ctx.addIssue({ code: "custom", message: "Active objectives require owner, approval, target, calendar and alert teams" });
  if (policy.warningBeforeMs !== null && (!policy.targetMs || policy.warningBeforeMs >= policy.targetMs))
    ctx.addIssue({ code: "custom", message: "Warning must be smaller than target" });
  if (policy.pauseReasons.length && !policy.approvalReference)
    ctx.addIssue({ code: "custom", message: "Pause exceptions require approval" });
  if (policy.audience === "REQUESTER" && (policy.status !== "ACTIVE" || policy.kind !== "SLA"))
    ctx.addIssue({ code: "custom", message: "Only approved SLA can be requester-facing" });
});
export type ServiceLevelPolicy = z.infer<typeof serviceLevelPolicySchema>;

export const serviceCatalogSchema = z.array(z.object({
  serviceGroup: z.enum(serviceGroups), serviceId: identifier,
  serviceOwnerId: identifier.nullable(), serviceOwnerDepartment: identifier.nullable(),
  approvalReference: identifier.nullable(),
}).strict()).superRefine((items, ctx) => {
  if (new Set(items.map(item => item.serviceGroup)).size !== items.length)
    ctx.addIssue({ code: "custom", message: "Ambiguous service routing" });
  if (items.some(item => item.serviceOwnerId && !item.approvalReference))
    ctx.addIssue({ code: "custom", message: "Service owner assignment needs approval" });
});
// A demo catalog, not a claim that these services/owners have been approved by VNG.
export const serviceCatalog = serviceCatalogSchema.parse(serviceGroups.map(group => ({
  serviceGroup: group, serviceId: `it:${group.toLowerCase()}`,
  serviceOwnerId: null, serviceOwnerDepartment: null, approvalReference: null,
})));
export const shadowPolicies: ServiceLevelPolicy[] = metricIds.map(metric => serviceLevelPolicySchema.parse({
  id: `helpdesk.${metric}`, version: "shadow-v1", metric,
  definitionVersion: "business-events-v1", completionEvents: [...completionEvents],
  effectiveFrom: "2026-10-17T00:00:00.000Z", effectiveUntil: null,
  status: "SHADOW", kind: "SLI", ownerId: null, approvalReference: null,
  scope: { organizationId: "support-demo" }, precedence: 0,
  targetMs: null, warningBeforeMs: null, calendar: null, pauseReasons: [], alertTeams: [], audience: "REVIEWER",
}));

export function resolveServiceLevelPolicy(metric: ServiceMetric, scope: ServiceScope, at: string, policies = shadowPolicies) {
  const eligible = policies.filter(policy => policy.metric === metric &&
    policy.effectiveFrom <= at && (!policy.effectiveUntil || at < policy.effectiveUntil) &&
    Object.entries(policy.scope).every(([key, value]) => scope[key as keyof ServiceScope] === value));
  eligible.sort((a, b) => b.precedence - a.precedence || Object.keys(b.scope).length - Object.keys(a.scope).length);
  const best = eligible[0];
  if (!best) return { policy: null, reason: "NO_MATCH" } as const;
  if (eligible.slice(1).some(item => item.precedence === best.precedence && Object.keys(item.scope).length === Object.keys(best.scope).length))
    return { policy: null, reason: "CONFIG_CONFLICT" } as const;
  const parsed = serviceLevelPolicySchema.safeParse(best);
  if (!parsed.success) return { policy: null, reason: "INVALID_CONFIG" } as const;
  if (best.status === "DRAFT" || best.status === "RETIRED") return { policy: parsed.data, reason: best.status } as const;
  return { policy: structuredClone(parsed.data), reason: "MATCHED" } as const;
}
