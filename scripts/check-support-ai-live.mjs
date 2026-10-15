import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

// Explicit opt-in: this calls the configured paid API. Never writes a real ticket/database.
if (!process.argv.includes("--live") || process.env.AI_PROVIDER !== "openai" ||
    !process.env.OPENAI_API_KEY || !process.env.AI_MODEL) {
  console.error("Explicit --live and configured AI_PROVIDER=openai, AI_MODEL, OPENAI_API_KEY required. Do not paste credentials into commands.");
  process.exit(2);
}
process.env.MONGODB_URI = "";
process.env.IDENTITY_MONGODB_URI = "";
process.env.SUPPORT_STORAGE = "memory-demo";
process.env.AI_WEB_SEARCH = "false";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv.find(arg => arg.startsWith("--output="))?.slice(9) ?? join(tmpdir(), `support-ai-${randomUUID()}.json`));
const cases = [
  ["printer", "Máy in văn phòng báo kẹt giấy. Tôi nên kiểm tra gì trước?", "AUTO_APPROVE", "DEVICE_PRINTER"],
  ["vpn", "VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.", "AUTO_APPROVE", "VPN_NOT_CONNECTING"],
  ["reset", "Tôi muốn reset laptop.", "NEEDS_INFORMATION", "DEVICE_RESET_GUIDANCE"],
  ["restart-clarification", "Tôi muốn reset laptop.\nChỉ khởi động lại máy và giữ dữ liệu.", "AUTO_APPROVE", "DEVICE_RESTART_GUIDANCE"],
  ["public-rdp", "Mở port 3389 ra Internet để truy cập từ xa vào máy công ty.", "ESCALATE", "PORT_OPEN_REQUEST"],
  ["dns", "DNS là gì? Hãy giải thích ngắn gọn.", "AUTO_APPROVE", "CHAT_GENERAL_GUIDE"],
];
const report = {
  executedAt: new Date().toISOString(), sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  workingTreeDirty: !!execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(),
  environment: "local services / live OpenAI / isolated memory", model: process.env.AI_MODEL,
  synthetic: true, independentUserFeedback: false, ticketsCreated: 0, previewsCreated: 0, rows: [],
};
// Reserve a new evidence file before spending an API attempt. Never overwrite a previous run.
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
const server = await createServer({ configFile: false, root, logLevel: "error", cacheDir: join(tmpdir(), "vng-live-acceptance-vite"),
  resolve: { alias: { "@": join(root, "src") } }, server: { middlewareMode: true, hmr: false, watch: null } });
try {
  const { prepareInput, completeAnalysis } = await server.ssrLoadModule("/src/services/support.ts");
  for (const [id, rawText, action, intent] of cases) {
    const started = Date.now();
    try {
      const safe = prepareInput({ rawText, requesterMode: "guest", idempotencyKey: randomUUID() });
      const result = await completeAnalysis(safe.input, safe.markers);
      const passed = result.decision.action === action && result.canonical.intentLabel === intent;
      report.rows.push({ id, input: rawText, expected: { action, intent }, passed, latencyMs: Date.now() - started, ...result });
      console.log(JSON.stringify({ id, passed, action: result.decision.action, intent: result.canonical.intentLabel,
        model: result.canonical.model, assistanceSource: result.assistance?.source,
        fallbackReason: result.assistance?.fallbackReason ?? result.assistance?.answer?.fallbackReason,
        sentimentSource: result.sentiment?.source }));
    } catch (error) {
      // Never serialize upstream errors: they can include request headers or provider bodies.
      report.rows.push({ id, input: rawText, passed: false, errorClass: error?.constructor?.name ?? "UnknownError" });
    }
    await writeFile(output, JSON.stringify(report, null, 2));
    const row = report.rows.at(-1);
    if ([row.canonical?.model?.failureReason, row.canonical?.model?.fallbackReason,
      row.assistance?.fallbackReason].includes("AUTHENTICATION")) {
      console.error("Credential rejected; stopping this run without another request using the same credential.");
      break;
    }
  }
  const successfulExtractions = report.rows.filter(row => row.canonical?.model?.source === "openai" && !row.canonical.model.failure).length;
  if (report.rows.length !== cases.length || report.rows.some(row => !row.passed) || !successfulExtractions) process.exitCode = 1;
  console.log(JSON.stringify({ passed: report.rows.filter(row => row.passed).length, attempted: report.rows.length,
    total: cases.length, successfulOpenAIExtractions: successfulExtractions, report: output }));
} finally { await server.close(); }
