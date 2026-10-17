import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuditEvent, SupportRequest } from "@/domain/contracts";
import { applyServiceLevelEvents, changeClockPause, clockMeasurement, newServiceLevelState, serviceLevelView, withGroupResponseEvidence } from "@/domain/service-level";
import { calendarSchema, resolveServiceLevelPolicy, serviceCatalogSchema, serviceLevelPolicySchema, shadowPolicies, type ServiceLevelPolicy } from "@/domain/service-level-config";
import { resetSupportTestStore } from "@/lib/support-repository";
import { submitSupport } from "@/services/support";
import { summarizeServiceLevels } from "@/services/service-level";

const from = "2026-10-17T01:00:00.000Z";
const later = "2026-10-17T02:00:00.000Z";
const calendar = calendarSchema.parse({ id: "synthetic-continuous", version: "v1", mode: "CONTINUOUS", timeZone: "UTC", week: [], holidays: [] });
const active = (overrides: Partial<ServiceLevelPolicy> = {}): ServiceLevelPolicy => serviceLevelPolicySchema.parse({
  ...shadowPolicies[0], status: "ACTIVE", kind: "SLA", ownerId: "synthetic-owner", approvalReference: "test-only-approval",
  targetMs: 3_600_000, warningBeforeMs: 60_000, calendar, alertTeams: ["synthetic-team"], ...overrides,
});
let request: SupportRequest;
function event(action: string, afterStatus: SupportRequest["status"], at = from, beforeStatus: SupportRequest["status"] = "AUTO_APPROVED"): AuditEvent {
  return { ...request.events[0], id: crypto.randomUUID(), action, timestamp: at, beforeStatus, afterStatus, actor: "synthetic-reviewer" };
}
function feed(source: AuditEvent, policies?: ServiceLevelPolicy[]) {
  request.status = source.afterStatus; request.events.push(source); applyServiceLevelEvents(request, [source], policies);
}
beforeEach(async () => {
  vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("AI_PROVIDER", "mock"); resetSupportTestStore();
  request = await submitSupport({ requesterMode: "guest", rawText: "Restart laptop", confirmed: true, idempotencyKey: crypto.randomUUID() });
  request.serviceLevel = newServiceLevelState(from);
});
afterEach(() => vi.unstubAllEnvs());

