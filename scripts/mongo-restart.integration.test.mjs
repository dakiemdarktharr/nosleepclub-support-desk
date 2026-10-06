import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import { validateMongoSmokeConfig } from "./mongo-smoke-guard.mjs";
import { runMongoSmoke } from "./mongo-restart-smoke.mjs";

// Absence of a dedicated environment is an explicit skip, never a fake Mongo
// pass. Partial/unsafe configuration and failures after opt-in must fail.
const configured = Boolean(process.env.SUPPORT_TEST_MONGO_URI || process.env.SUPPORT_TEST_MONGO_ACK);
test("real isolated Mongo preserves request and reviewer audit across app restarts", {
  skip: configured ? false : "persistenceVerification=NOT_PERFORMED: no isolated Mongo test URI/ack configured; no connection attempted",
  timeout: 300_000,
}, async t => {
  validateMongoSmokeConfig(process.env, await readdir("."));
  await access(".next/BUILD_ID");
  let result;
  try {
    // Run in-process so the harness owns cleanup in finally; killing a wrapper
    // process on timeout could otherwise leave its Next child running.
    result = await runMongoSmoke();
  } catch {
    assert.fail("Mongo integration failed/refused; persistenceVerification=NOT_PERFORMED. Check isolated Mongo, guard, free port 3227 and build. No fallback or credential output.");
  }
  assert.equal(result.persistenceVerification, "APP_RESTART_VERIFIED");
  for (const key of ["restartReadBack", "reviewAuditRestart", "concurrentCas", "unavailableReadWrite"])
    assert.equal(result[key], "PASS", key);
  t.diagnostic(JSON.stringify(result));
});
