"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditEvent, ResultPage } from "@/domain/contracts";
import { browserApi } from "@/lib/browser-api";
import { Alert, Button, Card, Input } from "@/components/ui";
import { AuditTimeline } from "@/components/support-history";
import { StaffWorkspace } from "@/components/staff-workspace";
export default function AuditPage() {
  const sequence = useRef(0),
    [events, setEvents] = useState<AuditEvent[]>([]),
    [query, setQuery] = useState(""),
    [employeeId, setEmployeeId] = useState(""),
    [origin, setOrigin] = useState("support"),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [cursor, setCursor] = useState<string | null>(null),
    [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<{
    total: number;
    resolvedFeedback: number;
    handoffs: number;
    modelFailures: number;
    pendingReview: number;
  } | null>(null);
  const load = useCallback(
    async (next: string | null = null) => {
      const current = ++sequence.current;
      setPending(true);
      try {
        const params = new URLSearchParams({
          view: "page",
          q: query,
          origin,
          limit: "30",
          ...(employeeId.trim() ? { employeeId: employeeId.trim() } : {}),
          ...(next ? { cursor: next } : {}),
        });
        const page = await browserApi<ResultPage<AuditEvent>>(
          `/api/support/events?${params}`,
        );
        if (current === sequence.current) {
          setEvents((previous) =>
            next ? [...previous, ...page.items] : page.items,
          );
          setCursor(page.nextCursor);
          setTotal(page.total);
          setError("");
        }
      } catch (e) {
        if (current === sequence.current)
          setError(e instanceof Error ? e.message : "Không tải được lịch sử.");
      } finally {
        if (current === sequence.current) setPending(false);
      }
    },
    [query, employeeId, origin],
  );
  useEffect(() => {
    const tracker = sequence;
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      tracker.current++;
    };
  }, [load]);
  useEffect(() => {
    void browserApi<typeof metrics>("/api/support/metrics")
      .then(setMetrics)
      .catch(() => setError("Không tải được số liệu."));
  }, []);
  return (
    <StaffWorkspace active="audit">
      <main className="it-content space-y-6">
        <header className="it-page-heading">
          <div>
            <p className="eyebrow">LỊCH SỬ XỬ LÝ</p>
            <h1>Mỗi quyết định, một dấu vết.</h1>
          </div>
        </header>
        <p>
          Tìm bằng mã nhân viên, nội dung hoặc mã yêu cầu. Các trang tiếp theo giữ lại khả năng
          tìm hồ sơ cũ; case Verify có bộ lọc riêng.
        </p>
        {metrics && (
          <Card>
            <dl className="audit-metrics" aria-label="Tổng quan hồ sơ demo">
              {[
                ["Tổng hồ sơ", metrics.total], ["Đã tự giải quyết", metrics.resolvedFeedback],
                ["Chuyển người", metrics.handoffs], ["Lỗi trợ lý", metrics.modelFailures],
                ["Chờ xử lý", metrics.pendingReview],
              ].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
            </dl>
            <p className="text-sm">
              Tổng số dữ liệu demo đã lưu, gồm Verify; không phải kết quả đo trên
              người dùng thật.
            </p>
          </Card>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
          className="audit-filters"
        >
          <label>
            Nội dung hoặc mã yêu cầu
            <Input
              maxLength={200}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ví dụ: VPN hoặc mã yêu cầu"
            />
          </label>
          <label>
            Mã nhân viên
            <Input
              maxLength={32}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="Ví dụ: anhtn"
            />
          </label>
          <label>
            Nguồn dữ liệu
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="support">Người dùng gửi</option>
              <option value="verify">Case Verify</option>
              <option value="all">Tất cả</option>
            </select>
          </label>
          <Button disabled={pending}>Lọc / tải lại</Button>
        </form>
        {error && <Alert tone="error">{error}</Alert>}
        <Card aria-busy={pending}>
          <p role="status">
            {pending ? "Đang tải lịch sử…" : `${events.length}/${total} sự kiện`}
          </p>
          {events.length ? (
            <AuditTimeline events={events} />
          ) : (
            !pending && <p>Chưa có sự kiện phù hợp.</p>
          )}
          {cursor && (
            <Button
              disabled={pending}
              variant="secondary"
              onClick={() => void load(cursor)}
            >
              Tải thêm lịch sử
            </Button>
          )}
        </Card>
      </main>
    </StaffWorkspace>
  );
}
