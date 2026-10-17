import type { CanonicalRequest, Decision, ServiceGroup, SupportInput } from "./contracts";
import { classifyCompanySupport } from "./company-support";

export const supportDivisions = ["IT", "COMMERCIAL", "HR"] as const;
export type SupportDivision = typeof supportDivisions[number];
export const divisionLabels: Record<SupportDivision, string> = { IT: "Ban IT", COMMERCIAL: "Ban Commercial", HR: "Ban HR" };
const hrGroups: ServiceGroup[] = ["PEOPLE_HR", "PAYROLL_BENEFITS", "WORKPLACE_FACILITIES", "CORPORATE_ADMIN", "LEARNING_DEVELOPMENT", "TRAVEL_EVENTS", "WORKPLACE_SAFETY"];
const commercialGroups: ServiceGroup[] = ["FINANCE_ACCOUNTING", "PROCUREMENT", "LEGAL_COMPLIANCE", "BUSINESS_SALES", "MARKETING_COMMUNICATIONS", "CUSTOMER_OPERATIONS", "PRODUCT_PROJECTS", "DATA_ANALYTICS"];
export function divisionForGroup(group: ServiceGroup): SupportDivision {
  return hrGroups.includes(group) ? "HR" : commercialGroups.includes(group) ? "COMMERCIAL" : "IT";
}
/** The model selects a validated catalog intent; authority mapping stays server-owned.
 * Unclassified and cross-division requests stay in IT triage pending clarification. */
export function divisionForCanonical(request: Pick<CanonicalRequest, "serviceGroup" | "subrequests"> & Partial<Pick<CanonicalRequest, "conversation">>): SupportDivision {
  if (request.conversation?.label === "COMPANY_POLICY") {
    const company = classifyCompanySupport(request.conversation.question);
    if (company) return divisionForGroup(company.serviceGroup);
  }
  const divisions = new Set([divisionForGroup(request.serviceGroup), ...request.subrequests.map(part => divisionForGroup(part.serviceGroup))]);
  return divisions.size === 1 ? divisionForGroup(request.serviceGroup) : "IT";
}
export function requestDivision(request: { canonical: Pick<CanonicalRequest, "serviceGroup" | "subrequests"> | null;
  input: Pick<SupportInput, "serviceGroup">; decision: Pick<Decision, "division"> | null }): SupportDivision {
  if (request.decision?.division) return request.decision.division;
  return divisionForGroup(request.canonical?.serviceGroup ?? request.input.serviceGroup ?? "OTHER");
}
export function withDecisionDivision(request: CanonicalRequest, decision: Decision): Decision {
  const technicalSecurity = decision.bucket === "SECURITY_RISK" && request.riskSignals.some(signal =>
    ["SECURITY_CONTROL", "BYPASS", "PUBLIC_EXPOSURE", "INJECTION", "UNAPPROVED_SOFTWARE", "PRIVILEGED", "PRODUCTION_CHANGE"].includes(signal));
  return { ...decision, division: technicalSecurity ? "IT" : divisionForCanonical(request) };
}
