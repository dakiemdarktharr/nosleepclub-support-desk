import { z } from "zod";
import type { WorkEvidence } from "./work-evidence";
import type { ConversationContext, ConversationLabel } from "./conversation";

export const requestKinds = [
  "GUIDANCE",
  "SAFE_DIAGNOSTIC",
  "ROUTINE_WORKFLOW",
  "ACCESS_REQUEST",
  "CONFIGURATION_CHANGE",
  "INCIDENT",
  "OTHER",
] as const;
export const serviceGroups = [
  "DEVICE_BOOT",
  "ACCOUNT_ACCESS",
  "DATABASE",
  "NETWORK_VPN",
  "SOFTWARE_LICENSE",
  "CLOUD_GPU",
  "KUBERNETES",
  "CI_CD",
  "MONITORING",
  "STORAGE",
  "SECURITY",
  "GIT_PERMISSION",
  "OTHER",
] as const;
export const environments = [
  "sandbox",
  "development",
  "staging",
  "production",
  "unknown",
] as const;
export const actions = [
  "AUTO_APPROVE",
  "NEEDS_INFORMATION",
  "ESCALATE",
] as const;
export const riskSignals = [
  "SECRET",
  "PUBLIC_EXPOSURE",
  "SECURITY_CONTROL",
  "BYPASS",
  "INJECTION",
  "DATA_EXPORT",
  "UNAPPROVED_SOFTWARE",
  "PRIVILEGED",
  "PRODUCTION_CHANGE",
  "DESTRUCTIVE",
  "CONFLICT",
  "INCIDENT",
  "CONTROL_CHANGE",
  "USER_HANDOFF",
  "MODEL_UNAVAILABLE",
  "MODEL_OUTPUT_INVALID",
  "MODEL_EVIDENCE_INVALID",
] as const;
export type RequestKind = (typeof requestKinds)[number];
export type ServiceGroup = (typeof serviceGroups)[number];
export type Action = (typeof actions)[number];
export type RiskSignal = (typeof riskSignals)[number];
export type Environment = (typeof environments)[number];

