/**
 * Count completed responses, including failed cases, rather than simulate an ETA.
 * Transform-only easing inspired by Motion's loading progress bar example.
 */
export function VerifyProgress({ completed, total, pending, loading, starting }: {
  completed: number; total: number; pending: boolean; loading: boolean; starting: boolean;
}) {
  const count = Math.min(Math.max(completed, 0), total);
  const indeterminate = starting || loading;
  const percent = total > 0 ? Math.round(count / total * 100) : 0;
  const label = loading ? "Đang đọc lại kết quả đã lưu…" : starting ? "Đang khởi tạo bộ kiểm thử…" :
    pending ? "Đang chạy kiểm thử…" : count === total ? "Đã nhận đủ kết quả" : "Kết quả đã lưu · có thể tiếp tục";
  return <section className="verify-progress" aria-label="Tiến độ Verify">
    <div className="verify-progress-heading"><strong>{label}</strong><span>{count}/{total} ca</span></div>
    <div className={`verify-progress-track${indeterminate ? " is-indeterminate" : ""}`}
      role="progressbar" aria-label="Tiến độ kiểm thử" aria-valuemin={0} aria-valuemax={total}
      aria-valuenow={indeterminate ? undefined : count}
      aria-valuetext={indeterminate ? label : `${count} trên ${total} ca đã có kết quả, ${percent}%`}>
      <span style={indeterminate ? undefined : { transform: `scaleX(${total > 0 ? count / total : 0})` }} />
    </div>
    <small>{indeterminate ? "Chờ phản hồi từ server; kết quả cũ vẫn được giữ." : "Tiến độ tính theo số ca đã có kết quả, gồm cả PASS và FAIL."}</small>
  </section>;
}
