// Local synthetic preview timing; no request is persisted and no live model is allowed.
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

async function measure() {
  const base = new URL(process.argv[2] || "http://127.0.0.1:3227");
  if (base.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(base.hostname) || base.username || base.password)
    throw new Error("Use a local HTTP server only.");
  const health = await fetch(new URL("/api/support/health", base), { signal: AbortSignal.timeout(15000) });
  const { data } = await health.json();
  if (!health.ok || data?.app !== "MLAI_SUPPORT_REFEREE_V3" || data.provider !== "mock" || data.storage !== "MEMORY_DEMO")
    throw new Error("Requires this application's mock/memory server.");
  async function request() {
    const start = performance.now();
    const response = await fetch(new URL("/api/support/preview", base), {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ rawText: "Mình hơi bực, bạn có thể hỗ trợ gì?", fields: { department: "engineering", employeeId: "EMP-LATENCY-01" }, idempotencyKey: randomUUID() }),
    });
    const body = await response.json();
    if (!response.ok || body.data?.decision?.action !== "AUTO_APPROVE" || body.data?.canonical?.conversation?.label !== "CAPABILITIES" || !body.data?.assistance?.answer?.text)
      throw new Error("Unexpected answer preview; timing aborted.");
    return performance.now() - start;
  }
  function summarize(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      samples: sorted.length,
      p50: sorted[Math.floor((sorted.length - 1) * 0.5)],
      p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
      max: sorted.at(-1),
    };
  }
  for (let i = 0; i < 5; i++) await request();
  const durations = [];
  for (let i = 0; i < 20; i++) {
    const elapsed = await request();
    if (i >= 5) durations.push(elapsed);
  }
  const concurrent = await Promise.all(Array.from({ length: 5 }, request));
  console.log(JSON.stringify({ route: "/api/support/preview", provider: "mock", storage: "memory",
    case: "CAPABILITIES with expressed frustration; answer prompt constructed, mock fallback returned",
    warmup: 5, sequential: summarize(durations), concurrency: 5, concurrent: summarize(concurrent),
    totalRequests: 30, units: "ms",
    scope: "Local synthetic HTTP + JSON latency; no OpenAI, Mongo or production calls; small burst only, not load-test evidence.",
  }, null, 2));
}
measure().catch(() => { console.error("Latency check failed. Verify the local mock/memory server and input URL."); process.exitCode = 1; });
