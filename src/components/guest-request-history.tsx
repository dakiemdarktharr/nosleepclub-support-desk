"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { RequestStatus, SupportRequest } from "@/domain/contracts";
import { displayId } from "@/domain/presentation";
import { browserApi } from "@/lib/browser-api";
import { guestRequestIds } from "@/lib/guest-request-history";
import { Button, Card } from "./ui";

const labels: Record<RequestStatus, string> = {
  RECEIVED: "Chờ xử lý · Pending", PROCESSING: "Đang xử lý · Pending", ESCALATED: "Chờ nhân viên xử lý · Pending",
  AUTO_APPROVED: "Đã có hướng dẫn · Approved", APPROVED_BY_HUMAN: "Đã duyệt · Approved",
  NEEDS_INFORMATION: "Cần bổ sung thông tin · Needs more information", REJECTED: "Đã từ chối · Rejected",
  STOPPED: "Đã dừng xử lý", COMPLETED: "Đã hoàn tất",
};
type Item = { id: string; status?: RequestStatus; version?: number; unavailable?: boolean };

export function GuestRequestHistory() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true, running = false;
    async function load() {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      const ids = guestRequestIds();
      setTotal(ids.length);
      const lastPage = Math.max(0, Math.ceil(ids.length / 10) - 1);
      if (page > lastPage) { setPage(lastPage); running = false; return; }
      const visible = ids.slice(page * 10, (page + 1) * 10);
      setLoading(true);
      setItems(previous => visible.map(id => previous.find(item => item.id === id) ?? { id }));
      const results = await Promise.all(visible.map(async id => {
        try {
          const request = await browserApi<SupportRequest>(`/api/support/requests/${id}`);
          return { id, status: request.status, version: request.version };
        } catch { return { id, unavailable: true }; }
      }));
      if (active) {
        setItems(previous => results.map(item => {
          const old = previous.find(value => value.id === item.id);
          return old?.version !== undefined && item.version !== undefined && old.version > item.version ? old : item;
        }));
        setLoading(false);
      }
      running = false;
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const reload = () => void load();
    window.addEventListener("focus", reload);
    window.addEventListener("storage", reload);
    document.addEventListener("visibilitychange", reload);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", reload); window.removeEventListener("storage", reload); document.removeEventListener("visibilitychange", reload); };
  }, [page, refresh]);
  if (!total) return null;
  return <section className="my-6" aria-label="Yêu cầu đã gửi" aria-busy={loading}>
    <Card>
      <div className="flex items-center justify-between gap-3"><h2>Yêu cầu đã gửi</h2><Button variant="quiet" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Cập nhật trạng thái</Button></div>
      <ul className="divide-y divide-slate-100" aria-live="polite">
        {items.map(item => <li key={item.id} className="py-3"><Link className="font-bold text-orange-700" href={`/requests/${item.id}`}>{displayId(item.id)}</Link><p className="text-sm text-slate-600">{item.unavailable ? "Chưa tải được trạng thái. Mở yêu cầu hoặc thử cập nhật lại." : item.status ? labels[item.status] : "Đang tải trạng thái…"}</p></li>)}
      </ul>
      {total > 10 && <div className="flex items-center gap-3"><Button variant="quiet" disabled={!page} onClick={() => setPage(value => value - 1)}>Trước</Button><span>Trang {page + 1}/{Math.ceil(total / 10)}</span><Button variant="quiet" disabled={(page + 1) * 10 >= total} onClick={() => setPage(value => value + 1)}>Tiếp</Button></div>}
    </Card>
  </section>;
}
