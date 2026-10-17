"use client";
import { useState } from "react";
import { browserApi } from "@/lib/browser-api";
import type { ReviewDrafts as Drafts } from "@/services/review-drafts";
import { Button } from "./ui";
export function ReviewDrafts({ id, version, onChoose }: { id: string; version: number; onChoose: (text: string) => void }) {
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div className="review-drafts">
    <Button variant="secondary" disabled={busy} onClick={async () => {
      setBusy(true); setError(""); setDrafts(null);
      try { setDrafts(await browserApi<Drafts>(`/api/review/${id}/drafts`, { version })); }
      catch (cause) { setError((cause as Error).message); }
      finally { setBusy(false); }
    }}>{busy ? "Đang soạn 3 tin nhắn…" : "AI soạn 3 gợi ý tin nhắn"}</Button>
    {error && <p role="alert">{error}</p>}
    {drafts && <div aria-live="polite">
      <p className="it-field-hint">{drafts.source === "openai" ? `Cả 3 tin nhắn được soạn bởi ${drafts.model || "AI"}` : drafts.source === "mock" ? "Bản nháp mô phỏng" : "Mẫu server (AI chưa cung cấp đủ 3 bản nháp hợp lệ)"} · Chọn để xem toàn bộ và sửa trong ô tin nhắn. Chỉ gửi khi bạn xác nhận thao tác xử lý bên dưới.</p>
      {drafts.options.map((text, i) => <button type="button" className="review-draft-option" key={i} onClick={() => onChoose(text)}><strong>Gợi ý {i + 1} · {i === 0 ? "Hỏi thêm thông tin" : i === 1 ? "Giải đáp ngắn gọn" : "Giải đáp từng bước"}</strong><span className="whitespace-pre-wrap line-clamp-4">{text}</span></button>)}
    </div>}
  </div>;
}
