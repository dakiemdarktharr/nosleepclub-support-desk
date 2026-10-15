import {
  conversationRoute,
  conversationalCanonical,
} from "@/domain/conversation";
import { createConversationAnswer } from "@/lib/conversation-model";
import { workEvidencePlan } from "@/domain/work-evidence";
import {
  employeeIdentityError,
  isEmployeeIdentityField,
} from "@/domain/employee-identity";
import { retrieveKnowledge, rankKnowledge } from "@/lib/support-knowledge";
import { knowledgeSeed } from "@/domain/knowledge";
import { validateVerificationInput } from "./verification";
import { createHash, randomUUID } from "node:crypto";
import type {
  AuditEvent,
  CanonicalRequest,
  Decision,
  SentimentAssessment,
  SupportInput,
  SupportRequest,
  SupportPreview,
} from "@/domain/contracts";
import { supportInputSchema } from "@/domain/input";
import { POLICY_VERSION, guidanceRules } from "@/domain/policy-source";
import { proposeAccessDuration } from "@/domain/access-defaults";
import { evaluatePolicy } from "@/domain/policy";
import { extractIntake, safeInput, safeDeterministicGuidance } from "@/domain/text";
import {
  getSupportRequest,
  getSupportPreview,
  saveSupportPreview,
  insertSupportRequest,
  SupportError,
  updateSupportRequest,
} from "@/lib/support-repository";
import { verifyApproval } from "./approvals";
import {
  createAssistanceWithFallback as createAssistance,
  extractWithModel,
  modelFailure,
  type ModelOptions,
} from "@/lib/support-model";
import {
  analyzeSupportSentiment,
  supportRequestSentimentFallback,
} from "@/lib/feedback-model";
import { sentimentFallbackReason } from "@/domain/sentiment-diagnostics";
import { measureSupportStage, measureSupportSync } from "@/lib/support-telemetry";
import { reviewedGuideAnswers } from "@/lib/reviewed-guidance";

export function auditEvent(
  request: SupportRequest,
  beforeStatus: SupportRequest["status"] | null,
  action: string,
  actor: string,
  explanation: string,
): AuditEvent {
  return {
    ...(request.canonical ? { model: request.canonical.model } : {}),
    ...(request.assistance.length ? {
      assistanceSource: request.assistance.at(-1)!.source,
      generationReason: request.assistance.at(-1)!.generationReason,
      assistanceModel: request.assistance.at(-1)!.model,
      fallbackReason: request.assistance.at(-1)!.fallbackReason ?? request.assistance.at(-1)!.answer?.fallbackReason,
    } : {}),
    id: randomUUID(),
    requestId: request.id,
    timestamp: new Date().toISOString(),
    actor: request.input.requesterMode === "guest" && actor === "employee-demo" ? "guest" : actor,
    beforeStatus,
    afterStatus: request.status,
    action,
    requestKind: request.decision?.requestKind ?? "OTHER",
    riskLevel: request.decision?.riskLevel ?? "UNKNOWN",
    bucket: request.decision?.bucket ?? "MISSING_INFO",
    ruleIds: request.decision?.ruleIds ?? ["INTAKE-001"],
    safeEvidence: request.decision?.safeEvidence ?? [
      request.input.rawText || "Structured intake",
    ],
    missingFields: request.decision?.missingFields ?? [],
    questions: request.decision?.questions ?? [],
    targetedQuestions:
      request.decision?.targetedQuestions ??
      request.decision?.reviewerQuestions ??
      [],
    nextStep:
      request.decision?.nextStep ?? "Chờ deterministic policy đánh giá.",
    policyVersion: request.decision?.policyVersion ?? "intake-v1",
    redactions: request.canonical?.redactions ?? [],
    approvalStatus: request.decision?.approvalStatus ?? "pending",
    approvalReference: request.decision?.approvalReference,
    subrequestOutcomes: request.decision?.subrequestOutcomes ?? [],
    ...(request.canonical?.workEvidence
      ? { sourceChecks: request.canonical.workEvidence.sourceChecks }
      : {}),
    explanation,
  };
}
export function prepareInput(value: unknown) {
  return measureSupportSync("inputValidation", () => {
    const parsed = supportInputSchema.parse(value);
    return safeInput(parsed);
  });
}
function requireIntakeIdentity(input: SupportInput) {
  if (input.requesterMode === "guest") return;
  const identityError = employeeIdentityError(input.fields);
  if (identityError)
    throw new SupportError("IDENTITY_REQUIRED", identityError, 422);
}

