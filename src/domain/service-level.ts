import type { AuditEvent, SupportRequest } from "./contracts";
import { businessElapsed } from "./service-calendar";
import { completionEvents, resolveServiceLevelPolicy, serviceCatalog, type ServiceLevelPolicy, type ServiceMetric, type ServiceScope } from "./service-level-config";

export type ClockEvent = {
  id: string; sourceEventId: string; clockId?: string; timestamp: string;
  action: "START" | "COMPLETE" | "CANCEL" | "PAUSE" | "RESUME" | "CONTEXT_CHANGED";
  actor: string; team: string | null; reason: string; scope?: ServiceScope;
};
export type ServiceClock = {
  id: string; metric: ServiceMetric; cycle: number; serviceCycleId: string | null;
  state: "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
  startedAt: string; endedAt: string | null;
  snapshot: ServiceLevelPolicy | null; configurationReason: string;
  scope: ServiceScope; supportTeam: string | null;
  pauses: Array<{ startedAt: string; endedAt: string | null; reason: string }>;
};
export type ServiceLevelState = {
  schemaVersion: 1; trackedFrom: string; clocks: ServiceClock[]; events: ClockEvent[];
  processedEventIds: string[]; scope: ServiceScope | null; supportTeam: string | null;
};
export type ClockOutcome = "CANCELLED" | "UNCONFIGURED" | "BREACHED" | "MET" | "DUE_SOON" | "WITHIN_TARGET";
export const newServiceLevelState = (at: string): ServiceLevelState => ({
  schemaVersion: 1, trackedFrom: at, clocks: [], events: [], processedEventIds: [], scope: null, supportTeam: null,
});
const terminal = (status: string) => ["COMPLETED", "STOPPED", "REJECTED"].includes(status);
function context(request: SupportRequest): ServiceScope {
  const service = serviceCatalog.find(item => item.serviceGroup === request.canonical?.serviceGroup);
  return { organizationId: "support-demo", ...(service ? { serviceId: service.serviceId } : {}),
    ...(service?.serviceOwnerId ? { serviceOwnerId: service.serviceOwnerId } : {}),
    ...(request.canonical ? { requestType: request.canonical.requestKind } : {}) };
}
function record(state: ServiceLevelState, source: AuditEvent, action: ClockEvent["action"], reason: string, clock?: ServiceClock) {
  const id = `${source.id}:${clock?.id ?? "context"}:${action}`;
  if (state.events.some(event => event.id === id)) return;
  state.events.push({ id, sourceEventId: source.id, ...(clock ? { clockId: clock.id } : {}),
    timestamp: source.timestamp, action, actor: source.actor, team: state.supportTeam, reason,
    ...(action === "CONTEXT_CHANGED" ? { scope: structuredClone(state.scope ?? {}) } : {}) });
}
function start(state: ServiceLevelState, metric: ServiceMetric, source: AuditEvent, policies?: ServiceLevelPolicy[]) {
  const selected = resolveServiceLevelPolicy(metric, state.scope ?? {}, source.timestamp, policies);
  const cycle = state.clocks.filter(clock => clock.metric === metric).length + 1;
  const clock: ServiceClock = {
    id: `${metric}:${source.id}`, metric, cycle,
    serviceCycleId: metric === "support_completion" ? `${metric}:${source.id}` : state.clocks.findLast(item => item.metric === "support_completion")?.id ?? null,
    state: "RUNNING", startedAt: source.timestamp, endedAt: null,
    snapshot: selected.policy, configurationReason: selected.reason, scope: structuredClone(state.scope ?? {}),
    supportTeam: state.supportTeam, pauses: [],
  };
  state.clocks.push(clock); record(state, source, "START", selected.reason, clock);
}
function finish(state: ServiceLevelState, clock: ServiceClock, source: AuditEvent, cancel = false) {
  if (clock.state === "COMPLETED" || clock.state === "CANCELLED") return;
  clock.state = cancel ? "CANCELLED" : "COMPLETED";
  clock.endedAt = source.timestamp;
  const pause = clock.pauses.at(-1);
  if (pause && !pause.endedAt) pause.endedAt = source.timestamp;
  record(state, source, cancel ? "CANCEL" : "COMPLETE", source.action, clock);
}