export const extractionSchema = z
  .object({
    language: z.enum(["vi", "en", "mixed"]),
    requestKind: z.enum(requestKinds),
    serviceGroup: z.enum(serviceGroups),
    intentLabel: z.string().min(1).max(80),
    entities: z.record(z.string().max(300)),
    environment: z.enum(environments),
    requestedAction: z.string().max(100),
    riskSignals: z.array(z.enum(riskSignals)).max(30),
    missingFields: z.array(z.string().max(80)).max(30),
    evidence: z
      .array(
        z
          .object({
            field: z.string().max(80),
            quote: z.string().min(1).max(6000),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    ambiguities: z.array(z.string().max(300)).max(20),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;

export type SupportInput = {
  requesterMode?: "guest";
  mode: "freeform" | "structured";
  serviceGroup: ServiceGroup;
  requestKind?: RequestKind;
  rawText: string;
  fields: Record<string, string>;
  confirmed: boolean;
  idempotencyKey: string;
  previewId?: string;
  verifyRunId?: string;
  verifyCaseId?: string;
};
export type CanonicalRequest = Extraction & {
  workEvidence?: WorkEvidence;
  conversation?: ConversationContext;
  subrequests: Extraction[];
  redactions: string[];
  model: {
    source: "deterministic" | "mock" | "openai";
    failure?: string;
    failureReason?: string;
  };
};
export type ApprovalStatus =
  | "not_required"
  | "pending"
  | "verified"
  | "rejected"
  | "expired"
  | "unverifiable"
  | "invalid";
export type ApprovalScope = "matched" | "mismatched" | "unknown";
export type SubrequestOutcome = {
  index: number;
  intentLabel: string;
  serviceGroup: ServiceGroup;
  action: Action;
  bucket: "ROUTINE" | "MISSING_INFO" | "SECURITY_RISK" | "BEYOND_AUTHORITY";
  ruleIds: string[];
  questions: string[];
};
export type Decision = {
  action: Action;
  requestKind: RequestKind;
  handlingMode: "GUIDE" | "LLM_ASSIST" | "SIMULATED_WORKFLOW" | "HUMAN_REVIEW";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  bucket: "ROUTINE" | "MISSING_INFO" | "SECURITY_RISK" | "BEYOND_AUTHORITY";
  uncertaintyClass:
    | "NONE"
    | "MISSING_FACTS"
    | "OUT_OF_POLICY"
    | "AUTHORITY_REQUIRED";
  ruleIds: string[];
  safeEvidence: string[];
  missingFields: string[];
  questions: string[];
  reviewerQuestions?: string[];
  clarificationFields?: string[];
  targetedQuestions: string[];

  userReason: string;
  adminReason: string;
  nextStep: string;
  assignedTeam: string;
  policyVersion: string;
  approvalStatus: ApprovalStatus;
  approvalReference?: string;
  subrequestOutcomes: SubrequestOutcome[];
};
export type RequestStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "AUTO_APPROVED"
  | "NEEDS_INFORMATION"
  | "ESCALATED"
  | "APPROVED_BY_HUMAN"
  | "REJECTED"
  | "STOPPED"
  | "COMPLETED";
export type FeedbackSentiment = "positive" | "neutral" | "negative";
export type SentimentAssessment = {
  sentiment: FeedbackSentiment;
  source: "model" | "rule-based" | "not-assessed";
  evidence: string;
  explanation: string;
  model?: string;
};
export type KnowledgeCandidate = {
  status: "PENDING_REVIEW";
  sourceRequestId: string;
  serviceGroup: ServiceGroup;
  intentLabel: string;
  symptom: string;
  answerSummary: string;
  steps: string[];
  employeeFeedback: string;
  createdAt: string;
};
export type AnswerSource = {
  title: string;
  url: string;
  scope: "public" | "project";
  checkedAt: string;
};
export type ConversationAnswer = {
  cacheHit?: boolean;
  generatedAt?: string;
  evidence?: Array<{ knowledgeId: string; quote: string }>;
  scopeNotice?: string;
  text: string;
  label: ConversationLabel;
  sources: AnswerSource[];
  knowledgeIds: string[];
  retrieval: "mongodb" | "memory" | "unavailable";
  webSearch: "used" | "disabled" | "not_needed" | "unavailable";
  fallbackReason?: string;
  webFailureReason?: string;
  ignoredOverride: boolean;
};
export type Assistance = {
  answer?: ConversationAnswer;
  summary: string;
  diagnosis?: string;
  potentialFixes?: string[];
  stepExplanations?: string[];
  contextEvidence?: string;
  stepByStepInstructions: string[];
  options: string[];
  expectedResult: string;
  warning: string;
  nextQuestion: string;
  canPassToAdmin: true;
  source: "deterministic" | "mock" | "openai";
  timestamp: string;
};
export type AuditEvent = {
  sourceChecks?: WorkEvidence["sourceChecks"];
  id: string;
  requestId: string;
  timestamp: string;
  actor: string;
  beforeStatus: RequestStatus | null;
  afterStatus: RequestStatus;
  action: string;
  requestKind: RequestKind;
  riskLevel: Decision["riskLevel"];
  bucket: Decision["bucket"];
  ruleIds: string[];
  safeEvidence: string[];
  missingFields: string[];
  questions: string[];
  targetedQuestions: string[];
  nextStep: string;
  policyVersion: string;
  redactions: string[];
  approvalStatus: ApprovalStatus;
  approvalReference?: string;
  subrequestOutcomes: SubrequestOutcome[];
  explanation: string;
};
export type SupportRequest = {
  id: string;
  version: number;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  status: RequestStatus;
  input: SupportInput;
  originalQuestion?: string;
  stepExplanations?: Array<{ step: number; text: string; timestamp: string }>;
  canonical: CanonicalRequest | null;
  decision: Decision | null;
  assistance: Assistance[];
  feedback: Array<{
    choice: "RESOLVED" | "STILL_BROKEN" | "CONFUSED" | "ADMIN" | "EXPLAIN";
    timestamp: string;
    sentiment?: FeedbackSentiment;
    replyText?: string;
  }>;
  knowledgeCandidate?: KnowledgeCandidate;
  events: AuditEvent[];
};

export type SupportPreview = {
  id: string;
  fingerprint: string;
  expiresAt: Date;
  sentiment: SentimentAssessment;
  canonical: CanonicalRequest;
  decision: Decision;
  assistance: Assistance | null;
};
export type SupportSummary = Pick<
  SupportRequest,
  "id" | "version" | "status" | "createdAt" | "updatedAt"
> & {
  employeeId?: string;
  title: string;
  serviceGroup: ServiceGroup;
  action: Action | null;
  hasKnowledgeCandidate?: boolean;
  uncertaintyClass?: Decision["uncertaintyClass"];
  assignedTeam?: string;
};
export type ResultPage<T> = {
  items: T[];
  nextCursor: string | null;
  total: number;
};
export function pendingReview(status: RequestStatus) {
  return ["ESCALATED", "APPROVED_BY_HUMAN"].includes(
    status,
  );
}
