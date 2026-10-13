> Báo cáo lịch sử: chỉ áp dụng cho phiên bản/ngày ghi bên dưới. Xem [mục lục hiện hành](../README.md) và [rà soát mới](../REPO-AUDIT-2026-10-14.md).

# IT review workspace

Base: `fbb744f64f71733e3dfd6442a2da65d80b31209a`. Implementation is isolated in `.task-worktrees/it-review-ui` because existing checkouts contain uncommitted work. AI-assisted; human review is not established. No production release is implied.

Scope: `/review` queue and request detail, with route-scoped chrome. Preserve paginated search, source filters, request/version contracts, deterministic policy, security restrictions, reasons and audit events.

Design: VNG orange `#f05a22` identifies actions; navy `#223347` anchors navigation; slate `#536174` supports metadata; cool background `#f3f5f8`, white `#ffffff` and border `#dfe5ed` provide readable surfaces. Keep the bundled Vietnamese Nunito family, with 28px page titles, 18px section titles and 14–16px body text. Left-align text. Use a compact navigation rail, content column and sticky action panel. On narrow screens, put actions after the request and keep detail tabs below. Do not reuse the oversized landing-page heading or duplicate the decision explanation.

Queue: horizontal filters and structured rows. Detail: original redacted request, decision summary, actionable questions, grouped review buttons, explicit disabled explanations, and keyboard-accessible tabs for evidence, assistance and history. Keep technical codes available in evidence/history. All existing decisions are unchanged; interaction still sends action, reason, version and optional target to the same API.

Validation: typecheck, lint, build, unit/integration regression and desktop/mobile E2E, including keyboard tabs, versioned actions, missing-information/security guards, queue search/pagination and judge onboarding. All test data is synthetic and runtime uses local mock/memory settings. Check results are recorded after execution below.

## Completed checks

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run build`: pass.
- `npm test`: 355 passed across 28 files.
- `SUPPORT_E2E_PRODUCTION=true npm run test:e2e`: 71 passed, 1 skipped. The existing recording test intentionally records desktop only. All four new workspace tests passed on desktop/mobile.
- `git diff --check`: pass for task files.
- Visual review: local Chromium desktop and Pixel 7 screenshots, no horizontal overflow. Desktop reason input is visible within the initial viewport. Keyboard arrows/Home/End select and focus tabs; security approval/override remains disabled; missing-information approval remains disabled. Existing versioned reject/override/stop, audit, filters and onboarding regression passed.

The first E2E run caught an overly generic disabled explanation for approval on NEEDS_INFORMATION. The UI explanation was corrected; no policy, fixture or expected business outcome was changed. Final E2E rerun passed.

Local preview: `http://127.0.0.1:3264/review`, running mock provider and memory storage with three synthetic requests. The server must be restarted and sample data recreated after it stops; no production data or real model calls are used. Existing dependency installation is reused through a local ignored node_modules junction. No dependency/lockfile change.

Files: `src/components/review-console.tsx`, new `src/components/review-detail.tsx`, `src/components/support-result.tsx` (optional compact reviewer presentation), `src/components/header.tsx` (review-specific class), `src/app/globals.css` (scoped workspace styles), new `tests/e2e/it-review.spec.ts`, and this note.

Initial local delivery: task-only patch at `deliverables/IT-REVIEW-UI/IT-REVIEW-UI.patch` in the original workspace, based on `fbb744f`. The old dirty root checkout has not been updated. Generated test/build artifacts and all existing uncommitted user files are excluded from the patch.

## GitHub publication integration

The user explicitly requested a GitHub push. Current repository guidance calls for completed checked work on `main`. Integration uses a new clean checkout at remote base `c97b6450a917747260015b866bb8deccca9f92e0`, preserving the newer queue filters (`OUT_OF_POLICY`, `AUTHORITY_REQUIRED`), knowledge-review filter, destination teams, candidate badges and candidate content. Keep upstream removal of legacy routes and mascot blend mode. No policy, domain contract or expected fixture changes are part of this UI change.

Publication validation on the integrated source: typecheck, lint and production build pass; 474 unit/integration tests pass across 29 files; production-build E2E runs separately with 42 desktop passes and 41 mobile passes, plus the existing mobile recording skip. Six new desktop/mobile UI regressions cover keyboard navigation, actions, search and knowledge candidates; upstream policy/authority queue and onboarding regressions pass. Task-only staged diff has no whitespace errors. Local mock/memory evidence does not establish hosted CI or production status.

Git identity uses the original repository's configured identity; implementation and reconciliation are AI-assisted, with no inferred human authorship or review. No manual deployment or production-data operation is included.
