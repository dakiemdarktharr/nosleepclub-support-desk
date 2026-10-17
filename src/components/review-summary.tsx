"use client";
import { useEffect, useState } from "react";
import { browserApi } from "@/lib/browser-api";
import type { ReviewerSummary } from "@/services/review-summary";
import { Button } from "./ui";

export function ReviewSummary({ id, version }: { id: string; version: number }) {
  const [summary, setSummary] = useState<ReviewerSummary | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    let active = true;
    setPending(true); setSummary(null); setError("");
    void browserApi<ReviewerSummary>(`/api/review/${id}/summary`, { version })
      .then(result => { if (active) setSummary(result); })
      .catch(cause => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [id, version, retry]);
  return <section className="it-surface it-intake" aria-labelledby="review-summary-heading" aria-busy={pending}>
    <div className="it-section-heading"><h2 id="review-summary-heading">Tóm tắt yêu cầu</h2>{summary?.source === "openai" && <small>{summary.model}{summary.cache === "hit" ? " · Đã lưu" : ""}</small>}</div>
    {pending ? <div role="status"><p>Luna đang tóm tắt yêu cầu…</p><div className="ai-progress" role="progressbar" aria-label="Đang tóm tắt yêu cầu"><span /></div></div> :
      summary?.summary ? <><p className="it-request-text">{summary.summary}</p>{summary.source === "mock" && <small>Bản tóm tắt mô phỏng</small>}</> :
        <div><p role="status">{error || "Chưa có bản tóm tắt AI hợp lệ. Bạn vẫn có thể đọc yêu cầu nguyên văn."}</p><Button variant="quiet" onClick={() => setRetry(value => value + 1)}>Thử tóm tắt lại</Button></div>}
  </section>;
}
