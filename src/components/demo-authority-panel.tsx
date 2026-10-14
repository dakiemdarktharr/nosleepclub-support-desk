"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { demoProject, type Capacity, type DemoGrant, type DemoPool } from "@/domain/demo-authority";
import { identityApi } from "./identity-ui";
import { Alert, Button } from "./ui";
import { StaffWorkspace } from "./staff-workspace";

type Snapshot = { pool: DemoPool | null; grants: DemoGrant[]; canManage: boolean; assurance: "demo" };
const labels: Record<keyof Capacity, string> = { cpu: "vCPU", ramGb: "GB RAM", diskGb: "GB disk", gpuT4: "GPU T4" };
const statuses = { PENDING: "Chờ owner", APPROVED: "Đã duyệt quyền demo", REJECTED: "Đã từ chối", REVOKED: "Đã thu hồi quyền demo" };
function numbers(data: FormData, prefix: string): Capacity {
  return { cpu: Number(data.get(`${prefix}cpu`)), ramGb: Number(data.get(`${prefix}ramGb`)),
    diskGb: Number(data.get(`${prefix}diskGb`)), gpuT4: Number(data.get(`${prefix}gpuT4`)) };
}
function CapacityFields({ prefix, title, values }: { prefix: string; title: string; values?: Capacity }) {
  return <fieldset className="identity-form"><legend>{title}</legend>{(Object.keys(labels) as Array<keyof Capacity>).map((key) =>
    <label key={key}>{title} · {labels[key]}<input name={`${prefix}${key}`} type="number" min="0" max="1000000" step={key === "gpuT4" ? "1" : "any"} required defaultValue={values?.[key] ?? 0} /></label>)}</fieldset>;
}
export function DemoAuthorityPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [requestId, setRequestId] = useState("");
  const load = useCallback(async () => { setSnapshot(await identityApi<Snapshot>("authority")); }, []);
  useEffect(() => { void load().catch((cause: Error) => setError(cause.message)); setRequestId(crypto.randomUUID()); }, [load]);
  async function mutate(route: string, body: unknown, success: string) {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try { await identityApi(`authority/${route}`, body); await load(); setNotice(success); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa hoàn tất; thử lại cùng nội dung."); return false; }
    finally { setBusy(false); }
  }
  const pool = snapshot?.pool;
  return <StaffWorkspace active="identity"><main className="identity-review space-y-5">
    <div><span className="eyebrow">QUYỀN VÀ QUOTA DEMO</span><h1>{demoProject}</h1>
      <p>Sổ thử nghiệm cho VNG Support. Giữ nguyên quyết định policy của ticket hỗ trợ; không thực thi IAM hoặc cloud.</p>
      <Link href="/identity/review" className="identity-text-link">Về trang cấp ID</Link>{" · "}<Link href="/workspace" className="identity-text-link">Gửi yêu cầu hỗ trợ</Link>
    </div>
    <Alert>Đăng nhập ID-only chưa xác minh người sử dụng. Entitlement và approval ở đây chỉ là demo, không phải bằng chứng IAM/ITSM production. Ngân sách chưa cấu hình luôn cần Capacity owner.</Alert>
    {error && <Alert tone="error">{error} <Link href="/login">Đăng nhập lại</Link></Alert>}
    {notice && <p role="status" className="identity-card">{notice}</p>}
    {!snapshot && !error && <p role="status">Đang đọc MongoDB…</p>}
    {snapshot && !pool && <Alert>Chưa khởi tạo sổ demo. Operator cần làm theo RUNBOOK; app không tự tạo quyền hoặc mặc định usage bằng 0.</Alert>}
    {pool && <>
      <section className="identity-card"><h2>Hạn mức và dữ liệu quan sát</h2>
        <p>Tối đa {pool.maxHours} giờ/lần cấp. GPU tính riêng T4. Không tự coi hết thời hạn là đã giải phóng tài nguyên.</p>
        <div className="overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Quota theo project, gồm đang dùng và giữ chỗ</caption><thead><tr><th>Tài nguyên</th><th>Hạn mức</th><th>Đang dùng</th><th>Giữ chỗ</th></tr></thead><tbody>
          {(Object.keys(labels) as Array<keyof Capacity>).map((key) => <tr key={key}><th>{labels[key]}</th><td>{pool.limits[key]}</td><td>{pool.used[key]}</td><td>{pool.reserved[key]}</td></tr>)}
        </tbody></table></div><p>Quan sát: <time dateTime={pool.observedAt}>{new Date(pool.observedAt).toLocaleString("vi-VN")}</time>. Hiệu lực đến: <time dateTime={pool.validUntil}>{new Date(pool.validUntil).toLocaleString("vi-VN")}</time>.</p>
        <Button variant="secondary" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await load(); } catch (cause) { setSnapshot(null); setError((cause as Error).message); } finally { setBusy(false); } }}>Tải lại sổ demo</Button>
      </section>
      <form className="identity-card identity-form" onSubmit={async (event) => {
        event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
        const ok = await mutate("request", { id: requestId, scope: { target: demoProject, environment: "sandbox", resource: "cloud", operation: data.get("operation") }, hours: Number(data.get("hours")), reason: data.get("reason") }, "Đã lưu đơn chờ owner. Chưa cấp quyền hoặc tài nguyên.");
        if (ok) { setRequestId(crypto.randomUUID()); form.reset(); }
      }}><h2>Xin quyền demo cho tài khoản đang đăng nhập</h2>
        <label>Thao tác<select name="operation"><option value="read">Đọc tài nguyên sandbox</option><option value="create">Tạo tài nguyên sandbox — vẫn kiểm tra quota/ngân sách</option></select></label>
        <label>Thời hạn (giờ, tối đa 24)<input name="hours" type="number" required min="0.01" max="24" step="any" /></label>
        <label>Lý do<textarea name="reason" required minLength={8} maxLength={500} /></label>
        <Button type="submit" disabled={busy || !requestId}>Gửi đơn quyền demo</Button>
      </form>
      <form className="identity-card identity-form" onSubmit={async (event) => {
        event.preventDefault(); if (busy) return; const data = new FormData(event.currentTarget); setBusy(true); setError(""); setNotice("");
        try { const result = await identityApi<{ entitlement: string; quota: { reason: string } }>("authority/check", { scope: { target: demoProject, environment: "sandbox", resource: "cloud", operation: "create" }, requested: numbers(data, "check-"), hours: Number(data.get("hours")) });
          setNotice(`Quyền: ${result.entitlement === "demo-allowed" ? "Khớp quyền demo còn hiệu lực" : "Chưa xác minh quyền phù hợp"}. ${result.quota.reason} Không giữ chỗ hoặc cấp hạ tầng.`);
        } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
      }}><h2>Kiểm tra yêu cầu tài nguyên</h2><CapacityFields prefix="check-" title="Xin thêm" />
        <label>Thời gian sử dụng (giờ)<input name="hours" type="number" min="0.01" max="8760" step="any" required /></label>
        <Button type="submit" disabled={busy}>Kiểm tra quyền và quota demo</Button>
      </form>
      {snapshot.canManage && <details className="identity-card"><summary>Cập nhật usage và giữ chỗ — chỉ owner</summary>
        <form key={pool.version} className="identity-form" onSubmit={async (event) => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          await mutate("usage", { version: pool.version, used: numbers(data, "used-"), reserved: numbers(data, "reserved-"),
            observedAt: new Date(String(data.get("observedAt"))).toISOString(), validUntil: new Date(String(data.get("validUntil"))).toISOString(), reason: data.get("reason") }, "Đã cập nhật snapshot quota demo và audit.");
        }}><CapacityFields prefix="used-" title="Đang dùng" values={pool.used} /><CapacityFields prefix="reserved-" title="Giữ chỗ" values={pool.reserved} />
          <label>Thời điểm quan sát (giờ địa phương)<input type="datetime-local" name="observedAt" required /></label>
          <label>Hiệu lực đến (giờ địa phương)<input type="datetime-local" name="validUntil" required /></label>
          <label>Căn cứ cập nhật<textarea name="reason" minLength={8} maxLength={500} required /></label>
          <Button type="submit" disabled={busy}>Lưu snapshot có audit</Button>
        </form>
      </details>}
      <section className="space-y-3"><h2>{snapshot.canManage ? "Đơn quyền trong phạm vi quản lý" : "Đơn quyền của bạn"}</h2><p>Tối đa 100 đơn mới nhất. Không tự gia hạn. Được duyệt quyền demo chưa đồng nghĩa với được cấp tài nguyên.</p>
        {!snapshot.grants.length && <p>Chưa có đơn.</p>}
        {snapshot.grants.map((row) => <article key={`${row.id}:${row.version}`} className="identity-card"><h3>{statuses[row.status]} · {row.employeeId}</h3>
          <p>{row.scope.operation === "read" ? "Đọc" : "Tạo"} · {row.scope.target} · {row.hours} giờ</p><p>{row.reason}</p>
          <p>Ngày gửi: {new Date(row.createdAt).toLocaleString("vi-VN")}</p>
          {row.decisionReason && <p>Lý do quyết định: {row.decisionReason}</p>}
          {row.expiresAt && <p>Hết hiệu lực: {new Date(row.expiresAt).toLocaleString("vi-VN")}</p>}
          {snapshot.canManage && ["PENDING", "APPROVED"].includes(row.status) && <form className="identity-form" onSubmit={async (event) => {
            event.preventDefault(); const data = new FormData(event.currentTarget);
            await mutate("decision", { id: row.id, version: row.version, action: data.get("action"), reason: data.get("reason") }, "Đã lưu quyết định và audit. Không thực thi tài nguyên; policy Support giữ nguyên.");
          }}><label>Quyết định<select name="action">{row.status === "APPROVED" ? <option value="revoke">Thu hồi quyền demo</option> : <><option value="reject">Từ chối</option><option value="approve">Duyệt quyền demo</option></>}</select></label>
            <label>Lý do quyết định<textarea name="reason" required minLength={8} maxLength={500} /></label><Button type="submit" disabled={busy}>Lưu quyết định</Button><p>Không được xử lý đơn của chính mình.</p>
          </form>}
        </article>)}
      </section>
    </>}
  </main></StaffWorkspace>;
}
