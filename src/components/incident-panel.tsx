"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { IncidentView } from "@/lib/support-incidents";
import { incidentLabels, incidentMessages } from "@/domain/shared-support";
import { browserApi } from "@/lib/browser-api";
import { Button } from "./ui";
export function IncidentUpdates({ incident }: { incident?: IncidentView }) {
  if (!incident) return null;
  return <section className="it-surface p-4 space-y-3" aria-label="Cập nhật sự cố chung">
    <h2>{incidentLabels[incident.topic]} · {incident.site}</h2>
    <p>Hồ sơ của bạn được liên kết với sự cố cùng khu vực. Cập nhật tại đây áp dụng chung; mã theo dõi và kết quả của bạn vẫn riêng.</p>
    {(incident.expired || incident.closed) && <p>Nhóm đã {incident.expired ? "hết thời hạn 24 giờ" : "đóng"}. Thông tin dưới đây là lịch sử; chưa xác nhận vấn đề riêng của bạn đã hết.</p>}
    {!incident.updates.length && <p>Chờ nhân viên cập nhật. Việc gộp nhóm không xác nhận nguyên nhân sự cố hoặc đã gửi thông báo bên ngoài.</p>}
    <ol className="space-y-2">{incident.updates.map(update => <li key={update.id}><time dateTime={update.at}>{new Date(update.at).toLocaleString("vi-VN")}</time><p>{update.message}</p></li>)}</ol>
  </section>;
}
type Group = IncidentView & { count: number; representativeId: string | null };
export function IncidentQueue() {
  const [groups, setGroups] = useState<Group[]>([]), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<{ id: string; state: keyof typeof incidentMessages; updateId: string; version: number } | null>(null);
  async function refresh() {
    try { setGroups(await browserApi<Group[]>("/api/review/incidents")); setError(""); }
    catch (cause) { setError((cause as Error).message); }
  }
  useEffect(() => { let current = true; void browserApi<Group[]>("/api/review/incidents").then(rows => { if (current) setGroups(rows); }).catch(cause => { if (current) setError((cause as Error).message); }); return () => { current = false; }; }, []);
  async function publish(group: Group, state: keyof typeof incidentMessages) {
    const body = attempt?.id === group.id && attempt.state === state ? attempt : { id: group.id, state, version: group.version, updateId: crypto.randomUUID() };
    setAttempt(body); setBusy(true); setError("");
    try { await browserApi("/api/review/incidents", body); setAttempt(null); await refresh(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <details className="it-surface p-4" open={groups.some(g => g.count > 1)}>
    <summary>Sự cố chung · {groups.filter(g => g.count > 0).length} nhóm đang mở</summary>
    <p className="it-field-hint">Một cập nhật cho mọi hồ sơ trong nhóm. Không tự đóng hồ sơ cá nhân. Tối đa 50 nhóm mới nhất; mọi hồ sơ vẫn có trong danh sách.</p>
    <Button variant="secondary" disabled={busy} onClick={() => { setAttempt(null); void refresh(); }}>Tải lại nhóm</Button>
    {error && <p role="alert">{error}</p>}
    {groups.filter(g => g.count > 0).map(group => <article key={group.id} className="my-4 space-y-2">
      <h3>{incidentLabels[group.topic]} · {group.site} · {group.count} hồ sơ</h3>
      {group.representativeId && <Link href={`/review?requestId=${group.representativeId}`}>Xem hồ sơ đại diện</Link>}
      <p>{group.updates.at(-1)?.message || "Chưa có cập nhật chung."}</p>
      <div className="flex flex-wrap gap-2">{(["INVESTIGATING", "MONITORING", "RESOLVED"] as const).map(state =>
        <Button key={state} variant="secondary" disabled={busy} title={incidentMessages[state]} onClick={() => void publish(group, state)}>
          {{ INVESTIGATING: "Thông báo đang kiểm tra", MONITORING: "Thông báo đang theo dõi", RESOLVED: "Đã khắc phục sự cố chung" }[state]}
        </Button>)}</div>
    </article>)}
  </details>;
}