// Unavailability is not invalid extraction. Only independently established,
// read-only guidance with a reviewed template may survive an upstream outage.
function recoverSafeGuidance(
  input: SupportInput,
  baseline: CanonicalRequest,
  failed: CanonicalRequest,
): CanonicalRequest {
  if (failed.model.failure !== "MODEL_UNAVAILABLE" ||
      !["AUTHENTICATION", "TIMEOUT", "RATE_LIMIT", "UPSTREAM_ERROR", "NOT_CONFIGURED", "BUDGET_EXHAUSTED", "SIMULATED"].includes(failed.model.failureReason ?? "") ||
      !safeDeterministicGuidance(input, baseline) ||
      baseline.riskSignals.length || baseline.redactions.length ||
      baseline.subrequests.length || baseline.ambiguities.length) return failed;
  let candidate = baseline;
  const conversation = baseline.intentLabel === "GENERAL_HOW_TO"
    ? conversationRoute(input, baseline) : null;
  const reviewedTopic = conversation
    ? rankKnowledge(knowledgeSeed, conversation.question, conversation.label)[0] : undefined;
  if (conversation?.label === "GENERAL_GUIDE" &&
      reviewedTopic?.label === conversation.label &&
      reviewedTopic._id !== "support-kb-v1-general_guide") {
    candidate = conversationalCanonical(baseline, conversation);
  } else if (baseline.intentLabel === "GENERAL_HOW_TO" ||
      !guidanceRules.some((rule) => rule.labels.some((label) => label === baseline.intentLabel))) {
    return failed;
  }
  const decision = evaluatePolicy(candidate, verifyApproval);
  if (decision.action !== "AUTO_APPROVE" ||
      !["GUIDE", "LLM_ASSIST"].includes(decision.handlingMode) ||
      decision.missingFields.length) return failed;
  return {
    ...candidate,
    model: {
      source: "deterministic",
      model: failed.model.model,
      attempts: failed.model.attempts,
      latencyMs: failed.model.latencyMs,
      fallbackReason: failed.model.failureReason ?? failed.model.failure,
    },
  };
}
export async function analyze(
  input: SupportInput,
  markers: string[],
  options: ModelOptions = {},
): Promise<{
  canonical: CanonicalRequest;
  decision: Decision;
  sentiment?: SentimentAssessment;
}> {
  // Sender identity is metadata for record management, not a support fact.
  const analysisInput = {
    ...input,
    fields: Object.fromEntries(
      Object.entries(input.fields).filter(
        ([field, value]) => !isEmployeeIdentityField(field) && value.trim(),
      ),
    ),
  };
  const baseline = measureSupportSync("extraction", () => extractIntake(analysisInput, markers));
  const mockRouting = (process.env.AI_PROVIDER || "mock") === "mock";
  const intentModelSkipped = baseline.riskSignals.length > 0 ||
    baseline.subrequests.length > 1 ||
    !analysisInput.rawText.trim() ||
    input.mode === "structured" ||
    baseline.intentLabel === "DEVICE_RESET_GUIDANCE";
  const singleResourceProvisioning =
    ["CLOUD_VM_REQUEST", "DATABASE_PROVISION"].includes(baseline.intentLabel) &&
    baseline.subrequests.length === 0;
  const workEvidence = mockRouting && input.mode === "freeform" &&
    !singleResourceProvisioning &&
    !(baseline.requestKind === "ACCESS_REQUEST" && baseline.entities.permission) &&
    !Object.keys(analysisInput.fields).length &&
    !baseline.riskSignals.length &&
    !baseline.subrequests.some((part) => part.riskSignals.length) &&
    !baseline.redactions.length
      ? workEvidencePlan(input.rawText)
      : undefined;
  if (workEvidence) {
    const canonical = { ...baseline, workEvidence };
    await checkWorkSources(canonical, input.rawText);
    return { canonical, decision: measureSupportSync("policy", () => evaluatePolicy(canonical, verifyApproval)) };
  }
  const conversation = mockRouting
    ? conversationRoute(analysisInput, baseline)
    : null;
  let canonical: CanonicalRequest;
  let sentiment: SentimentAssessment | undefined;
  if (conversation) {
    canonical = conversationalCanonical(baseline, conversation);
  } else {
    const extraction = await extractWithModel(analysisInput, baseline, options);
    const { sentimentAssessment, ...canonicalOnly } = extraction;
    sentiment = sentimentAssessment;
    canonical = recoverSafeGuidance(analysisInput, baseline, canonicalOnly);
    if (
      !sentiment &&
      !mockRouting &&
      intentModelSkipped &&
      analysisInput.rawText.trim()
    )
      sentiment = await analyzeSupportSentiment(
        analysisInput.rawText,
        "support-request",
        options,
      );
  }
  if (canonical.workEvidence) await checkWorkSources(canonical, input.rawText);
  return {
    canonical,
    decision: measureSupportSync("policy", () => evaluatePolicy(canonical, verifyApproval)),
    sentiment,
  };
}
async function checkWorkSources(canonical: CanonicalRequest, question: string) {
  const workEvidence = canonical.workEvidence;
  if (!workEvidence) return;
  // This server has no connector for the user's private business artifact.
  try {
    const found = await retrieveKnowledge(question, "GENERAL_GUIDE");
    workEvidence.sourceChecks.push({
      source: `Kho kiến thức (${found.storage})`,
      result: found.articles.length
        ? `Tìm thấy bài hướng dẫn: ${found.articles.map((row) => row.title).join("; ")}. Các bài này không phải artefact của yêu cầu.`
        : "Không tìm thấy artefact phù hợp trong kho đã cấu hình.",
    });
  } catch {
    workEvidence.sourceChecks.push({ source: "Kho kiến thức", result: "Tra cứu thất bại; chưa thể xác nhận nội dung nguồn." });
  }
  workEvidence.sourceChecks.push({
    source: "Attachment, workspace/repository, Drive, dashboard, hệ thống tác vụ bên ngoài",
    result: "Ứng dụng chưa có connector đọc các nguồn này. Không thể mở đường dẫn/URL chỉ từ nội dung tin nhắn.",
  });
}
function fingerprintOf(input: SupportInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...input,
        fields: Object.fromEntries(Object.entries(input.fields).sort()),
        confirmed: undefined,
        idempotencyKey: undefined,
        previewId: undefined,
      }),
    )
    .digest("hex");
}
export async function completeAnalysis(
  input: SupportInput,
  markers: string[],
  options: ModelOptions = {},
) {
  const result = await analyze(input, markers, options);
  let assistance = null;
  if (
    result.decision.action === "AUTO_APPROVE" &&
    ["GUIDE", "LLM_ASSIST"].includes(result.decision.handlingMode)
  ) {
    try {
      const reviewedGuide = reviewedGuideAnswers(input, result.canonical, options.assistanceRound ?? 0);
      assistance = result.canonical.conversation
        ? await createConversationAnswer(result.canonical, options)
        : await createAssistance(
            result.canonical,
            result.decision.handlingMode === "LLM_ASSIST" && !reviewedGuide,
            options,
          );
      if (reviewedGuide && !assistance.fallbackReason)
        assistance.generationReason = "REVIEWED_TEMPLATE_SUFFICIENT";
    } catch (error) {
      result.canonical = modelFailure(result.canonical, error);
      result.decision = evaluatePolicy(result.canonical, verifyApproval);
    }
  }
  return { ...result, assistance };
}
export async function previewSupport(value: unknown, options: ModelOptions = {}) {
  const safe = prepareInput(value);
  requireIntakeIdentity(safe.input);
  const analysis = await completeAnalysis(safe.input, safe.markers, options);
  const sentiment = analysis.sentiment ??
    supportRequestSentimentFallback(
      safe.input.rawText,
      (process.env.AI_PROVIDER || "mock") === "mock" && !options.run
        ? "MOCK_PROVIDER"
        : analysis.canonical.model.failure
          ? sentimentFallbackReason(analysis.canonical.model.failureReason ?? analysis.canonical.model.failure)
          : analysis.canonical.model.fallbackReason
            ? sentimentFallbackReason(analysis.canonical.model.fallbackReason)
            : "INVALID_EVIDENCE",
      process.env.AI_MODEL,
    );
  const preview: SupportPreview = {
    id: randomUUID(),
    fingerprint: fingerprintOf(safe.input),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    ...analysis,
    sentiment,
  };
  await measureSupportStage("persistence", () => saveSupportPreview(preview));
  return {
    input: { ...safe.input, previewId: preview.id },
    canonical: preview.canonical,
    decision: preview.decision,
    assistance: preview.assistance,
    sentiment: preview.sentiment,
    expiresAt: preview.expiresAt,
    durationProposal: proposeAccessDuration(preview.canonical),
  };
}
async function waitForDecision(request: SupportRequest) {
  const deadline = Date.now() + 26_000;
  while (!request.decision && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    request = (await getSupportRequest(request.id)) ?? request;
  }
  if (!request.decision)
    throw new SupportError(
      "REQUEST_PROCESSING",
      "Yêu cầu đang được xử lý. Thử lại với cùng mã gửi.",
      409,
    );
  return request;
}
export async function submitSupport(
  value: unknown,
  options: ModelOptions = {},
): Promise<SupportRequest> {
  const safe = prepareInput(value);
  const input = safe.input;
  requireIntakeIdentity(input);
  if (!input.confirmed)
    throw new SupportError(
      "CONFIRMATION_REQUIRED",
      "Xác nhận preview trước khi gửi.",
      422,
    );
  await validateVerificationInput(input);
  const fingerprint = fingerprintOf(input);
  const existing = await getSupportRequest(input.idempotencyKey);
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      throw new SupportError(
        "IDEMPOTENCY_CONFLICT",
        "Mã gửi này đã dùng cho nội dung khác.",
        409,
      );
    // Recover abandoned receipts from an interrupted older worker. The version
    // guard still permits only one committed result; active workers get time to finish.
    if (
      !existing.decision &&
      Date.now() - Date.parse(existing.updatedAt) > 60_000
    ) {
      const result = await completeAnalysis(input, safe.markers, options);
      return updateSupportRequest(existing.id, existing.version, (draft) => {
        applyAnalysis(draft, result);
      });
    }
    return waitForDecision(existing);
  }
  let cached: SupportPreview | null = null;
  if (input.previewId) {
    cached = await getSupportPreview(input.previewId);
    if (
      !cached ||
      +cached.expiresAt <= Date.now() ||
      cached.fingerprint !== fingerprint ||
      cached.decision.policyVersion !== POLICY_VERSION
    )
      throw new SupportError(
        "PREVIEW_EXPIRED",
        "Thông tin đã đổi hoặc bản xem trước hết hạn. Vui lòng kiểm tra lại trước khi gửi.",
        409,
      );
    const current = evaluatePolicy(cached.canonical, verifyApproval);
    if (
      current.action !== cached.decision.action ||
      JSON.stringify(current.ruleIds) !==
        JSON.stringify(cached.decision.ruleIds)
    )
      throw new SupportError(
        "PREVIEW_EXPIRED",
        "Phê duyệt đã thay đổi. Vui lòng kiểm tra lại thông tin.",
        409,
      );
  }
  const now = new Date().toISOString();
  const request: SupportRequest = {
    id: input.idempotencyKey,
    version: 0,
    fingerprint,
    createdAt: now,
    updatedAt: now,
    status: "RECEIVED",
    input,
    originalQuestion: input.rawText,
    canonical: null,
    decision: null,
    assistance: [],
    feedback: [],
    events: [],
  };
  request.events.push(
    auditEvent(
      request,
      null,
      "RECEIVED",
      "employee-demo",
      "Đã tiếp nhận input đã redact; chưa có hành động thực thi.",
    ),
  );
  if (!(await insertSupportRequest(request))) {
    const winner = await getSupportRequest(request.id);
    if (!winner || winner.fingerprint !== fingerprint)
      throw new SupportError(
        "IDEMPOTENCY_CONFLICT",
        "Mã gửi bị trùng nội dung khác.",
        409,
      );
    return waitForDecision(winner);
  }
  const result =
    cached ?? (await completeAnalysis(input, safe.markers, options));
  return updateSupportRequest(request.id, 0, (draft) =>
    applyAnalysis(draft, result),
  );
}

