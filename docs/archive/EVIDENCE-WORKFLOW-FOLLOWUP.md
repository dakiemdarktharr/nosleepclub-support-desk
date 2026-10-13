> Báo cáo lịch sử: chỉ áp dụng cho phiên bản/ngày ghi bên dưới. Xem [mục lục hiện hành](../README.md) và [rà soát mới](../REPO-AUDIT-2026-10-14.md).

# Diagnosis follow-up and evidence-first LLM workflow

This change is AI-assisted. A local Git commit does not establish human review or production deployment.

## Source and integration

Base: `542d042097ff7ac2e73f1619f5543d513937d814`.

The twelve ordered patches in `TECH-SUPPORT-DIAGNOSIS-FOLLOWUP-542d042` were applied backend first, frontend second. They add bounded diagnostic possibilities, vetted potential fixes, cloud GPU contact guidance, and a follow-up box under safe assistance. The source package is preserved in the supplied `support-followup-542d` worktree. Its historical owner split and six-commit-per-owner instructions are superseded by the user's instruction to remove mandatory packages and commit locally.

The backend patch series also changes `src/domain/text.ts`, although the package plan did not list it. This integration includes that inspected patch: Vietnamese power/network symptom aliases and the “but still” diagnostic conjunction. It does not import unrelated uncommitted files from either checkout.

An additional correction keeps potential fixes in the same selection/order as model-selected vetted steps, and prevents model-supplied diagnosis/fixes from leaking through when the server has no such fields.

## Contract and behavior

- `src/domain/workflow-prompt.ts` holds the five evidence-first instructions and all ten task-specific workflows. `callModel` includes them at the real model boundary for both extraction and assistance, including injected test runners. Task-specific JSON schemas and deterministic safety checks still apply.
- Optional `CanonicalRequest.workEvidence` contains the work kind, requirements (`artifact`, `range`, `access`, `reason`), source lookup results, confidence and the next action. It is server-generated; clients and model output cannot supply it as an authority claim.
- Recognized, safe, freeform work requests first query the configured reviewed knowledge corpus. Missing private artefacts or tools produce `NEEDS_INFORMATION` under `INFO-EVIDENCE-001`, with precise requirements displayed in preview and request detail. Lookup failures are reported as failures, not as proof that a source is absent. Source checks are retained in audit events.
- `NEEDS_INFORMATION` remains visible in all requests and accepts clarification. It no longer counts as pending review in either memory or Mongo query/metrics, or the shared status helper. The existing queue metric test changed because this is the requested business behavior; Ground Truth fixtures were not changed.
- Work requests without a draft cannot use feedback handoff to enter review. The prompt requires a complete draft, positioned evidence, diff or actual check output, risks and a concrete decision. The application has no general work-artifact execution/review pipeline yet, so this change does not claim to produce review-ready business artefacts.
- Security and authority escalation remain separate helpdesk paths with their existing precedence. New task routing cannot erase risk signals, redactions, conflicting structured input or dangerous follow-up requests. These incidents may still require immediate human attention.

Policy is now `support-guidance-v5.3`; old previews fail the policy-version check. The answer cache namespace also changes so old prose does not bypass the new prompt. Version assertions were updated accordingly, without relaxing security expectations.

## Real capability boundary

This application can read the submitted request and its reviewed local/Mongo knowledge corpus. Its existing allowlisted public web search remains limited to company/GPU guidance. It does **not** inherit Codex's workspace, attachment, Drive, email, calendar, dashboard, PR, SQL or task-system tools. A URL or path in a message is not an executed read.

This change supplies a truthful missing-source path and updates the LLM workflow contract; it does not implement connectors or general execution of all ten business tasks. Even pasted business data is not yet processed by a dedicated analysis, code-editing or document-editing engine. That requires a separately implemented source/compute adapter, output validation and a review packet. Until then the app must not claim a completed analysis, patch, forecast, meeting decision or test run. The UI's proposed next action is conditional on receiving the necessary data **and** tools.

No email is sent, task assigned, purchase order created, production database queried or paid model called by local validation. Test evidence is synthetic/local/mock, not live performance or human acceptance evidence.

## Local validation

Commands are run in the isolated integration worktree with mock AI and local memory storage:

