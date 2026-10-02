"use client";
import type { VerifyRun } from "@/domain/verification";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supportVerifyCases, verifyPersistence, judgePackIds } from "@/lib/support-verify";
import { Alert, Button, Card, Textarea } from "@/components/ui";
import { browserApi } from "@/lib/browser-api";
import type { SupportRequest } from "@/domain/contracts";
import { SupportResult } from "@/components/support-result";
import { EmployeeIdentityFields } from "@/components/employee-identity-fields";
import { hasEmployeeIdentity, identityRequiredMessage } from "@/domain/employee-identity";

export default function VerifyPage() {
  const [pack, setPack] = useState("de-a-v3"),
    [running, setRunning] = useState(false);
  const [readback, setReadback] = useState("");
  const [identity, setIdentity] = useState<Record<string, string>>({});
  const [judge, setJudge] = useState(""),
    [judged, setJudged] = useState<SupportRequest | null>(null),
    [error, setError] = useState("");
  const cases = supportVerifyCases.filter((item) => item.pack === pack);
  const [currentRun, setCurrentRun] = useState<VerifyRun | null>(null);
  const [history, setHistory] = useState<
    Array<{
      id: string;
      pack: string;
      status: string;
      completed: number;
      total: number;
    }>
  >([]);
  const stop = useRef(false);
  const activeOperation = useRef(false);
  const loadingRun = useRef(false);
  const loadSequence = useRef(0);
  const [loading, setLoading] = useState(false);
  const busy = running || loading;
  const results = currentRun?.results ?? [];
  async function loadRun(id: string) {
    const sequence = ++loadSequence.current;
    loadingRun.current = true;
    setLoading(true);
    try {
      const row = await browserApi<VerifyRun>(`/api/support/verify-runs/${id}`);
      if (sequence !== loadSequence.current) return;
      setCurrentRun(row);
      setPack(judgePackIds.includes(row.pack) ? row.pack : "de-a-v3");
      window.history.replaceState(null, "", `/verify?run=${id}`);
    } catch {
      if (sequence === loadSequence.current) setError("Không tải được lần kiểm thử.");
    } finally {
      if (sequence === loadSequence.current) {
        loadingRun.current = false;
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    void browserApi<typeof history>("/api/support/verify-runs")
      .then(setHistory)
      .catch(() => setError("Không tải được lịch sử Verify."));
    const id = new URLSearchParams(window.location.search).get("run");
    if (id) void loadRun(id);
  }, []);
  async function run(resume = false) {
    if (activeOperation.current || loadingRun.current) return;
    activeOperation.current = true;
    setRunning(true);
    setError("");
    stop.current = false;
    let row: VerifyRun | null = null;
    try {
      row =
        resume && currentRun
          ? await browserApi<VerifyRun>(
              `/api/support/verify-runs/${currentRun.id}`,
              { action: "resume" },
            )
          : await browserApi<VerifyRun>("/api/support/verify-runs", { pack });
      setCurrentRun(row);
      window.history.replaceState(null, "", `/verify?run=${row.id}`);
      for (const entry of row.cases) {
        if (stop.current) break;
        if (row.results.some((result) => result.caseId === entry.caseId))
          continue;
        row = await browserApi<VerifyRun>(
          `/api/support/verify-runs/${row.id}/cases`,
          { caseId: entry.caseId },
        );
        setCurrentRun(row);
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Không thể tiếp tục Verify. Kết quả đã chạy vẫn được lưu; dùng Tiếp tục.",
      );
    } finally {
      // Keep pack selection locked until the final persisted readback completes.
      if (row) await loadRun(row.id);
      activeOperation.current = false;
      setRunning(false);
      void browserApi<typeof history>("/api/support/verify-runs")
        .then(setHistory)
        .catch(() => setError("Không tải được lịch sử Verify."));
    }
  }
  async function stopRun() {
    stop.current = true;
    try {
      if (currentRun)
        setCurrentRun(
          await browserApi<VerifyRun>(
            `/api/support/verify-runs/${currentRun.id}`,
            { action: "stop" },
          ),
        );
    } catch {
      setError(
        "Không lưu được trạng thái dừng. Lần chạy trên trang đã dừng; tải lại để kiểm tra.",
      );
    }
  }
  async function runJudge() {
    if (activeOperation.current || loadingRun.current) return;
    if (!hasEmployeeIdentity(identity)) {
      setError(identityRequiredMessage);
      return;
    }
    activeOperation.current = true;
    setRunning(true);
    setError("");
    try {
      const row = await browserApi<SupportRequest>("/api/support/requests", {
        rawText: judge,
        fields: identity,
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
      });
      setJudged(row);
      const persistence = await verifyPersistence(row);
      setReadback(
        `${persistence.pass ? "PASS" : "FAIL"}: ${persistence.checks.join(" · ")}`,
      );
      setJudge("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "API error");
    } finally {
      activeOperation.current = false;
      setRunning(false);
    }
  }
  return (
    <main className="page space-y-6">
      <div>
        <p className="eyebrow">VERIFY · ĐỀ A</p>
        <h1>Đối chiếu, không đoán.</h1>
      </div>
      <Alert>
        Ba bộ dữ liệu mô phỏng: 4 trường hợp kiểm thử chung, 5 trường hợp Đề A
        gồm 3 tự động xử lý và 2 chuyển tiếp, cùng 15 tình huống gồm thiếu
        thông tin, ngoài quy định và vượt thẩm quyền. Mỗi bộ chạy bằng một nút,
        qua cùng API xử lý yêu cầu và kiểm tra lại nhật ký. Đây không phải kết
        quả thử nghiệm người dùng thật.
      </Alert>
      <fieldset disabled={busy} className="flex flex-wrap items-end gap-3">
        <label>
          Bộ kiểm thử
          <select
            className="mt-1 block max-w-full rounded border p-3"
            value={pack}
            onChange={(event) => {
              setPack(event.target.value);
              setCurrentRun(null);
            }}
          >
            <option value="de-a-v3">
              Đề A — 5 trường hợp (3 tự động / 2 chuyển tiếp)
            </option>
            <option value="submission-4">
              Bộ kiểm thử chung — 4 trường hợp
            </option>
            <option value="judge-15">
              Bộ dữ liệu kiểm thử — 15 tình huống
            </option>
          </select>
        </label>
        <Button onClick={() => void run(false)}>
          Chạy toàn bộ test ({cases.length})
        </Button>
      </fieldset>
      {currentRun && (
        <Card>
          <h2>Lần kiểm thử {currentRun.id.slice(0, 8)}</h2>
          <p>
            Bắt đầu: {new Date(currentRun.createdAt).toLocaleString("vi-VN")} ·{" "}
            {currentRun.status}
          </p>
          <Link
            className="text-accent underline"
            href={`/verify?run=${currentRun.id}`}
          >
            Liên kết kết quả đã lưu
          </Link>
          {running ? (
            <Button variant="danger" onClick={() => void stopRun()}>
              Dừng sau case hiện tại
            </Button>
          ) : (
            currentRun.status !== "COMPLETE" && judgePackIds.includes(currentRun.pack) && (
              <Button disabled={busy} onClick={() => void run(true)}>
                Tiếp tục lần kiểm thử
              </Button>
            )
          )}
          <p className="text-sm">
            Có thể rời trang rồi mở lại liên kết này. Khi bị giới hạn tốc độ,
            chờ một phút và bấm Tiếp tục.
          </p>
        </Card>
      )}
      {!!history.length && (
        <details>
          <summary>Lịch sử kiểm thử gần đây</summary>
          <ul>
            {history.filter((row) => judgePackIds.includes(row.pack)).map((row) => (
              <li key={row.id}>
                <button
                  className="text-accent underline"
                  disabled={busy}
                  onClick={() => void loadRun(row.id)}
                >
                  {row.pack} · {row.completed}/{row.total} ·{" "}
                  {row.id.slice(0, 8)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p role="status">
        {loading ? "Đang tải kết quả đã lưu… " : ""}
        {running ? "Đang chạy… " : ""}
        {results.length}/{currentRun?.cases.length ?? cases.length} · Pass:{" "}
        {results.filter((result) => result.pass).length} · Fail:{" "}
        {results.filter((result) => !result.pass).length}
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {!!results.length && (
        <div
          className="overflow-x-auto"
          tabIndex={0}
          aria-label="Bảng kết quả Verify"
        >
          <table className="w-full text-left text-sm">
            <caption>Kết quả của lần kiểm thử đã lưu</caption>
            <thead>
              <tr>
                {[
                  "Case",
                  "Kỳ vọng",
                  "Thực tế",
                  "Kết quả",
                  "Thời điểm",
                  "Quy tắc",
                ].map((text) => (
                  <th className="p-2 border-b" key={text}>
                    {text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.caseId}>
                  <td className="p-2">{result.caseId}</td>
                  <td className="p-2">{result.expected.action}</td>
                  <td className="p-2">{result.actual?.action ?? "ERROR"}</td>
                  <td className="p-2">{result.pass ? "PASS" : "FAIL"}</td>
                  <td className="p-2 whitespace-nowrap">
                    {new Date(result.timestamp).toLocaleTimeString("vi-VN")}
                  </td>
                  <td className="p-2">
                    {result.actual?.ruleIds.join(", ") ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="space-y-3">
        {results.map((result) => (
          <Card key={result.caseId}>
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-bold">{result.caseId}</h2>
              <strong
                className={result.pass ? "text-emerald-700" : "text-red-700"}
              >
                {result.pass ? "PASS" : "FAIL"}
              </strong>
            </div>
            <p>
              Tình huống: {supportVerifyCases.find((item) => item.id === result.caseId)?.rawText ?? "Xem input trong hồ sơ đã lưu."}
            </p>
            <p className="text-xs text-slate-500">{result.timestamp}</p>
            <p>
              Expected: {result.expected.action} · {result.expected.bucket}{" "}
              {result.expected.rule && `· ${result.expected.rule}`}
            </p>
            <p>
              Actual: {result.actual?.action ?? "ERROR"} ·{" "}
              {result.actual?.bucket}
            </p>
            <p>Rule IDs: {result.actual?.ruleIds.join(", ") ?? "—"}</p>
            <p>{result.actual?.adminReason ?? result.error}</p>
            <p>
              Kiểm tra lưu trữ:{" "}
              {result.persistence?.checks.join(" · ") ?? result.error}
            </p>
            <ul>
              {[
                ...(result.actual?.questions ?? []),
                ...(result.actual?.reviewerQuestions ?? []),
              ].map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
            {supportVerifyCases.find((item) => item.id === result.caseId)
              ?.fault && (
              <p className="text-sm text-amber-800">
                Fault injection của adapter model (mô phỏng lỗi, không phải mất
                kết nối thật).
              </p>
            )}
            {result.requestId && (
              <Link
                className="text-accent underline"
                href={`/requests/${result.requestId}`}
              >
                Mở request / audit
              </Link>
            )}
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-3 text-xl font-bold">Judge input mới</h2>
        <p className="mb-3 text-sm">
          Nhập một yêu cầu chưa có trong fixture. Kết quả lưu thành hồ sơ demo
          để kiểm tra reviewer và audit.
        </p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void runJudge();
          }}
          className="space-y-3"
        >
          <fieldset disabled={busy}>
            <EmployeeIdentityFields fields={identity} onChange={setIdentity} />
          </fieldset>
          <label className="block">
            Yêu cầu tự do
            <Textarea
              value={judge}
              onChange={(event) => setJudge(event.target.value)}
              maxLength={6000}
              required
            />
          </label>
          <Button disabled={busy || !judge.trim()}>
            Đánh giá input mới
          </Button>
        </form>
        {judged?.decision && judged.canonical && (
          <div className="mt-4 space-y-3">
            <p>Kiểm tra lưu trữ: {readback}</p>
            <SupportResult
              decision={judged.decision}
              canonical={judged.canonical}
              audience="reviewer"
            />
            <Link
              className="text-accent underline"
              href={`/requests/${judged.id}`}
            >
              Xem hướng dẫn / chuyển admin
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
