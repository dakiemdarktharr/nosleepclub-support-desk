# Repository bugfix review

Base: `74b82a9b43db96650e9bb0dc3e0c2978a75f395e` (GitHub `main`).

This AI-assisted review covers request/audit search and the audit/Verify result
states. It is not an exhaustive security audit or production validation.

## Confirmed defects and fixes

| Defect | Reproduction before the fix | Corrected behavior |
| --- | --- | --- |
| Audit displayed events and a pagination cursor from the previous filter after the new query failed. | Load events, change the query, return HTTP 503: two old events remain visible. | Clear events, count and cursor when filters change and on a full reload; retain the request sequence guard. A failed query does not display the empty-success message. |
| Successful event loading erased an unrelated metrics failure. | Return a metrics error, then release a delayed successful event response: the error disappears. | Keep metrics and event errors in separate state. |
| Judge input displayed an earlier persistence PASS for a new request whose readback failed. | Complete one input, submit another, fail its detail readback: the new result still says PASS. | Clear the previous result on submission, show readback progress, and explicitly mark a failed readback as unverified while preserving the new request link. |
| Memory search skipped the latest request text whenever an original question existed. | Store original and follow-up text, search by the follow-up: queue/audit return no results. | Search each of ID, original question, latest text and employee code independently, matching the Mongo text-search field set. |

The API contracts and deterministic policy are unchanged. No Ground Truth,
fixture expectations, employee dataset, model configuration or database data
were changed.

## Validation

- Baseline: 520 tests in 33 files passed; the new search regression failed.
- Baseline production build: the audit stale-result and Judge stale-PASS E2E
  regressions failed. A separate controlled-response test also reproduced the
  metrics-error race.
- After fixes: `npm test` passed 521 tests in 33 files.
- `node --test scripts/mongo-smoke-guard.test.mjs`: 11 passed.
- `npm run lint` and `npm run typecheck`: passed.
- `npm run build`: passed.
- `SUPPORT_E2E_PRODUCTION=true npm run test:e2e -- --project=chromium`:
  52 passed, including all three new browser regressions.
- `SUPPORT_E2E_PRODUCTION=true npm run test:e2e -- --project=mobile`:
  51 passed, 1 skipped (the existing desktop-only demo recording).
- `git diff --check`: passed for the task files.

All application checks use local synthetic data and mock/memory configuration.
Mongo query tests use mocks; no live Mongo restart, paid model call, production
write or manual deployment was performed. Generated test artifacts are excluded
from the commit. SHA-256 snapshots of all 305 changed/untracked files in the
original dirty checkout matched before and after the implementation.
