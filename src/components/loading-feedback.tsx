/** Indeterminate: the API does not expose a percentage or a reliable ETA. */
export function AiPending({ message = "Đang chuẩn bị phản hồi, bạn chờ một chút nhé…" }: { message?: string }) {
  return <section className="ai-pending" aria-label="VNG Support AI đang xử lý">
    <div className="ai-pending-heading"><span className="ai-pending-mark" aria-hidden="true">✦</span><strong>VNG Support AI</strong></div>
    <p role="status">{message}</p>
    <div className="ai-progress" role="progressbar" aria-label="Đang chờ phản hồi" aria-valuetext="Đang xử lý, chưa có thời gian hoàn tất dự kiến"><span /></div>
    <p className="ai-pending-note">Nội dung của bạn vẫn được giữ trong lúc chờ.</p>
  </section>;
}

export function ContentSkeleton({ label = "Đang tải nội dung…", compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`content-skeleton${compact ? " is-compact" : ""}`} role="status">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">
      <span className="skeleton-bone skeleton-title" />
      <span className="skeleton-bone skeleton-line" />
      <span className="skeleton-bone skeleton-line skeleton-short" />
      {!compact && <div className="skeleton-cards">{[0, 1, 2].map((key) => <div className="skeleton-card" key={key}><span className="skeleton-bone skeleton-icon" /><span className="skeleton-bone skeleton-line" /><span className="skeleton-bone skeleton-line skeleton-short" /></div>)}</div>}
    </div>
  </div>;
}
