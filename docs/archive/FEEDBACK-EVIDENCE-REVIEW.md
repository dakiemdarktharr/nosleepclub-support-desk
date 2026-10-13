> Báo cáo lịch sử: chỉ áp dụng cho phiên bản/ngày ghi bên dưới. Xem [mục lục hiện hành](../README.md) và [rà soát mới](../REPO-AUDIT-2026-10-14.md).

# Verified technical feedback and remaining evidence

Base: `5ccdb9769e651528c05cf51a41682a01490e7801` (GitHub main at task start). AI-assisted local changes; no human review, publication or deployment is inferred. Scope: redaction boundaries, evaluation provenance, isolated Mongo restart harness, documentation. The student-assistance framing in earlier reviews does not change this IT support product.

## Findings and changes

| Finding in current code | Resolution / limit |
| --- | --- |
| Intake is sanitized before initial persistence and extraction; clarification, conversation and reviewer reasons have sanitization paths. | Regression exercises these paths and inspects model extraction arguments and persisted request/audit. No raw input is added to logs. |
| Snake-case credentials such as JSON `client_secret` with colon were missed; decomposed Unicode labels could evade matching. | Match JSON and assignment forms; NFKC normalization and removal of selected zero-width characters occur before matching. This is not universal obfuscation detection. |
| PII was not comprehensively anonymized. | Mask contiguous 12-digit CCCD after an explicit Vietnamese label and Vietnamese mobile formats after phone labels (0 or +84, prefix 3/5/7/8/9, remaining 8 digits, optional spaces/dots/hyphens). Synthetic numbers only in tests. No identity validation; unrelated/unlabelled numbers, names, email, addresses, scores and unsupported formats remain outside this guarantee. |
| Evaluator metrics correctly exclude missing predictions, but caller-selected held-out/consented labels are not evidence. | Add `evidenceAssessment` with the declared split/source separately from NOT_COLLECTED independent held-out, consent verification, authenticated label review and real-user study. Even 100% declared accuracy cannot populate those fields. |
| Mongo uses atomic document CAS and fails closed, with mock regression already present. | Extend HTTP error and deployment-memory guard regression; add isolated application restart/read-back harness. Health now explicitly returns `persistenceVerification: NOT_PERFORMED`; `durable` remains adapter metadata for compatibility. |
| Review queue filters and assigned-team labels exist. | They do not authenticate identity, restrict team reads/actions, assign a real worker or notify anyone. Do not treat public-demo review as production access control. |

## Privacy boundary inventory

- `supportInputSchema` restricts field keys; `prepareInput`/`safeInput` redact rawText and every allowed field value before extraction, initial request persistence and preview analysis. Validators return schema-root/code errors rather than reflecting input keys.
- `clarifySupport` redacts combined original/new input; `continueConversation` redacts before sentiment and re-analysis; `feedbackSupport` sanitizes replies and pending knowledge suggestions; `reviewSupport` sanitizes reasons before audit.
- Model extraction/answer validators reject recognized secret patterns in returned prose; quotes must still pass evidence validation. Stored safe fields feed request, reviewer and audit UI. Sanitization does not prove model prose or quotes are correct.
- Form text exists in the browser before server handling. Historical stored records are not migrated by this patch. Unsupported PII/obfuscation may still reach model/storage/UI. Use synthetic or independently anonymized data, including employee identifiers and evaluation reviewer IDs.
- Existing fail-safe behavior for redaction markers is retained; masking does not grant policy authority or approval.

## Reproducible Mongo evidence

Run `node --test scripts/mongo-smoke-guard.test.mjs` without Mongo. This checks refusal of remote/SRV/authenticated URIs, ambiguous targets, application Mongo environment, local dotenv files and absent acknowledgement.

Live local procedure (requires separately installed Mongo and a clean checkout without `.env*` except `.env.example`):