/** Called inside the existing CAS mutation. Legacy records are deliberately untouched. */
export function applyServiceLevelEvents(request: SupportRequest, sources: AuditEvent[], policies?: ServiceLevelPolicy[]) {
  const state = request.serviceLevel;
  if (!state) return;
  for (const source of sources) {
    if (state.processedEventIds.includes(source.id)) continue;
    const scope = context(request), team = request.decision?.assignedTeam ?? null;
    if (JSON.stringify(scope) !== JSON.stringify(state.scope) || team !== state.supportTeam) {
      state.scope = scope; state.supportTeam = team;
      record(state, source, "CONTEXT_CHANGED", "CURRENT_ROUTING_CHANGED_SNAPSHOTS_RETAINED");
    }
    const open = (metric: ServiceMetric) => state.clocks.find(clock => clock.metric === metric && !clock.endedAt);
    const reopened = source.beforeStatus !== null && terminal(source.beforeStatus) && !terminal(source.afterStatus);
    if ((source.action === "DECISION" && !state.clocks.some(clock => clock.metric === "support_completion")) || reopened)
      start(state, "support_completion", source, policies);
    const serviceCycleId = state.clocks.findLast(clock => clock.metric === "support_completion")?.id ?? null;
    if (["DECISION", "HANDOFF", "CONVERSATION", "CLARIFICATION", "OVERRIDE"].includes(source.action) &&
      ["ESCALATED", "NEEDS_INFORMATION"].includes(source.afterStatus) && !open("human_response") &&
      !state.clocks.some(clock => clock.metric === "human_response" && clock.serviceCycleId === serviceCycleId))
      start(state, "human_response", source, policies);
    if (["SEND_MESSAGE", "REQUEST_INFORMATION"].includes(source.action) && source.senderMessage?.trim()) {
      const response = open("human_response");
      if (response) finish(state, response, source);
    }
    const waiting = open("requester_wait");
    if (waiting && (source.action === "CLARIFICATION" || source.afterStatus !== "NEEDS_INFORMATION"))
      finish(state, waiting, source, ["STOPPED", "REJECTED"].includes(source.afterStatus));
    if (source.afterStatus === "NEEDS_INFORMATION" && !open("requester_wait"))
      start(state, "requester_wait", source, policies);
    if (terminal(source.afterStatus)) {
      for (const clock of state.clocks.filter(item => !item.endedAt)) {
        const completionSource = source.action === "FEEDBACK" ? "REQUESTER_RESOLVED" : source.action === "FULFILL" ? "FULFILL" : null;
        const completed = clock.metric === "support_completion" && source.afterStatus === "COMPLETED" &&
          completionSource !== null && (clock.snapshot?.completionEvents ?? completionEvents).some(allowed => allowed === completionSource);
        finish(state, clock, source, !completed);
      }
    }
    state.processedEventIds.push(source.id);
  }
}

/** Future integrations may pause only with an explicitly approved exception. No pilot API exposes this. */
export function changeClockPause(state: ServiceLevelState, clockId: string, source: AuditEvent, reason: string, resume: boolean) {
  const clock = state.clocks.find(item => item.id === clockId);
  if (!clock) throw new Error("CLOCK_NOT_RUNNING");
  const action = resume ? "RESUME" : "PAUSE";
  const prior = state.events.find(event => event.sourceEventId === source.id && event.clockId === clock.id && event.action === action);
  if (prior) {
    if (prior.timestamp !== source.timestamp || prior.actor !== source.actor || prior.reason !== (resume ? "APPROVED_WAIT_ENDED" : reason))
      throw new Error("CLOCK_EVENT_CONFLICT");
    return;
  }
  if (clock.endedAt) throw new Error("CLOCK_NOT_RUNNING");
  if (source.timestamp < clock.startedAt || source.timestamp < (clock.pauses.at(-1)?.endedAt ?? clock.pauses.at(-1)?.startedAt ?? clock.startedAt))
    throw new Error("NON_MONOTONIC_EVENT");
  if (!resume && !clock.snapshot?.pauseReasons.some(allowed => allowed === reason)) throw new Error("PAUSE_NOT_APPROVED");
  if (resume) {
    if (clock.state !== "PAUSED") throw new Error("CLOCK_NOT_PAUSED");
    clock.pauses.at(-1)!.endedAt = source.timestamp; clock.state = "RUNNING";
  } else {
    if (clock.state !== "RUNNING") throw new Error("CLOCK_ALREADY_PAUSED");
    clock.pauses.push({ startedAt: source.timestamp, endedAt: null, reason }); clock.state = "PAUSED";
  }
  record(state, source, action, resume ? "APPROVED_WAIT_ENDED" : reason, clock);
}

