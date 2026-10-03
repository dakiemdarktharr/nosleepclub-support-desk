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
  const durations = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    const response = await fetch(new URL("/api/support/preview", base), {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ rawText: "How do I restart my laptop?", fields: { department: "engineering", employeeId: "EMP-LATENCY-01" }, idempotencyKey: randomUUID() }),
    });
    const body = await response.json();
    if (!response.ok || body.data?.decision?.action !== "AUTO_APPROVE")
      throw new Error("Unexpected preview response; timing aborted.");
    if (i >= 5) durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  console.log(JSON.stringify({ route: "/api/support/preview", provider: "mock", storage: "memory",
    samples: durations.length, warmup: 5, concurrency: 1, units: "ms",
    p50: durations[9], p95: durations[18], max: durations[19],
    scope: "Local synthetic HTTP + JSON latency only; not model, Mongo, production or load-test evidence.",
  }, null, 2));
}
measure().catch(() => { console.error("Latency check failed. Verify the local mock/memory server and input URL."); process.exitCode = 1; });
