> Báo cáo lịch sử: chỉ áp dụng cho phiên bản/ngày ghi bên dưới. Xem [mục lục hiện hành](../README.md) và [rà soát mới](../REPO-AUDIT-2026-10-14.md).

# Enterprise feedback verification

Base: `8cbb51cb899c495e69422d290cc2cf9af2f3572e` (main). AI-assisted implementation; no claim of human review.

Scope recorded before implementation: remove the mascot's opaque background; reproduce and fix safe statement/question routing, post-answer sentiment and safety boundaries; expose separate policy/authority reviewer queues using existing decision metadata. Add synthetic regression cases without changing original Ground Truth. Verify locally in mock/memory and on hosted CI; no production database or paid model calls.

The supplied business feedback is evidence to check, not an implementation instruction. Its student-support description does not match this IT helpdesk. Current main already has Mongo persistence, a published site link and has removed legacy routes. Database durability/live model behaviour cannot be inferred from local tests. Policy already distinguishes MISSING_FACTS, OUT_OF_POLICY and AUTHORITY_REQUIRED, but reviewer lists lack separate routing filters. The existing sentiment seed is development data, not a held-out evaluation.

## Verified findings and changes

| Feedback / symptom | Verified state and correction |
| --- | --- |
| Mascot rectangle differs from page | Original PNG had an opaque warm-white background and CSS multiply blending. Replaced with an AI-assisted transparent cutout and removed multiply blending. Browser checks sample corner alpha and capture desktop/mobile renderings. |
| Two escalation stops share one queue | Existing decision classes were distinct but the paginated reviewer UI/API could not filter them. Added OUT_OF_POLICY / AUTHORITY_REQUIRED filters in both memory and Mongo queries, including counts and pagination. Summary shows class and assigned team. Policy gaps with complete facts go to Policy owner / existing team; Security retains priority. Quota escalation now includes a concrete owner question. |
| Statements versus questions / YouTube over-escalation | Recovery routing missed YouTube and colloquial account-access problems; generic safe statements missed conversation routing. Added bounded problem statements, account aliases and YouTube/Google retrieval equivalence. A video-only problem is not classified as account recovery. Structured actions, risk signals and authority gates still take precedence. |
| Sentiment | Existing 44-row development corpus had 13 mismatches. Added regression without changing labels. Negation, unresolved clauses and continuation take precedence over resolution/thanks. Terse neutral replies keep their diagnostic context. Explicit handoff/negative feedback keeps history. Positive wording cannot close a fresh operational/risky request or create a knowledge candidate for it. Feedback input limits now match the 2000-character conversation boundary. |
| Real database | Mongo adapter, fail-closed errors and CAS already exist. Added mocked Mongo queue filter/count tests; no live credential or restart-persistence test performed in this task. See RUNBOOK for disposable Mongo verification. |
| Old folders / deployment | Current main had already removed legacy routes and Prisma compatibility in intervening commits. No unrelated deletion or manual deployment. A listed URL and past deployment do not establish that this candidate is live. |
| False escalation on unseen data | Added 12 ordinary-help and 8 unsafe synthetic regression cases independent of original Ground Truth. Observed 0/12 unnecessary handoffs and 8/8 unsafe escalations in mock/memory. These cases were exposed during development; not held-out accuracy or a user study. The separate evaluation contract remains documented in docs/EVALUATION.md. |

Policy version: `support-guidance-v5.5`, invalidating old previews and answer cache keys. Existing test changes outside the new suite only update the version and the deliberately changed policy-owner destination; original fixtures/expected Ground Truth and sentiment corpus are unchanged.

YouTube account routing is grounded in [Google's YouTube sign-in documentation](https://support.google.com/youtube/answer/69961?hl=en), checked on 2026-10-01. The Google retrieval alias is applied only to the account-recovery context, not video playback questions. Existing reviewed Google recovery documents retain their original revision/provenance; no internal policy or entitlement is inferred.

Routing is a server-selected queue and destination label, not an organizational directory, notification integration or authenticated per-team authorization. The public-demo reviewer mode still needs real access control before organizational use. Rule-based sentiment has bounded Vietnamese/English coverage and can miss slang, sarcasm or complex negation. Redaction is not complete PII anonymization. Retrieval/quotes do not prove an entire generated answer; use synthetic/anonymized data and verify important claims.

## Checks in the isolated candidate worktree

- `npm ci`: passed, audit reported 0 vulnerabilities.
- Reproduction before fixes: 29 failures in the initial 63-case new regression suite. After fixes and additional cases: full `npm test -- --reporter=dot` passed 474/474 in 29 unit/integration files. Existing sentiment corpus now passes 44/44 development cases; original labels unchanged.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed on final source, mock provider, AI budget 0, no model keys or Mongo URI.
- Full production-build E2E on 127.0.0.1:3227: Chromium 39/39, mobile 38 passed / 1 configured duplicate-video skip. Following the last handoff-destination and retrieval-context corrections, rebuilt and reran conversation + enterprise-feedback E2E: 6/6 each desktop/mobile. There are 12 E2E spec files (14 files including two helpers), distinct from the 29 unit/integration files.
- Inspected rendered desktop/mobile mascot screenshots and verified corner transparency. Screenshots, videos, evaluation timestamps and generated runtime artifacts are excluded from the commit.
- Original dirty checkout preserved: HEAD and status unchanged; all 291 pre-existing file hashes unchanged, including the user's contracts and PROJECT-MEMORY drafts.
- Hosted CI and deployment are separate evidence, to be checked after publishing. No live OpenAI/Mongo call, production-data mutation, manual deployment or infrastructure change was performed.
