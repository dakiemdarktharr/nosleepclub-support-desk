"use client";
import { useEffect, useState } from "react";
import { browserApi } from "@/lib/browser-api";
import type { ReviewDrafts as Drafts } from "@/services/review-drafts";
import { Button } from "./ui";
export function ReviewDrafts({ id, version, onChoose, disabled = false }: { id: string; version: number; onChoose: (text: string) => void; disabled?: boolean }) {
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setDrafts(null);
    void browserApi<Drafts>(`/api/review/${id}/drafts`, { version })
      .then(result => { if (active) setDrafts(result); })
      .catch(cause => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [id, version, retry]);
  return <section className="review-drafts it-surface it-intake" aria-label="Gợi ý cách xử lý" aria-busy={busy}>
    <h2>Gợi ý cách xử lý</h2>
    {busy && <p role="status">Đang soạn 2 gợi ý xử lý…</p>}
    {error && <div><p role="alert">{error}</p><Button variant="quiet" onClick={() => setRetry(value => value + 1)}>Thử tải gợi ý lại</Button></div>}
    {drafts && <div aria-live="polite">
      <p className="it-field-hint">{drafts.source === "openai" ? "Gợi ý từ AI" : drafts.source === "mock" ? "Gợi ý mô phỏng" : "Mẫu hướng dẫn dự phòng"}</p>
      {drafts.options.map((text, i) => <button type="button" disabled={disabled} className="review-draft-option" key={i} onClick={() => onChoose(text)}><strong>Gợi ý xử lý {i + 1}</strong><span className="whitespace-pre-wrap line-clamp-3">{text}</span></button>)}
    </div>}
  </section>;
}
