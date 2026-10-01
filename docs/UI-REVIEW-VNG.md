# VNG workspace usability review

Base: `f7b8b95fcc5fcb3f0a663b1a76022e062095d2dd`. AI-assisted changes in a separate worktree; original uncommitted work is preserved. Scope: review dashboard, shared interaction styling, audit readability, confirmed search/navigation defects and regression checks. No production data/model calls or authorization redesign.

## Design plan

Official palette reference: https://vng.com.vn/guidelines/brand/colour-palettes.html. Primary orange `#F05A22`; white `#FFFFFF`; ink `#202124`; soft surface `#FAFAF8`; orange-tinted selection `#FFF0E9`; accessible dark accent text `#A7360D`. Secondary colors are reserved for informative status, not a competing navy sidebar. These surface/text tints are application choices, not additional official brand colors.

Keep the existing locally bundled Nunito for Vietnamese text and avoid introducing unlicensed corporate fonts. Headings 28–32px, request subjects 15–16px, body 14–16px; left-aligned controls and text. The visual anchor is a bright orange support rail, with white request surfaces and an orange selection mark. No decorative KPI values or continuous animation.

Layout: `support rail | heading + quick queues + search/filter toolbar + request list`. On mobile the rail becomes a compact navigation row and filters stack. Detail actions remain next to evidence on desktop and below the request on mobile. Reset filters, recovery and focus states are visible. Shared buttons/forms/timeline use consistent interaction treatments across sender, tracking, reviewer, audit and Verify.

Critique before implementation: an animated landing-page kit or identical KPI cards would distract from reading and resolving tickets. Keep the mascot entry and existing primitives; use explicit loading feedback, useful quick filters and shorter rows instead. The suggested component libraries are options, not a requirement to install ten overlapping UI systems; this change adds no dependency or copied third-party component.

## Verification

### Confirmed defects

- Displayed `HT-XXXXXXXX` request IDs were passed literally into searches over raw UUIDs. Exact short-code input is now normalized consistently for Mongo and memory, including audit searches. Other free text remains literal; short IDs are not guaranteed globally unique.
- Reviewer state reset when returning from a detail, and old rows could remain visible under a changed filter after a failed request. Filters/search now restore from validated, length-bounded session storage; reset and empty-state recovery are explicit, and new queries clear old rows. Storage failure does not block filtering. Search terms remain in that tab's session; demo/anonymized input only.
- The newly added mock employee API could not read its CSV: rows 28/35 used IDs that contradicted the declared name-to-ID algorithm. Corrected `oanhtn` → `oanhnt` and `nhant` → `nhannt`, with levels and other fields unchanged. Tests reproduced HTTP 500 before the fix and exercise missing/unknown identity, all 36 mock records and the level-21 gate afterward. These are application-directory corrections, not changes to policy Ground Truth or test expectations.
- Employee directory exceptions no longer emit raw parser/filesystem error details to logs. The response remains a generic error and no authorization rule changes.

### Coverage and limits

Unit/integration covers policy, sentiment, extraction/output validation, redaction, evaluator, memory and mocked Mongo, CAS and API access boundaries. E2E covers freeform/structured intake, previews and confirmation, follow-up/sentiment, clarification, safe escalation, reviewer actions/reasons/history, knowledge suggestions, queue search/reset/recovery, audit, Verify and resumption, tracking, QR, onboarding, reduced motion and responsive layouts. Employee RBAC is additionally checked through the built HTTP endpoint.

Synthetic local checks do not prove production Mongo durability, paid model availability, SSO or real-user usability. The employee identity header remains a mock identity; it does not authorize real reviewer teams. No remote data mutation or manual deployment is part of this task. Global styles improve shared controls, while the dashboard and audit receive the substantive layout changes. No new component library, font or animation dependency was installed.

### Final local results

- `npm test`: 505 tests passed across 32 files.
- `node --test scripts/mongo-smoke-guard.test.mjs`: 11 checks passed; no live Mongo connection.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- With `SUPPORT_E2E_PRODUCTION=true`, `npm run test:e2e -- --project=chromium`: 45 passed; `npm run test:e2e -- --project=mobile`: 44 passed, one existing desktop-only recording skipped. Both used the production build on `127.0.0.1:3227` with mock provider and memory storage. Build and E2E ran sequentially.
- `tests/e2e` contains 15 spec files and two helper files (17 files total).
- Desktop/mobile queue screenshots and desktop audit/detail screenshots were inspected locally. The final mobile pass removes duplicate navigation and keeps the refresh control compact. Generated screenshots, recordings and runtime results are excluded from the commit.
- Original checkout preservation check: 305 initial changed/untracked files matched their recorded SHA256 values, with unchanged Git status. No original work was staged.

These results apply to this candidate worktree, not to a deployed version. They are AI-assisted local checks, not human review or evidence that every possible input is error-free. Publication to GitHub follows the user's standing main-branch instruction; no manual deployment or infrastructure change is included.
