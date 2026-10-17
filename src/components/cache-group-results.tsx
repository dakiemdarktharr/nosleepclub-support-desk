import type { VerifyRun } from "@/domain/verification";
import { groupCacheResults } from "@/domain/cache-result-groups";
import { Card } from "./ui";

export function CacheGroupResults({ run }: { run: VerifyRun }) {
  const groups = groupCacheResults(run);
  const similar = groups.filter(group => group.kind === "similar");
  return (
    <section aria-label="Thống kê kết quả cache" className="space-y-4">
      <header>
        <h2 className="text-xl font-bold">Thống kê theo nhóm yêu cầu</h2>
        <p>{similar.length} nhóm cùng nội dung · {similar.reduce((sum, group) => sum + group.items.length, 0)} yêu cầu trong các nhóm.</p>
        <p className="text-sm text-slate-600">Số yêu cầu lấy từ bộ kiểm thử của lần chạy này; số nhận diện đúng và HIT/MISS lấy từ kết quả đã lưu.</p>
      </header>
      {groups.map(group => (
        <Card key={group.key} role="region" aria-label={`Nhóm: ${group.label}`} className="space-y-3 min-w-0">
          <h3 className="text-lg font-bold">{group.label}</h3>
          <p className="text-lg font-semibold">
            {group.items.length} {group.kind === "similar" ? "yêu cầu cùng nội dung" : group.kind === "controls" ? "yêu cầu đối chứng" : "yêu cầu chưa phân nhóm"}
          </p>
          {group.kind === "similar" ? <p className="text-sm">Gồm câu gốc và các cách diễn đạt tương tự trong bộ kiểm thử.</p>
            : <p className="text-sm">{group.kind === "controls" ? "Các câu khác nội dung hoặc cần xử lý riêng, không tính là một nhóm yêu cầu giống nhau."
              : "Giữ lại kết quả cũ để đối chiếu; chưa xác định được nhóm từ bộ kiểm thử hiện tại."}</p>}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><dt>Đã kiểm tra</dt><dd className="text-lg font-semibold">{group.completed}/{group.items.length}</dd></div>
            <div><dt>Chưa chạy</dt><dd className="text-lg font-semibold">{group.items.length - group.completed}</dd></div>
            <div><dt>PASS</dt><dd className="text-lg font-semibold text-emerald-700">{group.passed}</dd></div>
            <div><dt>FAIL</dt><dd className="text-lg font-semibold text-red-700">{group.failed}</dd></div>
          </dl>
          {group.kind === "similar" && <p>{group.completed
            ? `Nhận diện đúng nhóm: ${group.recognized}/${group.completed} yêu cầu đã chạy.`
            : "Chưa có kết quả nhận diện nhóm."}</p>}
          <p>HIT: {group.hits} · MISS: {group.misses} · BYPASS: {group.bypasses}</p>
          {group.unavailable > 0 && <p className="text-amber-800">Chưa có kết quả cache: {group.unavailable} yêu cầu đã chạy.</p>}
          <details>
            <summary>Xem {group.items.length} yêu cầu và kết quả</summary>
            <ol className="mt-3 space-y-3">
              {group.items.map(item => (
                <li key={item.caseId} className="rounded border border-line p-3 space-y-2 break-words">
                  <p>{item.text}</p>
                  <p className="text-sm">
                    {item.result ? <strong className={item.result.pass ? "text-emerald-700" : "text-red-700"}>{item.result.pass ? "PASS" : "FAIL"}</strong> : <strong>Chưa chạy</strong>}
                    {" · "}Kỳ vọng: {item.expected ?? "Chưa xác định"} · Thực tế: {item.result ? item.result.cache?.actual ?? "Chưa có kết quả cache" : "Chưa chạy"}
                  </p>
                  {item.result?.error && <p className="text-red-700">{item.result.error}</p>}
                  {item.result && <details className="text-sm">
                    <summary>Chi tiết kiểm tra</summary>
                    <p>Mã ca: {item.caseId} · {new Date(item.result.timestamp).toLocaleString("vi-VN")}</p>
                    {item.result.cache && <>
                      <p>Chủ đề nhận diện: {item.result.cache.topic ?? "Không thuộc FAQ dùng chung"}</p>
                      {item.result.cache.lexicalSimilarity !== undefined && <p>Trùng từ: {Math.round(item.result.cache.lexicalSimilarity * 100)}% · không phải độ tin cậy AI.</p>}
                      <ul>{item.result.cache.checks.map(check => <li key={check}>{check}</li>)}</ul>
                    </>}
                    {item.result.actual && <>
                      <p>Policy: {item.result.actual.action} · {item.result.actual.bucket} · {item.result.actual.ruleIds.join(", ")}</p>
                      <p>{item.result.actual.adminReason}</p>
                    </>}
                  </details>}
                </li>
              ))}
            </ol>
          </details>
        </Card>
      ))}
    </section>
  );
}
