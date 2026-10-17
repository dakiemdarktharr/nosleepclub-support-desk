"use client";
import { useEffect, useState } from "react";
import type { serviceLevelView } from "@/domain/service-level";
import { metricLabels } from "@/domain/service-level-config";
import { browserApi } from "@/lib/browser-api";

type View = ReturnType<typeof serviceLevelView>;
export function duration(value: number | null) {
  if (value === null) return "Chưa tính được";
  const seconds = Math.floor(Math.abs(value) / 1000);
  return `${Math.floor(seconds / 3600)} giờ ${Math.floor(seconds % 3600 / 60)} phút ${seconds % 60} giây`;
}
const states = { RUNNING: "Đang chạy", PAUSED: "Tạm dừng", COMPLETED: "Hoàn tất", CANCELLED: "Đã hủy" };
const outcomes = { UNCONFIGURED: "Chưa cấu hình mục tiêu", WITHIN_TARGET: "Trong hạn", DUE_SOON: "Sắp đến hạn", BREACHED: "Quá hạn", MET: "Đạt mục tiêu", CANCELLED: "Hủy, không tính đạt" };
const reasons: Record<string, string> = {
  OWNER_TARGET_CALENDAR_PENDING: "Chờ chủ sở hữu phê duyệt mục tiêu và lịch",
  TARGET_OR_CALENDAR_PENDING: "Mục tiêu hoặc lịch chưa đủ để tính",
  NO_MATCH: "Chưa có cấu hình phù hợp", CONFIG_CONFLICT: "Nhiều cấu hình trùng mức ưu tiên",
  INVALID_CONFIG: "Cấu hình không hợp lệ", DRAFT: "Cấu hình còn là bản nháp", RETIRED: "Cấu hình đã ngừng áp dụng",
  APPROVED_TARGET: "Áp dụng mục tiêu đã được phê duyệt",
};

export function ServiceLevelPanel({ id, version }: { id: string; version: number }) {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    let sequence = 0;
    async function load() {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      const attempt = ++sequence;
      try {
        const result = await browserApi<View>(`/api/review/${id}/service-level`);
        if (current && attempt === sequence) { setView(result); setError(""); }
      } catch { if (current && attempt === sequence) setError("Chưa tải được phép đo. Thử tải lại hồ sơ."); }
    }
    void load();
    const timer = setInterval(() => void load(), 30_000);
    document.addEventListener("visibilitychange", load);
    return () => { current = false; clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [id, version]);
  return <section className="it-surface service-level-panel" aria-label="Đo thời gian phục vụ">
    <h2>Đo thời gian phục vụ</h2>
    <p className="it-field-hint">Pilot SHADOW ghi nhận phép đo SLI. Mục tiêu SLO nội bộ, cam kết SLA và bàn giao OLA cần chủ sở hữu phê duyệt.</p>
    {error && <p role="alert">{error}</p>}
    {!view && !error && <p role="status">Đang tải phép đo…</p>}
    {view && <>
      <p>Nhóm tiếp nhận hiện tại: <strong>{view.supportTeam ?? "Chưa xác định"}</strong></p>
      {view.coverage === "LEGACY_UNMEASURED" ? <p>LEGACY_UNMEASURED — hồ sơ cũ chưa ghi sự kiện đo, không hồi tố.</p> : !view.clocks.length ? <p>Chưa có sự kiện bắt đầu metric.</p> : <ul className="service-clock-list">
        {view.clocks.map(clock => <li key={clock.id}>
          <h3>{metricLabels[clock.metric]} · chu kỳ {clock.cycle}</h3>
          <p><strong>{states[clock.state]}</strong> · {clock.mode} · {outcomes[clock.outcome]}</p>
          <p>Thực trôi qua: {duration(clock.elapsedMs)} · Giờ làm việc: {duration(clock.businessMs)}</p>
          {clock.remainingMs !== null && <p>{clock.remainingMs < 0 ? "Quá hạn" : "Còn lại"}: {duration(clock.remainingMs)}</p>}
          <details><summary>Mục tiêu, lịch và trách nhiệm</summary>
          <dl className="service-clock-fields">
            <div><dt>Mục tiêu / phiên bản</dt><dd>{clock.snapshot?.kind ?? "Chưa cấu hình"} · {clock.snapshot?.id ?? "—"} / {clock.snapshot?.version ?? "—"}</dd></div>
            <div><dt>Mục tiêu thời gian</dt><dd>{clock.snapshot?.targetMs ? duration(clock.snapshot.targetMs) : "Chưa phê duyệt"}</dd></div>
            <div><dt>Owner cam kết</dt><dd>{clock.snapshot?.ownerId ?? "Chờ xác nhận"}</dd></div>
            <div><dt>Service / nhóm lúc bắt đầu</dt><dd>{clock.scope.serviceId ?? "Chưa xác định"} / {clock.supportTeam ?? "Chưa xác định"}</dd></div>
            <div><dt>Lịch</dt><dd>{clock.snapshot?.calendar ? `${clock.snapshot.calendar.id} / ${clock.snapshot.calendar.version} · ${clock.snapshot.calendar.timeZone}` : "Chờ phê duyệt giờ làm việc và ngày nghỉ"}</dd></div>
            <div><dt>Lý do áp dụng</dt><dd>{reasons[clock.reason] ?? clock.reason}</dd></div>
            {clock.metric === "support_completion" && <div><dt>Nguồn hoàn tất / định nghĩa</dt><dd>{clock.snapshot?.completionEvents.join(", ") ?? "Chưa cấu hình"} / {clock.snapshot?.definitionVersion ?? "—"}</dd></div>}
            <div><dt>Tạm dừng</dt><dd>{clock.pauses.length ? clock.pauses.map(pause => `${pause.reason}: ${pause.startedAt} → ${pause.endedAt ?? "đang chờ"}`).join("; ") : "Không; thời gian chờ vẫn được ghi nhận"}</dd></div>
          </dl>
          </details>
          {clock.mode === "ACTIVE" && ["DUE_SOON", "BREACHED"].includes(clock.outcome) && <p role="status">Cảnh báo trong hàng đợi cho: {clock.snapshot?.alertTeams.join(", ")}. Cần nhân viên kiểm tra.</p>}
        </li>)}
      </ul>}
      <details><summary>Sự kiện đo và căn cứ</summary><ol className="service-events">{view.events.map(event => <li key={event.id}><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString("vi-VN")}</time> · {event.action} · {event.reason} · {event.team ?? "chưa có nhóm"}<small>Nguồn: {event.sourceEventId}</small></li>)}</ol></details>
      <p className="it-field-hint">Đo tại {new Date(view.measuredAt).toLocaleString("vi-VN")}. Cập nhật mỗi 30 giây khi trang đang mở; phép tính dùng giờ server.</p>
    </>}
  </section>;
}
