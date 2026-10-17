import { z } from "zod";
import type { SupportRequest } from "@/domain/contracts";
import { metricIds } from "@/domain/service-level-config";
import { clockMeasurement, serviceLevelView, withGroupResponseEvidence } from "@/domain/service-level";
import { getSupportRequest, listSupportRequests, supportDatabase, SupportError } from "@/lib/support-repository";
import { groupResponseEvidence } from "@/lib/support-groups";

export async function requestServiceLevels(id: string) {
  const request = await getSupportRequest(id);
  if (!request) throw new SupportError("NOT_FOUND", "Không tìm thấy yêu cầu.", 404);
  const evidence = request.serviceLevel ? (await groupResponseEvidence([id])).get(id) ?? [] : [];
  return serviceLevelView(withGroupResponseEvidence(request, evidence), new Date().toISOString());
}
export const reportWindowSchema = z.object({
  from: z.string().datetime().transform(value => new Date(value).toISOString()),
  to: z.string().datetime().transform(value => new Date(value).toISOString()),
}).strict().refine(window => window.from < window.to, "Invalid report window");
export function summarizeServiceLevels(rows: SupportRequest[], window: z.infer<typeof reportWindowSchema>, at: string, truncated = false) {
  const metrics = metricIds.map(metric => {
    const clocks = rows.flatMap(row => row.serviceLevel?.clocks ?? []).filter(clock =>
      clock.metric === metric && clock.startedAt >= window.from && clock.startedAt < window.to);
    const measured = clocks.map(clock => ({ clock, measurement: clockMeasurement(clock, at) }));
    const met = measured.filter(item => item.measurement.outcome === "MET").length;
    const breached = measured.filter(item => item.measurement.outcome === "BREACHED").length;
    const eligible = met + breached;
    return { metric, samples: clocks.length, completed: clocks.filter(clock => clock.state === "COMPLETED").length,
      cancelled: clocks.filter(clock => clock.state === "CANCELLED").length,
      open: clocks.filter(clock => !clock.endedAt).length,
      shadow: clocks.filter(clock => clock.snapshot?.status === "SHADOW").length,
      businessTimeMeasured: measured.filter(item => item.measurement.businessMs !== null).length,
      unconfigured: measured.filter(item => item.measurement.outcome === "UNCONFIGURED").length,
      met, breached, eligible, complianceRate: eligible && !truncated ? met / eligible : null,
      objectives: ["SLA", "SLO", "OLA"].map(kind => {
        const selected = measured.filter(item => item.clock.snapshot?.kind === kind && ["MET", "BREACHED"].includes(item.measurement.outcome));
        const passed = selected.filter(item => item.measurement.outcome === "MET").length;
        return { kind, eligible: selected.length, met: passed, breached: selected.length - passed,
          rate: selected.length && !truncated ? passed / selected.length : null };
      }),
    };
  });
  return { ...window, measuredAt: at, ticketsInSample: rows.length,
    legacyUnmeasured: rows.filter(row => !row.serviceLevel).length, truncated, sampleLimit: 500,
    confidence: "DESCRIPTIVE_ONLY", notice: "Số mẫu và độ phủ chỉ mô tả tập đang đọc; SHADOW không chứng minh đạt SLA. Không suy ra p90/p95.", metrics,
    attention: rows.flatMap(row => serviceLevelView(row, at).clocks.filter(clock =>
      clock.startedAt >= window.from && clock.startedAt < window.to && ["DUE_SOON", "BREACHED"].includes(clock.outcome)).map(clock => ({
      requestId: row.id, clockId: clock.id, metric: clock.metric, outcome: clock.outcome,
      remainingMs: clock.remainingMs, ownerId: clock.snapshot?.ownerId, teams: clock.snapshot?.alertTeams ?? [],
      policyId: clock.snapshot?.id, policyVersion: clock.snapshot?.version,
    }))),
  };
}

export async function serviceLevelReport(value: unknown) {
  const window = reportWindowSchema.parse(value), db = supportDatabase();
  // Explicitly bounded demo report. Verify traffic is never mixed with business requests.
  const rows = db ? (await db.collection<{ _id: string; data: SupportRequest }>("v3_support_requests").find({
    "data.input.verifyRunId": { $exists: false },
    $or: [{ "data.createdAt": { $gte: window.from, $lt: window.to } },
      { "data.serviceLevel.clocks": { $elemMatch: { startedAt: { $gte: window.from, $lt: window.to } } } }],
  }, { projection: { "data.id": 1, "data.createdAt": 1, "data.serviceLevel": 1 } })
    .sort({ "data.createdAt": -1, _id: -1 }).limit(501).toArray()).map(row => row.data)
    : (await listSupportRequests(true)).filter(row => !row.input.verifyRunId &&
      ((row.createdAt >= window.from && row.createdAt < window.to) || row.serviceLevel?.clocks.some(clock => clock.startedAt >= window.from && clock.startedAt < window.to)));
  const selected = rows.slice(0, 500), evidence = await groupResponseEvidence(selected.filter(row => row.serviceLevel).map(row => row.id));
  const at = new Date().toISOString();
  return summarizeServiceLevels(selected.map(row => withGroupResponseEvidence(row, evidence.get(row.id) ?? [])), window, at, rows.length > 500);
}