function applyAnalysis(
  draft: SupportRequest,
  result: Awaited<ReturnType<typeof completeAnalysis>>,
) {
  const before = draft.status;
  draft.canonical = result.canonical;
  draft.decision = result.decision;
  if (result.assistance) draft.assistance.push(result.assistance);
  draft.status =
    result.decision.action === "AUTO_APPROVE"
      ? "AUTO_APPROVED"
      : result.decision.approvalStatus === "rejected"
        ? "REJECTED"
        : result.decision.approvalStatus === "revoked"
          ? "STOPPED"
      : result.decision.action === "ESCALATE"
        ? "ESCALATED"
        : "NEEDS_INFORMATION";
  if (result.assistance?.answer) {
    const answer = result.assistance.answer;
    draft.events.push(
      auditEvent(
        draft,
        before,
        "ANSWER",
        result.assistance.source,
        JSON.stringify({
          label: answer.label,
          knowledgeIds: answer.knowledgeIds,
          sources: answer.sources.map((source) => source.url),
          retrieval: answer.retrieval,
          webSearch: answer.webSearch,
          fallbackReason: answer.fallbackReason,
          ignoredOverride: answer.ignoredOverride,
        }),
      ),
    );
  }
  draft.events.push(
    auditEvent(
      draft,
      before,
      "DECISION",
      "deterministic-policy",
      result.decision.adminReason,
    ),
  );
}
