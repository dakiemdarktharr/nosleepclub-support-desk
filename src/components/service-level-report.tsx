"use client";
import { useState } from "react";
import Link from "next/link";
import type { serviceLevelReport } from "@/services/service-level";
import { metricLabels } from "@/domain/service-level-config";
import { browserApi } from "@/lib/browser-api";
import { Button } from "./ui";
import { StaffWorkspace } from "./staff-workspace";
import { duration } from "./service-level-panel";

type Report = Awaited<ReturnType<typeof serviceLevelReport>>;
export function ServiceLevelReport() {
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function load() {
    setPending(true); setError(""); setReport(null);
    try {
      const params = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
      setReport(await browserApi<Report>(`/api/review/service-level?${params}`));
    } catch { setError("Không tải được báo cáo. Kiểm tra khoảng thời gian và thử lại."); }
    finally { setPending(false); }
  }
  return <StaffWorkspace active="review"><main className="it-content">
    <Link href="/review">← Danh sách yêu cầu</Link>
    <h1>Phép đo thời gian phục vụ</h1>
    <p>SLI là phép đo; SLO là mục tiêu nội bộ; SLA là cam kết được duyệt; OLA là mục tiêu giữa các đội.</p>
    <p>Pilot SHADOW chưa có cam kết SLA VNG. Chọn chu kỳ bắt đầu trong khoảng từ (gồm) đến (không gồm). Không gồm dữ liệu Verify.</p>
    <form className="service-report-form" onSubmit={event => { event.preventDefault(); void load(); }}>
      <label>Từ (giờ trên máy)<input required type="datetime-local" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Đến (giờ trên máy)<input required type="datetime-local" value={to} onChange={event => setTo(event.target.value)} /></label>
      <Button type="submit" disabled={pending || !from || !to || from >= to}>{pending ? "Đang tính…" : "Xem phép đo"}</Button>
    </form>
    {error && <p role="alert">{error}</p>}
    {report && <section className="service-level-panel" aria-label="Kết quả phép đo">
      <p>Khoảng bắt đầu chu kỳ: {new Date(report.from).toLocaleString("vi-VN")} → {new Date(report.to).toLocaleString("vi-VN")} (không gồm mốc cuối).</p>
      <p>{report.ticketsInSample} hồ sơ trong mẫu · {report.legacyUnmeasured} hồ sơ cũ chưa đo · tối đa {report.sampleLimit} hồ sơ.</p>
      {report.truncated && <p role="alert">Tập kết quả vượt giới hạn. Thu hẹp khoảng thời gian; tỷ lệ đạt được ẩn vì mẫu chưa đầy đủ.</p>}
      <p>{report.notice}</p>
      <h2>Cần kiểm tra thời hạn</h2>
      {!report.attention.length ? <p>Không có cảnh báo từ mục tiêu đã duyệt trong tập đang đọc.</p> : <ul className="service-clock-list">{report.attention.map(item => <li key={item.clockId}>
        <Link href={`/review?requestId=${item.requestId}`}>{metricLabels[item.metric]} · {item.requestId.slice(0, 8)}</Link>
        <p>{item.outcome === "BREACHED" ? "Quá hạn" : "Sắp đến hạn"}: {duration(item.remainingMs)} · {item.policyId} / {item.policyVersion}</p>
        <p>Owner: {item.ownerId} · Nhóm nhận cảnh báo: {item.teams.join(", ")}</p>
      </li>)}</ul>}
      <ul className="service-clock-list">{report.metrics.map(metric => <li key={metric.metric}>
        <h2>{metricLabels[metric.metric]}</h2>
        <p>{metric.samples} chu kỳ · {metric.completed} hoàn tất · {metric.open} đang mở · {metric.cancelled} hủy</p>
        <p>{metric.shadow} SHADOW · {metric.unconfigured} chưa có mục tiêu · {metric.businessTimeMeasured} tính được giờ làm việc</p>
        {metric.objectives.map(objective => <p key={objective.kind}>{objective.kind}: mẫu số {objective.eligible} · đạt {objective.met} · trượt {objective.breached} · tỷ lệ {objective.rate === null ? "chưa có cơ sở tính" : `${Math.round(objective.rate * 10000) / 100}%`}</p>)}
      </li>)}</ul>
      <p className="it-field-hint">Mẫu số: mục tiêu ACTIVE có cấu hình đầy đủ, đã kết thúc hoặc đang quá hạn. Tách riêng hủy, SHADOW, thiếu cấu hình và chu kỳ đang mở chưa quá hạn. Phòng ban người gửi không xác định owner hay ưu tiên.</p>
    </section>}
  </main></StaffWorkspace>;
}
