"use client";
import Link from "next/link";
import {
  Inbox,
  Search,
  RefreshCw,
  ChevronRight,
  ShieldAlert,
  UserCheck,
  BookOpen,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ResultPage,
  type SupportSummary,
  type RequestStatus,
  type SupportRequest,
} from "@/domain/contracts";
import { displayId, statusLabels } from "@/domain/presentation";
import { catalog } from "@/domain/catalog";
import { type ReviewAction } from "@/domain/transitions";
import { browserApi } from "@/lib/browser-api";
import { Alert, Badge, Button } from "@/components/ui";
import { ReviewDetail } from "@/components/review-detail";
import { StaffWorkspace } from "@/components/staff-workspace";

export function ReviewConsole({ requestId }: { requestId?: string }) {
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  const [requests, setRequests] = useState<SupportSummary[]>([]),
    [selected, setSelected] = useState<SupportRequest | null>(null);
  const [reason, setReason] = useState(""),
    [target, setTarget] = useState<RequestStatus>("NEEDS_INFORMATION"),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [origin, setOrigin] = useState("support");
  const [queue, setQueue] = useState("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtersReady, setFiltersReady] = useState(false);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem("vng-review-filters-v1") || "null");
      if (saved && typeof saved === "object") {
        if ("filter" in saved && typeof saved.filter === "string" && ["pending", "knowledge", "all"].includes(saved.filter)) setFilter(saved.filter);
        if ("origin" in saved && typeof saved.origin === "string" && ["support", "verify", "all"].includes(saved.origin)) setOrigin(saved.origin);
        if ("queue" in saved && typeof saved.queue === "string" && ["all", "OUT_OF_POLICY", "AUTHORITY_REQUIRED"].includes(saved.queue)) setQueue(saved.queue);
        if ("search" in saved && typeof saved.search === "string") setSearch(saved.search.slice(0, 200));
        if ("employeeId" in saved && typeof saved.employeeId === "string") setEmployeeId(saved.employeeId.slice(0, 32));
      }
    } catch { /* Storage may be disabled; filtering still works in memory. */ }
    setFiltersReady(true);
  }, []);
  useEffect(() => {
    if (!filtersReady || requestId) return;
    try { sessionStorage.setItem("vng-review-filters-v1", JSON.stringify({ filter, origin, queue, search, employeeId })); }
    catch { /* Do not block the queue when session storage is unavailable. */ }
  }, [filter, origin, queue, search, employeeId, filtersReady, requestId]);
  function clearFilters() {
    setSearch(""); setEmployeeId(""); setFilter("all"); setOrigin("all"); setQueue("all");
  }
  const quickQueues = [
    { label: "Chờ xử lý", filter: "pending", queue: "all", icon: Inbox },
    { label: "Ngoài quy định", filter: "pending", queue: "OUT_OF_POLICY", icon: ShieldAlert },
    { label: "Cần thẩm quyền", filter: "pending", queue: "AUTHORITY_REQUIRED", icon: UserCheck },
    { label: "Gợi ý tri thức", filter: "knowledge", queue: "all", icon: BookOpen },
  ];
  const refresh = useCallback(
    async (cursor: string | null = null) => {
      const current = ++sequence.current;
      setLoading(true);
      if (!cursor) { setRequests([]); setTotal(0); setNextCursor(null); }
      try {
        const params = new URLSearchParams({
          view: "page",
          q: search,
          status: filter,
          origin,
          queue,
          limit: "30",
          ...(employeeId.trim() ? { employeeId: employeeId.trim() } : {}),
          ...(cursor ? { cursor } : {}),
        });
        const page = await browserApi<ResultPage<SupportSummary>>(
          `/api/support/requests?${params}`,
        );
        if (current !== sequence.current) return;
        setRequests((previous) =>
          cursor ? [...previous, ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
        setTotal(page.total);
        setError("");
      } catch (error) {
        if (current === sequence.current)
          setError(
            error instanceof Error ? error.message : "Không thể tải danh sách.",
          );
      } finally {
        if (current === sequence.current) setLoading(false);
      }
    },
    [search, employeeId, filter, origin, queue],
  );
  useEffect(() => {
    if (requestId || !filtersReady) return;
    setLoading(true);
    setRequests([]);
    setNextCursor(null);
    const tracker = sequence;
    const timer = setTimeout(() => void refresh(), 250);
    return () => {
      clearTimeout(timer);
      tracker.current++;
    };
  }, [refresh, requestId, filtersReady]);
  const loadSelected = useCallback(async () => {
    if (!requestId) return;
    const current = ++detailSequence.current;
    setSelected(null);
    setError("");
    try {
      const row = await browserApi<SupportRequest>(
        `/api/support/requests/${encodeURIComponent(requestId)}`,
      );
      if (current === detailSequence.current) setSelected(row);
    } catch (error) {
      if (current === detailSequence.current)
        setError(
          error instanceof Error ? error.message : "Không thể tải yêu cầu.",
        );
    }
  }, [requestId]);
  useEffect(() => {
    const tracker = detailSequence;
    setSelected(null);
    setReason("");
    setError("");
    setTarget("NEEDS_INFORMATION");
    void loadSelected();
    return () => {
      tracker.current++;
    };
  }, [loadSelected]);
  async function act(action: ReviewAction) {
    if (!selected || pending) return false;
    setPending(true);
    setError("");
    try {
      const updated = await browserApi<SupportRequest>(
        `/api/review/${selected.id}`,
        {
          action,
          reason,
          version: selected.version,
          ...(action === "OVERRIDE" ? { target } : {}),
        },
      );
      setSelected(updated);
      setReason("");
      if (!requestId) await refresh();
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Không thể cập nhật; chọn lại yêu cầu để tải phiên bản mới.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }
  return (
    <StaffWorkspace active="review">
      <main
        className="it-content"
        data-guide-stage={requestId ? "reviewer-detail" : "reviewer-list"}
      >
        {error && <Alert tone="error">{error}</Alert>}
        {!requestId && (
          <>
            <header className="it-page-heading">
              <div>
                <h1>Tiếp nhận hỗ trợ</h1>
              </div>
              <Button
                aria-label="Tải lại danh sách"
                variant="secondary"
                onClick={() => void refresh()}
                disabled={loading || pending}
              >
                <RefreshCw
                  size={16}
                  className={loading ? "animate-spin" : ""}
                />
                <span className="it-reload-label">Tải lại danh sách</span>
              </Button>
            </header>
            <div className="it-quick-queues" role="group" aria-label="Chọn nhanh hàng đợi">
              {quickQueues.map(({ label, filter: nextFilter, queue: nextQueue, icon: Icon }) => (
                <button key={label} type="button" aria-pressed={filter === nextFilter && queue === nextQueue}
                  onClick={() => { setFilter(nextFilter); setQueue(nextQueue); }}>
                  <Icon size={19} aria-hidden="true" />{label}
                </button>
              ))}
            </div>
            <section
              className="it-queue"
              aria-label="Danh sách yêu cầu"
              aria-busy={loading}
            >
              <div className="it-filters" data-guide="reviewer-filters">
                <label className="it-search">
                  Tìm nội dung hoặc mã yêu cầu
                  <div>
                    <Search size={18} aria-hidden="true" />
                    <input
                      type="search"
                      maxLength={200}
                      placeholder="Nội dung hoặc mã HT-…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                </label>
                <label className="it-search">
                  Mã nhân viên
                  <div>
                    <Search size={18} aria-hidden="true" />
                    <input
                      type="search"
                      maxLength={32}
                      placeholder="Ví dụ: anhtn"
                      value={employeeId}
                      onChange={(event) => setEmployeeId(event.target.value)}
                    />
                  </div>
                </label>
                <label>
                  Hiển thị
                  <select
                    aria-label="Hiển thị"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option value="pending">Đang chờ xử lý</option>
                    <option value="knowledge">
                      Gợi ý tri thức
                    </option>
                    <option value="all">Tất cả trạng thái</option>
                  </select>
                </label>
                <label>
                  Nguồn yêu cầu
                  <select
                    value={origin}
                    onChange={(event) => setOrigin(event.target.value)}
                  >
                    <option value="support">Người dùng gửi</option>
                    <option value="verify">Case Verify</option>
                    <option value="all">Tất cả</option>
                  </select>
                </label>
                <label className="it-queue-filter">
                  Hàng đợi chuyển tiếp
                  <select
                    value={queue}
                    onChange={(event) => setQueue(event.target.value)}
                  >
                    <option value="all">Tất cả lý do</option>
                    <option value="OUT_OF_POLICY">
                      Ngoài quy định
                    </option>
                    <option value="AUTHORITY_REQUIRED">
                      Cần thẩm quyền
                    </option>
                  </select>
                </label>
              </div>
              <div className="it-queue-caption">
                <h2>
                  Yêu cầu phù hợp <span>{total}</span>
                </h2>
                <span role="status" aria-live="polite">
                  {loading
                    ? "Đang tải danh sách…"
                    : `Đang hiển thị ${requests.length}/${total} yêu cầu.`}
                </span>
                {(search || employeeId || filter !== "all" || origin !== "all" || queue !== "all") && (
                  <Button variant="quiet" onClick={clearFilters}><X size={14} />Xóa bộ lọc</Button>
                )}
              </div>
              <div
                className="it-contained-scroll"
                data-guide={!requests.length ? "reviewer-list" : undefined}
                role="region"
                aria-label="Danh sách yêu cầu phù hợp"
                tabIndex={0}
              >
                {!loading && !requests.length && !error && (
                  <div className="it-empty">
                    <Inbox size={36} />
                    <h3>Chưa có yêu cầu phù hợp</h3>
                    <p>Thử đổi bộ lọc hoặc tìm bằng mã nhân viên, nội dung hay mã yêu cầu.</p>
                    <Button variant="secondary" onClick={clearFilters}>Xem tất cả yêu cầu</Button>
                    <Link className="button secondary" href="/send-help">
                      Tạo yêu cầu demo
                    </Link>
                  </div>
                )}
                {loading && !requests.length && <div className="it-loading" aria-hidden="true">
                  {[0, 1, 2].map((row) => <div key={row}><span /><span /><span /></div>)}
                </div>}
                {error && (
                  <div className="it-empty">
                    <p>Không thể tải danh sách. Hãy thử tải lại.</p>
                  </div>
                )}
                <ul className="it-request-list review-list">
                  {requests.map((request, index) => (
                    <li key={request.id}>
                      <Link
                        href={`/review?requestId=${request.id}`}
                        className="it-request-row"
                        data-guide={index === 0 ? "reviewer-list" : undefined}
                      >
                        <div className="it-row-id">
                          {displayId(request.id)}
                          <small>
                            {new Date(request.createdAt).toLocaleDateString(
                              "vi-VN",
                              { timeZone: "Asia/Ho_Chi_Minh" },
                            )}
                          </small>
                        </div>
                        <div className="it-row-subject">
                          <strong>{request.title}</strong>
                          <small>{catalog[request.serviceGroup].label}</small>
                          {request.employeeId && (
                            <small>Mã nhân viên: {request.employeeId}</small>
                          )}
                          {request.assignedTeam && (
                            <small>Nơi tiếp nhận: {request.assignedTeam}</small>
                          )}
                          <div className="it-row-tags">
                            {request.hasKnowledgeCandidate && (
                              <Badge tone="warning">Gợi ý tri thức</Badge>
                            )}
                            {request.uncertaintyClass === "OUT_OF_POLICY" && (
                              <Badge tone="warning">Ngoài quy định</Badge>
                            )}
                            {request.uncertaintyClass ===
                              "AUTHORITY_REQUIRED" && (
                              <Badge tone="warning">Cần thẩm quyền</Badge>
                            )}
                          </div>
                        </div>
                        <Badge
                          tone={
                            request.status === "ESCALATED"
                              ? "warning"
                              : request.status === "COMPLETED"
                                ? "success"
                                : "neutral"
                          }
                        >
                          {statusLabels[request.status]}
                        </Badge>
                        <ChevronRight size={18} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              {nextCursor && (
                <div className="it-queue-more">
                  <Button
                    variant="secondary"
                    disabled={loading}
                    onClick={() => void refresh(nextCursor)}
                  >
                    Tải thêm yêu cầu
                  </Button>
                </div>
              )}
            </section>
          </>
        )}
        {requestId && selected?.id === requestId ? (
          <ReviewDetail
            key={selected.id}
            request={selected}
            reason={reason}
            setReason={setReason}
            target={target}
            setTarget={setTarget}
            pending={pending}
            onAct={act}
            onReload={loadSelected}
          />
        ) : requestId ? (
          error ? (
            <div className="it-recovery">
              <Button variant="secondary" onClick={() => void loadSelected()}>
                Thử tải lại yêu cầu
              </Button>
              <Link href="/review" className="button secondary">
                ← Danh sách yêu cầu
              </Link>
            </div>
          ) : (
            <p role="status">Đang tải yêu cầu…</p>
          )
        ) : null}
      </main>
    </StaffWorkspace>
  );
}