```text
npm ci --no-audit --no-fund
npm run db:generate
npm run typecheck
npm test -- --reporter=dot
npm run lint
npm run build
npm run test:e2e
```

Results: typecheck, lint (zero warnings), production build and all **323 unit/integration tests** passed. Full desktop/mobile browser suite: **41 passed, 1 configured skip**, exit code 0. On Windows, the test runner waited for its Next dev server after all cases finished; the exact server process started by this run was verified and stopped, after which Playwright emitted its successful summary. The targeted diagnosis/conversation/evidence browser suite also passed all six cases without intervention.

Runtime screenshots, video, benchmark output churn, dependencies, secrets and build files are excluded from the commit. Package patch hashes are recorded in `docs/diagnosis-package-provenance.json`.

## Sprint 1 integration onto current main

Base: `15388e1629fd12acdf5e1ea37faf60e29c26b801`. User requests publishing directly to main and deleting codex/sprint1-review after integration. Scope recorded before source edits: selectively port remaining fixes/tests from `4a1872553161daf2d79eadcaf976dea98477f112`; retain the newer RAG, identity, conversation, policy and documentation on main. Main already handles MFA bypass, word-boundary routing, health policy version, and uses port3227. Do not replace it with old v3 code or restore deleted historical reports. Adapt independent synthetic tests to current required urgency and ROUTINE-004 device repair rule. No Ground Truth changes or production data/model operations. Original dirty checkout remains untouched. The integration is AI-assisted; Git identity does not establish human review.

The remaining fixes were reproduced on this main base (seven independent regression failures): change-ticket bypass priority, narrow local negation, negated network routing, guidance action gating, and validation key disclosure. They now pass. MFA/Unicode safeguards, the current synthetic quota policy, RAG/conversation, health ping and onboarding remain intact. Runtime policy is `support-guidance-v5.4`; previews and answer-cache keys therefore invalidate old policy results. Only version assertions changed in existing tests; original Ground Truth and fixture checksums remain unchanged.

Validation in this clean main checkout: Node24.18.0, `npm ci` (audit:0 vulnerabilities), `npm run db:generate`, `npm test -- --reporter=dot` (383/383 across30 files), lint, typecheck and build passed. Production-build E2E ran sequentially on127.0.0.1:3227 with mock/memory: Chromium37/37 (52.5s), mobile36 passed/1 configured duplicate-video skip (56.1s);12 E2E spec files. The new browser regression verifies the visible change-ticket Security reason; the existing secret test also checks detail-page text. No live model/Mongo or production-data operation was performed. Adapter tests are mocked, not evidence of live durability; RUNBOOK adds a separate disposable-Mongo restart/CAS procedure and privacy limits.

The latency script was adapted to the current department field and verified with next start/mock/memory:20 samples after5 warmup, p50=15.06ms, p95=17.72ms, max=19.13ms. This is one synthetic preview HTTP/JSON workload, not a before/after performance claim. CI YAML parses locally and uses separate desktop/mobile runs; hosted CI must be reported independently. New runtime artifacts, screenshots, video and regenerated submission output are excluded. The original dirty checkout's291 file hashes, HEAD and git status remained unchanged. AGENTS.md records the user's standing preference for checked commits pushed directly to main, with no force-push or implied production-data/manual-deployment permission.

## CI budget-test isolation

Base: `35a328e7af92ff3108938d32ed6d53d4f1404bb2`. Scope: isolate the memory budget test from the inherited AI_MAX_ATTEMPTS environment and explicitly verify that a zero budget rejects reservations without consuming allowance. AI-assisted test/documentation correction only; no production logic, policy, Ground Truth, global CI budget or credentials change.

GitHub run 36365922040 failed because CI deliberately supplies AI_MAX_ATTEMPTS=0 while the lifetime-budget test implicitly expected the default 20. Reproduced locally with CI mock/memory environment: 7 passed, 1 failed at the same assertion. The preceding local 383-test result did not use this zero-budget environment and therefore missed the issue.

After the correction, local validation with the workflow environment (including AI_MAX_ATTEMPTS=0): npm test -- --reporter=dot passed 384/384 tests across 30 files; npm run lint and npm run typecheck passed. Existing budget expectations (20, 30, hard cap 50) remain unchanged. Only this test and evidence document are staged; generated artifacts are excluded. Hosted build/E2E results will be checked after publishing and reported separately.
