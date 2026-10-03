// Synthetic integration check. Never prints credentials, response bodies or DB errors.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { MongoClient } from "mongodb";
import { validateMongoSmokeConfig } from "./mongo-smoke-guard.mjs";

const base = "http://127.0.0.1:3227";
let child, client, unavailable;
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  child = undefined;
}
async function api(path, body) {
  const response = await fetch(base + path, {
    redirect: "error", signal: AbortSignal.timeout(20000),
    ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
async function start(uri, database, revision, expectUnavailable = false) {
  // Refuse occupied ports; never reuse or kill another application's server.
  const probe = createServer();
  probe.listen(3227, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((resolve) => probe.close(resolve));
  const env = {};
  for (const [key, value] of Object.entries(process.env))
    if (/^(path|systemroot|windir|temp|tmp|home|userprofile)$/i.test(key)) env[key] = value;
  Object.assign(env, { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", AI_PROVIDER: "mock", AI_MAX_ATTEMPTS: "0", OPENAI_API_KEY: "", MONGODB_URI: uri, MONGODB_DB: database, SUPPORT_ACCESS_MODE: "public-demo", APP_REVISION: revision });
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3227"], { env, stdio: "ignore", windowsHide: true });
  let launchFailed = false;
  child.on("error", () => { launchFailed = true; });
  for (let i = 0; i < 40; i++) {
    if (launchFailed || child.exitCode !== null) throw new Error("Owned server failed to start.");
    try {
      // A static page establishes startup even when Mongo health must fail.
      const page = await fetch(base, { redirect: "error", signal: AbortSignal.timeout(2000) });
      if (page.ok) {
        const health = await api("/api/support/health");
        if (expectUnavailable) assert.equal(health.status, 503);
        else {
          assert.equal(health.status, 200);
          assert.equal(health.body.data.sourceRevision, revision);
          assert.equal(health.body.data.storage, "MONGODB");
          assert.equal(health.body.data.provider, "mock");
        }
        return;
      }
    } catch { /* Retry startup; only a bounded, generic failure escapes. */ }
    await delay(250);
  }
  throw new Error("Owned server readiness failed.");
}
async function run() {
  const uri = validateMongoSmokeConfig(process.env, await readdir("."));
  const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const workingTreeClean = !execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  assert.match(sourceRevision, /^[a-f0-9]{40}$/);
  const database = `support_persistence_test_${randomUUID().replaceAll("-", "")}`;
  const revision = `${sourceRevision}:synthetic-${randomUUID()}`;
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
  const db = client.db(database);
  assert.equal((await db.listCollections().toArray()).length, 0);
  await start(uri, database, revision);
  const payload = { rawText: "VPN lỗi; client_secret: SYNTHETIC_RESTART_ONLY", fields: { department: "engineering", employeeId: "EMP-SMOKE-01" }, confirmed: true, idempotencyKey: randomUUID() };
  const before = await api("/api/support/requests", payload);
  assert.equal(before.status, 201);
  const request = before.body.data;
  assert.ok(request.id);
  assert.ok(!JSON.stringify(request).includes("SYNTHETIC_RESTART_ONLY"));
  assert.deepEqual((await db.collection("v3_support_requests").findOne({ _id: request.id })).data, request);
  await stop();
  await start(uri, database, revision);
  const after = await api(`/api/support/requests/${request.id}`);
  assert.equal(after.status, 200);
  assert.deepEqual(after.body.data, request);
  const review = { version: request.version, action: "STOP", reason: "Synthetic persistence concurrency check" };
  const updates = await Promise.all([api(`/api/review/${request.id}`, review), api(`/api/review/${request.id}`, review)]);
  assert.deepEqual(updates.map((result) => result.status).sort(), [200, 409]);
  const stored = (await api(`/api/support/requests/${request.id}`)).body.data;
  assert.equal(stored.version, request.version + 1);
  assert.equal(stored.events.filter((event) => event.action === "STOP").length, 1);
  await stop();
  // Owned non-Mongo listener models a broken DB connection without stopping Mongo.
  unavailable = createServer((socket) => socket.destroy());
  unavailable.listen(0, "127.0.0.1");
  await once(unavailable, "listening");
  await start(`mongodb://127.0.0.1:${unavailable.address().port}/`, database, revision, true);
  assert.equal((await api(`/api/support/requests/${request.id}`)).status, 503);
  assert.equal((await api("/api/support/requests", { ...payload, idempotencyKey: randomUUID() })).status, 503);
  assert.deepEqual((await db.collection("v3_support_requests").findOne({ _id: request.id })).data, stored);
  console.log(JSON.stringify({ sourceRevision, workingTreeClean, node: process.version, database, evidence: "local-synthetic-mongo", provider: "mock", restartReadBack: "PASS", concurrentCas: "PASS", unavailableReadWrite: "PASS", productionPersistence: "NOT_TESTED", cleanup: "No data deleted; retain disposable database for inspection." }, null, 2));
}
try { await run(); }
catch { console.error("Mongo smoke failed or refused. Check isolation guards, local Mongo, free port 3227 and a completed build. No live success is claimed."); process.exitCode = 1; }
finally {
  await stop();
  if (unavailable) await new Promise((resolve) => unavailable.close(resolve));
  await client?.close();
}