1. Start a **dedicated disposable local mongod**, bound only to `127.0.0.1`, port `27028`, using a newly created empty data directory. Do not point this instance at production storage or a production tunnel. The loopback guard cannot prove what service an operator has put behind a port.
2. Finish `npm ci` and `npm run build` using mock and no database/model credentials. Do not run E2E concurrently; port 3227 must be free. The harness refuses existing servers and never kills them.
3. In a fresh PowerShell session with `MONGODB_URI`, `MONGODB_DB`, `VERCEL` unset:

   ```powershell
   $env:SUPPORT_TEST_MONGO_ACK = 'isolated-local-synthetic'
   $env:SUPPORT_TEST_MONGO_URI = 'mongodb://127.0.0.1:27028/'
   node scripts/mongo-restart-smoke.mjs
   ```

The script picks a unique `support_persistence_test_*` database and requires it to have no collections. The child server receives an allowlisted OS environment plus mock provider, zero model budget and the isolated DB. It creates one synthetic request, checks the actual Mongo document is redacted, stops its Next process, starts a fresh process and compares the full request (including audit). Two concurrent Stop calls must yield 200/409, one version increment and one STOP event. A third process points at an owned non-Mongo listener: health/read/write must fail with 503, and the actual test document must remain unchanged. This models connection failure; it does not simulate every Mongo failure mode or a Mongo daemon/host restart.

No database/collection/counter is deleted or reset. Output includes only revision, Node version, generated DB name and check statuses; retain it outside Git and record local Mongo version separately. Stop the dedicated Mongo instance yourself after inspection. Failure messages intentionally omit response bodies, URIs and driver errors. A failed/refused run is not evidence of persistence. Process interruption may leave synthetic test data; do not run against a shared instance.

## Owner decisions required before real reviewers or real data

| Decision | Required information |
| --- | --- |
| Identity | Chosen identity provider, tenant, verified subject identifier and login/session requirements. No provider selected here. |
| Team authorization | Authoritative identity-to-team mapping; who can read each queue/ticket; approve, reject, override and fulfil permissions; cross-team and emergency rules. |
| Routing/notifications | Real team owners, notification destination/provider, acknowledgement and retry/escalation policy. |
| Audit/privacy | Retention, deletion/access policy, approved anonymization scope, consent custody, and trusted audit actor mapping. |
| Independent evaluation | Dataset steward, frozen split and leakage review, label reviewer independence, consent evidence outside repo, and evaluation protocol. |

These decisions block production authorization/data collection, not the local changes above. Public-demo reviewer gate remains explicit; filters are not access controls. No SSO, team mapping, notifications, threshold activation or production configuration is added.

## Checks for this candidate

These results describe this local checkout on Node 24.18.0, not hosted CI, live model behavior or production persistence. Ground Truth and expected fixture data remain unchanged. No local mongod/docker executable or isolated Mongo test configuration was available for a live run; only guard refusal and mocked adapter checks were exercised.

| Command | Local result |
| --- | --- |
| `npm ci` | Passed; lockfile unchanged, audit reported zero vulnerabilities. |
| `npm test` | 498 passed across 30 unit/integration test files; mock/memory and mocked Mongo. |
| `node --test scripts/mongo-smoke-guard.test.mjs` | 11 passed; no DB connection. |
| `node scripts/mongo-restart-smoke.mjs` without opt-in/config | Refused with exit 1 as intended; Mongo live run NOT PERFORMED. |
| `node --check scripts/mongo-restart-smoke.mjs` | Passed syntax check; not a live integration result. |
| `npm run lint` / `npm run typecheck` / `npm run build` | All passed. |
| `SUPPORT_E2E_PRODUCTION=true`, `npm run test:e2e -- --project=chromium` | 42 passed. |
| Same setting, `npm run test:e2e -- --project=mobile` | 41 passed, 1 existing desktop-only recording skip. |
| `git diff --check` | Passed. |

There are 13 `*.spec.ts` files in `tests/e2e`, plus 2 helper files (15 files there total). E2E used the local production build, mock provider and memory on 127.0.0.1:3227, separately for each project. The CI configuration now also runs guard tests; it has not been run remotely for this local-only candidate. Test-generated JSON/screenshots/video are excluded from the commit. Original checkout status and checksums of its 299 modified/untracked files were unchanged. This task creates one local commit only, with AI assistance and no inferred human review.