it("matches organization defaults and explicit service overrides without department-specific code", () => {
  const override = active({ id: "hr.synthetic", precedence: 10, scope: { serviceId: "hr:onboarding" } });
  expect(resolveServiceLevelPolicy("human_response", { serviceId: "hr:onboarding", organizationId: "support-demo" }, from, [...shadowPolicies, override]).policy?.id).toBe(override.id);
  expect(resolveServiceLevelPolicy("human_response", { organizationId: "support-demo" }, from).policy?.status).toBe("SHADOW");
  expect(resolveServiceLevelPolicy("human_response", {}, from).reason).toBe("NO_MATCH");
});
it("fails closed on conflicting, invalid, draft, retired and expired configurations", () => {
  const policy = active();
  expect(resolveServiceLevelPolicy("human_response", { organizationId: "support-demo" }, from, [policy, { ...policy, id: "duplicate" }]).reason).toBe("CONFIG_CONFLICT");
  expect(resolveServiceLevelPolicy("human_response", { organizationId: "support-demo" }, from, [{ ...policy, targetMs: -1 }]).reason).toBe("INVALID_CONFIG");
  for (const status of ["DRAFT", "RETIRED"] as const)
    expect(resolveServiceLevelPolicy("human_response", { organizationId: "support-demo" }, from, [{ ...policy, status }]).reason).toBe(status);
  expect(resolveServiceLevelPolicy("human_response", { organizationId: "support-demo" }, from, [{ ...policy, effectiveUntil: from }]).reason).toBe("NO_MATCH");
});
it("requires approval, owner, calendar and recipients for active objectives and internal pause exceptions", () => {
  for (const overrides of [{ ownerId: null }, { approvalReference: null }, { targetMs: null }, { calendar: null }, { alertTeams: [] }])
    expect(serviceLevelPolicySchema.safeParse({ ...active(), ...overrides }).success).toBe(false);
  expect(serviceLevelPolicySchema.safeParse({ ...shadowPolicies[0], pauseReasons: ["VENDOR"] }).success).toBe(false);
  expect(serviceLevelPolicySchema.safeParse({ ...shadowPolicies[0], audience: "REQUESTER" }).success).toBe(false);
  expect(serviceLevelPolicySchema.safeParse({ ...active(), kind: "OLA", audience: "REQUESTER" }).success).toBe(false);
});
it("validates catalog routing uniqueness and service-owner approval", () => {
  const service = { serviceGroup: "OTHER", serviceId: "hr:onboarding", serviceOwnerId: "synthetic-hr", serviceOwnerDepartment: "hr", approvalReference: "test-only" };
  expect(serviceCatalogSchema.parse([service])[0].serviceId).toBe("hr:onboarding");
  expect(serviceCatalogSchema.safeParse([service, service]).success).toBe(false);
  expect(serviceCatalogSchema.safeParse([{ ...service, approvalReference: null }]).success).toBe(false);
});
it("starts response at human queue entry and ignores AI answers, drafts and generic approval", () => {
  feed(event("DECISION", "AUTO_APPROVED"));
  feed(event("HANDOFF", "ESCALATED"));
  feed(event("ANSWER", "ESCALATED", later, "ESCALATED"));
  feed({ ...event("APPROVE", "APPROVED_BY_HUMAN", later, "ESCALATED"), senderMessage: "Nhân viên đã duyệt" });
  expect(request.serviceLevel!.clocks.find(clock => clock.metric === "human_response")?.state).toBe("RUNNING");
  feed({ ...event("SEND_MESSAGE", "APPROVED_BY_HUMAN", later, "APPROVED_BY_HUMAN"), senderMessage: "Kiểm tra kết nối và báo lại kết quả" });
  expect(request.serviceLevel!.clocks.find(clock => clock.metric === "human_response")?.endedAt).toBe(later);
});
it("records separate waiting cycles without silently pausing the completion clock", () => {
  feed(event("DECISION", "ESCALATED"));
  feed({ ...event("REQUEST_INFORMATION", "NEEDS_INFORMATION", later, "ESCALATED"), senderMessage: "Bổ sung thông tin thiết bị" });
  feed(event("CLARIFICATION", "ESCALATED", "2026-10-17T03:00:00.000Z", "NEEDS_INFORMATION"));
  feed({ ...event("REQUEST_INFORMATION", "NEEDS_INFORMATION", "2026-10-17T04:00:00.000Z", "ESCALATED"), senderMessage: "Bổ sung mã lỗi" });
  const clocks = request.serviceLevel!.clocks;
  expect(clocks.filter(clock => clock.metric === "requester_wait").map(clock => clock.state)).toEqual(["COMPLETED", "RUNNING"]);
  expect(clocks.find(clock => clock.metric === "support_completion")?.pauses).toEqual([]);
  expect(clockMeasurement(clocks[0], "2026-10-17T04:00:00.000Z")).toMatchObject({ elapsedMs: 10_800_000, businessMs: null, outcome: "UNCONFIGURED" });
});
it("does not invent a zero-latency human response when a reviewer asks for information before any handoff", () => {
  feed(event("DECISION", "AUTO_APPROVED"));
  feed({ ...event("REQUEST_INFORMATION", "NEEDS_INFORMATION", later), senderMessage: "Bổ sung thiết bị" });
  expect(request.serviceLevel!.clocks.some(clock => clock.metric === "human_response")).toBe(false);
});
it("keeps frozen policy/target/calendar on routing changes and records the current team separately", () => {
  const policy = active();
  feed(event("DECISION", "ESCALATED"), [policy]);
  policy.version = "v2"; policy.targetMs = 1;
  request.decision!.assignedTeam = "Synthetic other team";
  feed(event("CLARIFICATION", "ESCALATED", later, "NEEDS_INFORMATION"), [policy]);
  const response = request.serviceLevel!.clocks.find(clock => clock.metric === "human_response")!;
  expect(response.snapshot?.version).toBe("shadow-v1"); expect(response.snapshot?.targetMs).toBe(3_600_000);
  expect(request.serviceLevel!.supportTeam).toBe("Synthetic other team");
  expect(request.serviceLevel!.events.filter(item => item.action === "CONTEXT_CHANGED")).toHaveLength(2);
});
it("cancels rejection/stop without claiming service completion and preserves cycles across reopen", () => {
  feed(event("DECISION", "ESCALATED"));
  feed(event("REJECT", "REJECTED", later, "ESCALATED"));
  expect(request.serviceLevel!.clocks.every(clock => clock.state === "CANCELLED")).toBe(true);
  feed(event("OVERRIDE", "AUTO_APPROVED", "2026-10-17T03:00:00.000Z", "REJECTED"));
  feed(event("HANDOFF", "ESCALATED", "2026-10-17T04:00:00.000Z"));
  expect(request.serviceLevel!.clocks.filter(clock => clock.metric === "human_response")).toHaveLength(2);
  expect(request.serviceLevel!.clocks.filter(clock => clock.metric === "support_completion")).toHaveLength(2);
});
it("does not restart response clocks on repeated handoff or repeated source events", () => {
  const handoff = event("HANDOFF", "ESCALATED"); feed(handoff); feed(handoff);
  feed(event("HANDOFF", "ESCALATED", later, "ESCALATED"));
  expect(request.serviceLevel!.clocks.filter(clock => clock.metric === "human_response")).toHaveLength(1);
  expect(request.serviceLevel!.events.filter(item => item.action === "START")).toHaveLength(1);
});
it("uses service-configured completion criteria without equating requester resolution to fulfillment", () => {
  feed(event("DECISION", "AUTO_APPROVED"), [active({ metric: "support_completion", completionEvents: ["FULFILL"] })]);
  feed(event("FEEDBACK", "COMPLETED", later));
  const clock = request.serviceLevel!.clocks.find(item => item.metric === "support_completion")!;
  expect(clock.state).toBe("CANCELLED");
  expect(clockMeasurement(clock, later).outcome).toBe("CANCELLED");
});
it("supports approved pause/resume idempotently while keeping gross elapsed visible", () => {
  feed(event("DECISION", "ESCALATED"), [active({ pauseReasons: ["VENDOR"] })]);
  const state = request.serviceLevel!, clock = state.clocks.find(item => item.metric === "human_response")!;
  const pause = event("WAIT_VENDOR", "ESCALATED", "2026-10-17T01:10:00.000Z");
  expect(() => changeClockPause(state, clock.id, pause, "REQUESTER", false)).toThrow("PAUSE_NOT_APPROVED");
  changeClockPause(state, clock.id, pause, "VENDOR", false); changeClockPause(state, clock.id, pause, "VENDOR", false);
  const resume = event("VENDOR_REPLIED", "ESCALATED", "2026-10-17T01:40:00.000Z");
  changeClockPause(state, clock.id, resume, "VENDOR", true); changeClockPause(state, clock.id, resume, "VENDOR", true);
  changeClockPause(state, clock.id, pause, "VENDOR", false);
  expect(() => changeClockPause(state, clock.id, { ...pause, timestamp: later }, "VENDOR", false)).toThrow("CLOCK_EVENT_CONFLICT");
  expect(clockMeasurement(clock, later)).toMatchObject({ elapsedMs: 3_600_000, businessMs: 1_800_000, remainingMs: 1_800_000 });
  expect(state.events.filter(item => ["PAUSE", "RESUME"].includes(item.action))).toHaveLength(2);
});
it("shows due soon/breach without changing policy, permissions, priority or ticket status", () => {
  feed(event("DECISION", "ESCALATED"), [active()]);
  const original = structuredClone(request.decision), state = request.serviceLevel!, clock = state.clocks.find(item => item.metric === "human_response")!;
  expect(clockMeasurement(clock, "2026-10-17T01:59:00.000Z").outcome).toBe("DUE_SOON");
  const first = serviceLevelView(request, "2026-10-17T02:00:00.001Z");
  const again = serviceLevelView(request, "2026-10-17T03:00:00.000Z");
  expect(clockMeasurement(clock, "2026-10-17T02:00:00.001Z").outcome).toBe("BREACHED");
  expect(first.alerts).toHaveLength(1); expect(again.alerts[0].id).toBe(first.alerts[0].id);
  expect(request.decision).toEqual(original); expect(request.status).toBe("ESCALATED");
});
it("counts exact-target completion as met and excludes shadow/cancelled/running from the compliance denominator", () => {
  feed(event("DECISION", "ESCALATED"), [active()]);
  feed({ ...event("SEND_MESSAGE", "ESCALATED", later), senderMessage: "Thông tin xử lý" });
  const window = { from, to: "2026-10-18T00:00:00.000Z" };
  const summary = summarizeServiceLevels([request], window, later);
  expect(summary.metrics.find(item => item.metric === "human_response")).toMatchObject({ met: 1, breached: 0, eligible: 1, complianceRate: 1 });
  expect(summary.metrics.find(item => item.metric === "support_completion")?.eligible).toBe(0);
  expect(summarizeServiceLevels([request], window, later, true).metrics[0].complianceRate).toBeNull();
});
it("projects the earliest immutable group delivery, excludes deliveries before start and preserves stored state/version", () => {
  feed(event("DECISION", "ESCALATED"));
  feed(event("STOP", "STOPPED", "2026-10-17T03:00:00.000Z", "ESCALATED"));
  const original = structuredClone(request);
  const projection = withGroupResponseEvidence(request, [{ id: "before", timestamp: "2026-10-16T00:00:00.000Z" }, { id: "delivery", timestamp: later }]);
  expect(projection.serviceLevel!.clocks.find(clock => clock.metric === "human_response")).toMatchObject({ state: "COMPLETED", endedAt: later });
  expect(projection.version).toBe(request.version); expect(request).toEqual(original);
  expect(withGroupResponseEvidence(projection, [{ id: "delivery", timestamp: later }])).toEqual(projection);
  const tied = withGroupResponseEvidence(request, [{ id: "z-last", timestamp: later }, { id: "a-first", timestamp: later }]);
  expect(tied.serviceLevel!.events.find(item => item.reason === "GROUP_REPLY_DELIVERED")?.sourceEventId).toBe("a-first");
});
