"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { type IdentityApplication, type IdentityAudit, environments, operations, resources, scopeKey, scopeRisk } from "@/domain/identity";
import { identityApi, identityStatus, ScopeList } from "./identity-ui";
import { Alert, Button } from "./ui";
import { StaffWorkspace } from "./staff-workspace";

function ApplicationDecision({ row, onDone }: { row: IdentityApplication; onDone: (message: string) => Promise<void> }) {
  const [reason, setReason] = useState(""); const [suffix, setSuffix] = useState("");
  const [selected, setSelected] = useState<string[]>(row.requestedScopes.map(scopeKey));
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <article className="identity-card"><div className="identity-review-heading"><h2>{row.fullName}</h2><span className="eyebrow">{identityStatus[row.status]}</span></div><p>{row.profile?.name ?? (row.job.kind === "new" ? `${row.job.name} · Job mới` : "Job có sẵn")} · đơn <code>{row.id}</code></p>
    <details><summary>Xem phạm vi yêu cầu</summary><ScopeList scopes={row.requestedScopes} /></details>
    {row.decisionReason && <p>Lý do: {row.decisionReason}</p>}{row.employeeId && <p>ID đã cấp: <strong>{row.employeeId}</strong></p>}
    {["PENDING", "ID_CONFLICT"].includes(row.status) && <form className="identity-form" onSubmit={(event) => event.preventDefault()}>
      {row.job.kind === "new" && <fieldset><legend>Chọn phạm vi duyệt cho job mới</legend>{row.requestedScopes.map((scope, index) => <label key={scopeKey(scope)} className="check-row"><input type="checkbox" checked={selected.includes(scopeKey(scope))} onChange={(event) => setSelected(event.target.checked ? [...selected, scopeKey(scope)] : selected.filter((key) => key !== scopeKey(scope)))} /><span>Phạm vi {index + 1}: {operations[scope.operation]} · {resources[scope.resource]} · {environments[scope.environment]} · {scope.target}{scopeRisk(scope) && " — vẫn cần thẩm quyền riêng"}</span></label>)}</fieldset>}
      {row.status === "ID_CONFLICT" && <label>Hậu tố số do IT chọn<input inputMode="numeric" pattern="[1-9][0-9]{0,3}" maxLength={4} value={suffix} onChange={(event) => setSuffix(event.target.value)} placeholder="Ví dụ: 2 → ID gốc-2" /><small>Chỉ chọn sau khi xác minh đây là người khác; ghi lý do bên dưới.</small></label>}
      <label>Lý do quyết định (hiển thị cho người gửi)<textarea required minLength={8} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ghi rõ căn cứ xác minh, phạm vi được duyệt hoặc điều cần bổ sung." /></label>
      {error && <Alert tone="error">{error}</Alert>}<div className="identity-actions">{(["approve", "reject"] as const).map((action) => <Button key={action} type="button" variant={action === "approve" ? "primary" : "secondary"} disabled={busy} onClick={async () => {
        if (reason.trim().length < 8) { setError("Nhập lý do ít nhất 8 ký tự."); return; }
        if (action === "approve" && row.job.kind === "new" && !selected.length) { setError("Chọn ít nhất một phạm vi để duyệt job mới."); return; }
        setBusy(true); setError("");
        try { const result = await identityApi<{ employeeId?: string }>(`review/${row.id}`, { action, version: row.version, reason, ...(action === "approve" && row.job.kind === "new" ? { approvedScopes: row.requestedScopes.filter((scope) => selected.includes(scopeKey(scope))) } : {}), ...(action === "approve" && suffix ? { suffix } : {}) }); await onDone(action === "approve" ? `Đã cấp ID ${result.employeeId}. Người gửi có thể xem kết quả trong liên kết theo dõi.` : "Đã từ chối đơn và lưu lý do cho người gửi."); }
        catch (cause) { setError((cause as Error).message); }
        finally { setBusy(false); }
      }}>{busy ? "Đang xử lý…" : action === "approve" ? "Duyệt và cấp ID" : "Từ chối có lý do"}</Button>)}</div>
      <p className="identity-note">IT phải xác minh nhân sự qua quy trình tin cậy trước khi duyệt. Duyệt profile không cấp vai trò IT hoặc cho phép thực thi quyền nhạy cảm.</p>
    </form>}
  </article>;
}
export function IdentityReview() {
  const [rows, setRows] = useState<IdentityApplication[]>([]); const [audit, setAudit] = useState<IdentityAudit[]>([]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(1); const [auditPage, setAuditPage] = useState(1);
  const [more, setMore] = useState(false); const [moreAudit, setMoreAudit] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async (nextPage: number, nextFilter: string, nextAuditPage: number) => { setBusy(true); setRows([]); setAudit([]); setError(""); setPage(nextPage); setFilter(nextFilter); setAuditPage(nextAuditPage); try { const [applications, events] = await Promise.all([identityApi<{ items: IdentityApplication[]; hasMore: boolean }>(`review?page=${nextPage}&status=${nextFilter}`), identityApi<{ items: IdentityAudit[]; hasMore: boolean }>(`audit?page=${nextAuditPage}`)]); setRows(applications.items); setAudit(events.items); setMore(applications.hasMore); setMoreAudit(events.hasMore); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }, []);
  useEffect(() => { void load(1, "pending", 1); }, [load]);
  const visible = rows.filter((row) => filter === "all" || ["PENDING", "ID_CONFLICT"].includes(row.status));
  return <StaffWorkspace active="identity"><main className="identity-review"><div className="identity-review-heading"><div><span className="eyebrow">KHÔNG GIAN IT</span><h1>Cấp ID nhân viên</h1><p>Duyệt nhân sự, profile và phạm vi; mọi quyết định được ghi audit cùng giao dịch.</p></div><Button variant="secondary" disabled={busy} onClick={() => void load(page, filter, auditPage)}>{busy ? "Đang tải…" : "Tải lại danh sách"}</Button></div>
    {notice && <p role="status" className="identity-card">{notice}</p>}
    {error && <Alert tone="error">{error} <Link className="identity-text-link" href="/">Đăng nhập và chọn xác minh OTP cho IT</Link></Alert>}
    {!error && <><label className="identity-filter">Trạng thái<select aria-label="Lọc trạng thái đơn cấp ID" value={filter} disabled={busy} onChange={(event) => void load(1, event.target.value, auditPage)}><option value="pending">Chờ IT / trùng ID</option><option value="all">Tất cả trạng thái</option></select></label><p role="status">{busy ? "Đang tải đơn…" : `${visible.length} đơn · trang ${page}.`}</p>{visible.map((row) => <ApplicationDecision key={`${row.id}:${row.version}`} row={row} onDone={async (message) => { await load(page, filter, auditPage); setNotice(message); }} />)}{!busy && !visible.length && <p>Chưa có đơn trong bộ lọc này.</p>}
    <div className="identity-actions"><Button variant="secondary" disabled={busy || page === 1} onClick={() => void load(page - 1, filter, auditPage)}>Trang đơn trước</Button><Button variant="secondary" disabled={busy || !more} onClick={() => void load(page + 1, filter, auditPage)}>Trang đơn sau</Button></div>
    <details className="identity-card"><summary>Nhật ký cấp ID và quyền · trang {auditPage}</summary><ol className="scope-list">{audit.map((event) => <li key={event.id}><strong>{event.action} · {event.actor}</strong><time dateTime={event.at}>{new Date(event.at).toLocaleString("vi-VN")}</time><span>{event.subject}</span><p>{event.reason}</p></li>)}</ol><div className="identity-actions"><Button variant="secondary" disabled={busy || auditPage === 1} onClick={() => void load(page, filter, auditPage - 1)}>Nhật ký trước</Button><Button variant="secondary" disabled={busy || !moreAudit} onClick={() => void load(page, filter, auditPage + 1)}>Nhật ký sau</Button></div></details></>}
  </main></StaffWorkspace>;
}