export function clockMeasurement(clock: ServiceClock, at: string) {
  const end = clock.endedAt ?? at, elapsedMs = Math.max(0, Date.parse(end) - Date.parse(clock.startedAt));
  const policy = clock.snapshot;
  let businessMs = businessElapsed(clock.startedAt, end, policy?.calendar ?? null);
  if (businessMs !== null) for (const pause of clock.pauses) {
    const paused = businessElapsed(pause.startedAt, pause.endedAt ?? end, policy?.calendar ?? null);
    if (paused === null) { businessMs = null; break; }
    businessMs -= paused;
  }
  const configured = policy?.status === "ACTIVE" && policy.targetMs !== null && businessMs !== null;
  const remainingMs = configured ? policy.targetMs! - businessMs! : null;
  const outcome: ClockOutcome = clock.state === "CANCELLED" ? "CANCELLED" : !configured ? "UNCONFIGURED" :
    remainingMs! < 0 ? "BREACHED" : clock.state === "COMPLETED" ? "MET" :
    policy.warningBeforeMs !== null && remainingMs! <= policy.warningBeforeMs ? "DUE_SOON" : "WITHIN_TARGET";
  return { elapsedMs, businessMs, remainingMs, outcome,
    mode: policy?.status ?? "UNCONFIGURED", reason: configured ? "APPROVED_TARGET" :
      clock.configurationReason !== "MATCHED" ? clock.configurationReason : !policy?.ownerId ? "OWNER_TARGET_CALENDAR_PENDING" : "TARGET_OR_CALENDAR_PENDING" };
}

// The immutable group-delivery record is authoritative; projection preserves ticket version/membership.
export function withGroupResponseEvidence(request: SupportRequest, replies: Array<{ id: string; timestamp: string }>): SupportRequest {
  if (!request.serviceLevel || !replies.length) return request;
  const projected = structuredClone(request), state = projected.serviceLevel!;
  for (const clock of state.clocks.filter(item => item.metric === "human_response")) {
    const reply = [...replies].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)).find(item =>
      item.timestamp >= clock.startedAt && (!clock.endedAt || item.timestamp <= clock.endedAt));
    if (!reply) continue;
    clock.state = "COMPLETED"; clock.endedAt = reply.timestamp;
    clock.pauses = clock.pauses.filter(pause => pause.startedAt < reply.timestamp).map(pause =>
      ({ ...pause, endedAt: !pause.endedAt || pause.endedAt > reply.timestamp ? reply.timestamp : pause.endedAt }));
    state.events = state.events.filter(event => event.clockId !== clock.id || !["COMPLETE", "CANCEL"].includes(event.action));
    state.events.push({ id: `group:${reply.id}:${clock.id}`, sourceEventId: reply.id, clockId: clock.id,
      timestamp: reply.timestamp, action: "COMPLETE", actor: "reviewer-group-delivery", team: clock.supportTeam, reason: "GROUP_REPLY_DELIVERED" });
  }
  return projected;
}

export function serviceLevelView(request: SupportRequest, at: string) {
  const state = request.serviceLevel;
  const clocks = state?.clocks.map(clock => ({ ...clock, ...clockMeasurement(clock, at) })) ?? [];
  return { measuredAt: at, coverage: state ? "TRACKED" : "LEGACY_UNMEASURED",
    supportTeam: state?.supportTeam ?? request.decision?.assignedTeam ?? null,
    clocks,
    // Derived after joining all persisted sources, so a shared reply cannot cause a false breach.
    // Stable alert IDs produce one queue signal per clock, with no status/permission mutation.
    alerts: clocks.filter(clock => ["DUE_SOON", "BREACHED"].includes(clock.outcome)).map(clock => ({
      id: `alert:${clock.id}`, clockId: clock.id, outcome: clock.outcome, teams: clock.snapshot?.alertTeams ?? [],
    })),
    events: state?.events ?? [],
  };
}
