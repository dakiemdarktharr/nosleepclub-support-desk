"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Send } from "lucide-react";
import type { RequestGroupDetail } from "@/domain/request-groups";
import { displayId, statusLabels } from "@/domain/presentation";
import { REVIEW_MESSAGE_MAX_LENGTH } from "@/domain/reviewer-messages";
import { BrowserApiError, browserApi } from "@/lib/browser-api";
import { Alert, Badge, Button, Textarea } from "./ui";
import { ContentSkeleton } from "./loading-feedback";
import { StaffWorkspace } from "./staff-workspace";

type SendAttempt = { sendId: string; membership: string; text: string };
export function ReviewGroup({ id }: { id: string }) {
  const [group, setGroup] = useState<RequestGroupDetail | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const attempt = useRef<SendAttempt | null>(null);
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const result = await browserApi<RequestGroupDetail>(`/api/review/groups/${id}`);
      if (current === sequence.current) setGroup(result);
    } catch (cause) {
      if (current === sequence.current) {
        setGroup(null);
        setError(cause instanceof Error ? cause.message : "Không thể tải nhóm yêu cầu.");
      }
    } finally { if (current === sequence.current) setLoading(false); }
  }, [id]);
  useEffect(() => {
    void reload();
    const currentSequence = sequence;
    return () => { currentSequence.current++; };
  }, [reload]);
  async function send() {
    if (!group || pending || loading || !text.trim()) return;
    const body = attempt.current?.text === text.trim() ? attempt.current : {
      sendId: crypto.randomUUID(), membership: group.membership, text: text.trim(),
    };
    attempt.current = body;
    setPending(true); setError(""); setSent(null);
    try {
      const receipt = await browserApi<{ id: string; recipientCount: number }>(`/api/review/groups/${id}`, body);
      attempt.current = null;
      setText(""); setSent(receipt.recipientCount);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể gửi câu trả lời.");
      if (cause instanceof BrowserApiError && cause.code === "GROUP_CHANGED") {
        attempt.current = null;
        await reload();
      }
    } finally { setPending(false); }
  }
  return <StaffWorkspace active="review">
    <main className="it-content" data-guide-stage="reviewer-detail">
      <header className="it-detail-heading">
        <Link href="/review" className="it-back"><ArrowLeft size={16} />Danh sách yêu cầu</Link>
        {group && <div className="it-detail-title"><h1>{group.title}</h1>
          <Badge tone="warning">{statusLabels[group.members[0].status]}</Badge>
        </div>}
      </header>
      {error && <Alert tone="error">{error}</Alert>}
      {sent !== null && <p role="status">Đã gửi đến {sent} yêu cầu.</p>}
      {loading && !group && <ContentSkeleton />}
      {group ? <div className="it-detail-grid">
        <div className="it-request-content">
          <section className="it-surface it-intake" aria-label="Yêu cầu trong nhóm">
            <h2>Yêu cầu trong nhóm</h2>
            <ul className="divide-y divide-slate-200">
              {group.members.map(member => <li key={member.id} className="py-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link className="font-bold text-orange-800 underline" href={`/review?requestId=${member.id}`}>{displayId(member.id)}</Link>
                  <time className="text-sm text-slate-500" dateTime={member.createdAt}>{new Date(member.createdAt).toLocaleString("vi-VN")}</time>
                </div>
                {member.employeeId && <p className="text-sm">Mã nhân viên: {member.employeeId}</p>}
                <p className="whitespace-pre-wrap break-words">{member.text}</p>
              </li>)}
            </ul>
          </section>
          {group.replies.length > 0 && <section className="it-surface it-intake" aria-label="Phản hồi đã gửi">
            <h2>Phản hồi đã gửi</h2>
            <ol className="reviewer-messages">{group.replies.map(reply => <li key={reply.id}>
              <div><strong>{reply.recipientCount} yêu cầu</strong><time dateTime={reply.timestamp}>{new Date(reply.timestamp).toLocaleString("vi-VN")}</time></div>
              <p className="whitespace-pre-wrap">{reply.text}</p>
            </li>)}</ol>
          </section>}
        </div>
        <aside className="it-action-panel it-surface" aria-label="Trả lời chung">
          <fieldset disabled={pending || loading}>
            <legend>Trả lời chung</legend>
            <label className="it-reason">Nội dung trả lời
              <Textarea rows={7} maxLength={REVIEW_MESSAGE_MAX_LENGTH} value={text} onChange={event => setText(event.target.value)} />
            </label>
            <div className="it-primary-actions"><Button disabled={!text.trim() || pending || loading} onClick={() => void send()}>
              <Send size={16} />{pending ? "Đang gửi…" : `Gửi cho ${group.members.length} yêu cầu`}
            </Button></div>
          </fieldset>
          <Button className="it-reload" variant="quiet" disabled={pending || loading} onClick={() => { setError(""); void reload(); }}><RefreshCw size={14} />Tải lại hồ sơ</Button>
        </aside>
      </div> : !loading && <Button variant="secondary" onClick={() => { setError(""); void reload(); }}>Tải lại hồ sơ</Button>}
    </main>
  </StaffWorkspace>;
}
