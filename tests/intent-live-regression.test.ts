import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyze, completeAnalysis, prepareInput } from "@/services/support";
import { extractIntake } from "@/domain/text";
import { evaluatePolicy } from "@/domain/policy";
import { decodeIntentOutput, intentResponseSchema } from "@/lib/intent-contract";
import { resetSupportTestStore } from "@/lib/support-repository";
import type { ModelCall } from "@/lib/support-model";

const input = (rawText: string) => prepareInput({ requesterMode: "guest", rawText,
  fields: {}, idempotencyKey: crypto.randomUUID() }).input;
function wire(text: string, routing: Record<string, string> = { route: "support", serviceGroup: "DEVICE_BOOT", intentLabel: "DEVICE_PRINTER", requestKind: "GUIDANCE" }) {
  return { language: "vi", routing, entityFacts: [], environment: "unknown", requestedAction: "guidance",
    riskSignals: [], missingFields: [], ambiguities: [], intentEvidence: text,
    sentiment: { sentiment: "neutral", evidence: text, explanation: "Người gửi mô tả vấn đề." } };
}
beforeEach(() => { vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("MONGODB_URI", ""); resetSupportTestStore(); });
afterEach(() => vi.unstubAllEnvs());

it("uses a strict wire schema and supplies redundant conversation constants on the server", () => {
  expect(intentResponseSchema.additionalProperties).toBe(false);
  expect(decodeIntentOutput(wire("DNS là gì?", { route: "conversation", conversationLabel: "GENERAL_GUIDE" })))
    .toMatchObject({ route: "conversation", requestKind: "OTHER", serviceGroup: "OTHER", intentLabel: "UNKNOWN_SUPPORT_REQUEST", conversationLabel: "GENERAL_GUIDE", workKind: null });
});

it("asks to split independent safe tasks without manufacturing an authority conflict", async () => {
  const text = "Máy in bị kẹt giấy; VPN không kết nối; laptop bị treo.";
  const baseline = extractIntake(input(text));
  expect(baseline.subrequests.length).toBeGreaterThan(1);
  const run = vi.fn(async (call: ModelCall) => {
    expect(call.purpose).toBe("sentiment");
    return { sentiment: "positive", evidence: "Máy in bị kẹt giấy", explanation: "Nhãn giả lập để kiểm tra sentiment không quyết định policy." };
  });
  const { canonical, decision, sentiment } = await analyze(input(text), [], { run });
  expect(run).toHaveBeenCalledOnce();
  expect(sentiment?.source).toBe("model");
  expect(canonical.model.source).toBe("deterministic");
  expect(canonical.subrequests).toEqual(baseline.subrequests);
  expect(canonical.riskSignals).not.toContain("CONFLICT");
  expect(decision.action).toBe("NEEDS_INFORMATION");
  expect(decision.ruleIds).toContain("INFO-SINGLE-REQUEST-001");
});

it.each([
  "Máy in bị kẹt giấy; VPN không kết nối; tắt firewall.",
  "Máy in bị kẹt giấy; VPN không kết nối; xin quyền admin production.",
  "Máy in bị kẹt giấy; VPN không kết nối; xử lý nghiệp vụ nebula.",
  "VPN vẫn ổn nhưng xin tắt firewall.",
  "VPN vẫn ổn, mở port 3389 public.",
])("keeps dangerous or unmapped tasks above splitting/context cleanup: %s", text => {
  const canonical = extractIntake(input(text));
  expect(evaluatePolicy(canonical).action).toBe("ESCALATE");
});

it("retains a real parent conflict even when all independent child tasks are safe", () => {
  const canonical = extractIntake({
    ...input("Máy in bị kẹt giấy trong 4 giờ; VPN không kết nối; laptop bị treo."),
    fields: { duration: "8 hours" },
  });
  expect(canonical.riskSignals).toContain("CONFLICT");
  expect(evaluatePolicy(canonical).ruleIds).toContain("AUTH-006");
  expect(evaluatePolicy(canonical).action).toBe("ESCALATE");
});

it("retains model failure above the synthetic cross-function parent", () => {
  const canonical = extractIntake(input("Máy in bị kẹt giấy; VPN không kết nối; laptop bị treo."));
  canonical.riskSignals = ["MODEL_EVIDENCE_INVALID"];
  canonical.model = { source: "openai", failure: "MODEL_EVIDENCE_INVALID" };
  expect(evaluatePolicy(canonical).action).toBe("ESCALATE");
});

it.each([
  "Máy in văn phòng báo kẹt giấy. Tôi nên kiểm tra gì trước?",
  "Máy in bị kẹt. Hướng dẫn tôi kiểm tra an toàn.",
  "The printer is jammed. What should I check first?",
])("keeps a bounded guidance follow-up in the same read-only request: %s", async text => {
  const run = vi.fn(async (call: ModelCall) => { expect(call.responseSchema).toBe(intentResponseSchema); return wire(text); });
  const { canonical, decision } = await analyze(input(text), [], { run });
  expect(canonical.subrequests).toHaveLength(0);
  expect(canonical.model.failure).toBeUndefined();
  expect(canonical.riskSignals).not.toContain("CONFLICT");
  expect(decision.action).toBe("AUTO_APPROVE");
});

it.each(["Giải thích DNS là gì bằng hai câu ngắn, dễ hiểu.", "What is a firewall?", "Define a database.", "VPN là gì?", "Could you explain what DNS is?", "Bạn có thể giải thích DNS là gì?"])("does not turn a concept question into a resource mutation: %s", async text => {
  expect(extractIntake(input(text)).intentLabel).toBe("GENERAL_HOW_TO");
  const { canonical, decision } = await analyze(input(text), [], { run: async () => wire(text, { route: "conversation", conversationLabel: "GENERAL_GUIDE" }) });
  expect(canonical.model.failure).toBeUndefined();
  expect(canonical.riskSignals).toEqual([]);
  expect(decision.ruleIds).toContain("CHAT-001");
});

it("allows literal VPN evidence and does not label disconnects as a port change", async () => {
  const text = "VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.";
  const reply = { ...wire(text, { route: "support", serviceGroup: "NETWORK_VPN", intentLabel: "VPN_NOT_CONNECTING", requestKind: "SAFE_DIAGNOSTIC" }),
    entityFacts: [{ field: "symptom", quote: "ngắt kết nối" }] };
  expect(extractIntake(input(text)).intentLabel).toBe("VPN_NOT_CONNECTING");
  const { canonical, decision } = await analyze(input(text), [], { run: async () => reply });
  expect(canonical.model.failure).toBeUndefined();
  expect(canonical.entities.symptom).toBe("ngắt kết nối");
  expect(canonical.riskSignals).not.toContain("CONFLICT");
  expect(decision.action).not.toBe("ESCALATE");
});

it.each([
  [{ field: "symptom", quote: "paper jam" }],
  [{ field: "symptom", quote: "made up quote" }],
  [{ field: "symptom", quote: "kẹt" }, { field: "symptom", quote: "giấy" }],
  [{ field: "databaseType", quote: "kẹt giấy" }],
].map((entityFacts) => ({ entityFacts })))("rejects invented, translated, duplicate or wrong-service entity facts", async ({ entityFacts }) => {
  const text = "Máy in bị kẹt giấy";
  const { canonical, decision } = await analyze(input(text), [], { run: async () => ({ ...wire(text), entityFacts }) });
  expect(canonical.model.failure).toMatch(/^MODEL_(EVIDENCE|OUTPUT)_INVALID$/);
  expect(decision.action).toBe("ESCALATE");
});

it("asks for clarification about an ambiguous device without granting authority", async () => {
  const text = "Máy in có vấn đề";
  const { canonical, decision } = await analyze(input(text), [], { run: async () => ({ ...wire(text), ambiguities: ["Chưa rõ máy in nào."] }) });
  expect(canonical.riskSignals).not.toContain("CONFLICT");
  expect(decision.action).toBe("NEEDS_INFORMATION");
  expect(decision.ruleIds).toContain("INFO-AMBIGUITY-001");
});

it.each([
  "Giải thích DNS. Mở port 3389 public.",
  "Máy in kẹt. Hướng dẫn tôi xóa database production.",
  "What is DNS and grant production admin access?",
  "Máy in kẹt. Hướng dẫn tôi kiểm tra an toàn rồi tắt MFA.",
  "Giải thích DNS và cần quyền đọc database staging.",
])("retains independently requested operations and security guards: %s", async text => {
  const { canonical, decision } = await analyze(input(text), [], { run: async (call) => call.purpose === "sentiment"
    ? { sentiment: "neutral", evidence: text, explanation: "Câu mô tả yêu cầu." }
    : wire(text, { route: "conversation", conversationLabel: "GENERAL_GUIDE" }) });
  expect(decision.action).not.toBe("AUTO_APPROVE");
  expect(canonical.riskSignals.length > 0 || canonical.subrequests.length > 1 || canonical.model.failure).toBeTruthy();
});

it.each([
  { route: "support", serviceGroup: "DEVICE_BOOT", intentLabel: "DEVICE_PRINTER", requestKind: "GUIDANCE" },
  { route: "support", serviceGroup: "GIT_PERMISSION", intentLabel: "GIT_HELP", requestKind: "GUIDANCE" },
])("does not let a support route turn a known access request into unrelated guidance: $intentLabel", async routing => {
  const text = "I need read-only access to GitHub repo demo/docs for 4 hours to review synthetic documentation.";
  const { canonical, decision } = await analyze(input(text), [], { run: async () => wire(text, routing) });
  expect(canonical.model.failure).toBe("MODEL_EVIDENCE_INVALID");
  expect(canonical.model.failureReason).toBe("ROUTING_INVALID");
  expect(decision.action).toBe("ESCALATE");
});

it("rejects a missing field from another service instead of asking a printer user about GPUs", async () => {
  const text = "Máy in bị kẹt giấy.";
  const { canonical, decision } = await analyze(input(text), [], { run: async () => ({ ...wire(text), missingFields: ["gpuType"] }) });
  expect(canonical.model.failure).toBe("MODEL_EVIDENCE_INVALID");
  expect(decision.action).toBe("ESCALATE");
  expect(decision.missingFields).not.toContain("gpuType");
});

it("preserves a negative TTL instead of letting a model quote its unsigned substring", async () => {
  const text = "I need read-only access to GitHub repo demo/docs for -4 hours to review synthetic documentation.";
  const { canonical, decision } = await analyze(input(text), [], { run: async () => ({
    ...wire(text, { route: "support", serviceGroup: "GIT_PERMISSION", intentLabel: "GIT_READ_ACCESS", requestKind: "ACCESS_REQUEST" }),
    requestedAction: "read", entityFacts: [{ field: "duration", quote: "4 hours" }],
  }) });
  expect(canonical.riskSignals).toContain("CONFLICT");
  expect(decision.action).toBe("ESCALATE");
});

it("retains the existing numeric TTL while keeping the literal number-word evidence", async () => {
  const text = "I need read-only access to GitHub repo demo/docs for four hours to review synthetic documentation.";
  const { canonical, decision } = await analyze(input(text), [], { run: async () => ({
    ...wire(text, { route: "support", serviceGroup: "GIT_PERMISSION", intentLabel: "GIT_READ_ACCESS", requestKind: "ACCESS_REQUEST" }),
    requestedAction: "read", entityFacts: [{ field: "duration", quote: "four hours" }, { field: "permission", quote: "read-only" }],
  }) });
  expect(canonical.riskSignals).not.toContain("CONFLICT");
  expect(canonical.entities.duration).toBe("4 hours");
  expect(canonical.entities.repository).toBe("demo/docs");
  expect(canonical.entities.reason).toBe("review synthetic documentation");
  expect(canonical.evidence).toContainEqual({ field: "duration", quote: "four hours" });
  expect(canonical.evidence).toContainEqual({ field: "input", quote: text });
  expect(decision.action).not.toBe("AUTO_APPROVE");
});

it("retains the bounded Jira role already derived by the server without fabricating entitlement", async () => {
  const text = "Tôi xin vai trò Developer trong Jira project DEMO để cập nhật ticket được giao trong 4 giờ.";
  const { canonical, decision } = await analyze(input(text), [], { run: async () => ({
    ...wire(text, { route: "support", serviceGroup: "ACCOUNT_ACCESS", intentLabel: "REQUEST_STANDARD_ACCESS", requestKind: "ACCESS_REQUEST" }),
    requestedAction: "access", entityFacts: [{ field: "accessType", quote: "Developer" }, { field: "targetSystem", quote: "Jira" }],
  }) });
  expect(canonical.riskSignals).not.toContain("CONFLICT");
  expect(canonical.entities.accessType).toBe("developer-assigned");
  expect(canonical.entities.resourceScope).toBe("DEMO");
  expect(canonical.entities).not.toHaveProperty("jiraRoleScope");
  expect(canonical.entities).not.toHaveProperty("entitlement");
  expect(canonical.evidence).toContainEqual({ field: "accessType", quote: "Developer" });
  expect(decision.action).not.toBe("AUTO_APPROVE");
});

it("preserves a genuine duration conflict while retaining omitted same-intent facts", async () => {
  const text = "I need read-only access to GitHub repo demo/docs for four hours to review synthetic documentation.";
  const request = { ...input(text), fields: { duration: "8 hours" } };
  const run = vi.fn(async () => wire(text, { route: "support", serviceGroup: "GIT_PERMISSION", intentLabel: "GIT_READ_ACCESS", requestKind: "ACCESS_REQUEST" }));
  const { canonical, decision } = await analyze(request, [], { run });
  expect(canonical.riskSignals).toContain("CONFLICT");
  expect(decision.action).toBe("ESCALATE");
});

it("keeps real field conflicts and risky ambiguity above the new clarification rule", () => {
  const text = "environment=production; grant admin access";
  const canonical = extractIntake({ ...input(text), fields: { environment: "staging" } });
  canonical.ambiguities = ["Không rõ phạm vi."];
  expect(evaluatePolicy(canonical).action).toBe("ESCALATE");
});

it("accepts the current restart intention after clarification without reintroducing a historical reset ambiguity", async () => {
  const initial = "Tôi muốn reset laptop.";
  const initialResult = await analyze(input(initial), [], { run: async () => ({
    sentiment: "neutral", evidence: initial, explanation: "Người gửi nêu yêu cầu hỗ trợ.",
  }) });
  expect(initialResult.decision.action).toBe("NEEDS_INFORMATION");
  const clarification = "Chỉ khởi động lại máy và giữ dữ liệu.";
  const currentText = `${initial}\n${clarification}`;
  const current = await analyze(input(currentText), [], { run: async () => ({
    ...wire(currentText, { route: "support", serviceGroup: "DEVICE_BOOT", intentLabel: "DEVICE_RESTART_GUIDANCE", requestKind: "GUIDANCE" }),
    intentEvidence: clarification, requestedAction: "restart", ambiguities: [],
  }) });
  expect(current.canonical.intentLabel).toBe("DEVICE_RESTART_GUIDANCE");
  expect(current.canonical.ambiguities).toEqual([]);
  expect(current.decision.action).toBe("AUTO_APPROVE");
});


it("constrains semantic actions while retaining literal source wording for safe VPN help", async () => {
  const text = "VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.";
  const reply = { ...wire(text, { route: "support", serviceGroup: "NETWORK_VPN", intentLabel: "VPN_NOT_CONNECTING", requestKind: "SAFE_DIAGNOSTIC" }),
    requestedAction: "diagnose", entityFacts: [{ field: "requestedAction", quote: "Hướng dẫn tôi kiểm tra an toàn" }] };
  const { canonical, decision } = await analyze(input(text), [], { run: async () => reply });
  expect(canonical.model.failure).toBeUndefined();
  expect(canonical.entities.requestedAction).toBe("Hướng dẫn tôi kiểm tra an toàn");
  expect(decision.ruleIds).toContain("GUIDE-003");
  expect(decision.missingFields).toEqual([]);
  const properties = intentResponseSchema.properties as Record<string, { enum?: string[] }>;
  expect(properties.requestedAction.enum).toContain("diagnose");
  expect(properties.requestedAction.enum).not.toContain("safe diagnostic guidance");
});


it("derives the entity value from the exact quote and rejects a redundant model value", () => {
  const base = wire("Máy in bị kẹt giấy");
  expect(decodeIntentOutput({ ...base, entityFacts: [{ field: "symptom", quote: "kẹt giấy" }] }))
    .toMatchObject({ entities: { symptom: "kẹt giấy" }, evidence: expect.arrayContaining([{ field: "symptom", quote: "kẹt giấy" }]) });
  expect(decodeIntentOutput({ ...base, entityFacts: [{ field: "symptom", value: "paper jam", quote: "kẹt giấy" }] }))
    .not.toHaveProperty("entities");
});


it("keeps model-invented conflict out of authority escalation while asking for clarification", async () => {
  const text = "Máy in có vấn đề, chưa rõ lỗi gì.";
  const legacy = decodeIntentOutput(wire(text)) as Record<string, unknown>;
  const { canonical, decision } = await analyze(input(text), [], { run: async () => ({ ...legacy, riskSignals: ["CONFLICT"] }) });
  expect(canonical.riskSignals).not.toContain("CONFLICT");
  expect(decision.action).toBe("NEEDS_INFORMATION");
  expect(decision.ruleIds).toContain("INFO-AMBIGUITY-001");
  const properties = intentResponseSchema.properties as Record<string, { items?: { enum?: string[] } }>;
  expect(properties.riskSignals.items?.enum).not.toContain("CONFLICT");
  expect(properties.riskSignals.items?.enum).not.toContain("MODEL_EVIDENCE_INVALID");
});


it("treats an incident label for the same safe printer diagnostic as a clarification", async () => {
  const text = "Máy in có vấn đề, chưa rõ lỗi gì.";
  const { canonical, decision } = await analyze(input(text), [], { run: async () => ({
    ...wire(text, { route: "support", serviceGroup: "DEVICE_BOOT", intentLabel: "DEVICE_PRINTER", requestKind: "INCIDENT" }),
    requestedAction: "diagnose", missingFields: ["symptom"],
  }) });
  expect(canonical.riskSignals).not.toContain("CONFLICT");
  expect(decision.action).toBe("NEEDS_INFORMATION");
});

it.each(["MODEL_OUTPUT_INVALID", "MODEL_EVIDENCE_INVALID"])("discards invalid optional prose and returns only vetted guidance: %s", async code => {
  const { ModelFailure } = await import("@/lib/support-model");
  const text = "VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.";
  // The initial bounded question now needs no paraphrase; verify invalid prose
  // on the retained enrichment path for a later troubleshooting round.
  const result = await completeAnalysis(input(text), [], { assistanceRound: 1, run: async call => {
    if (call.purpose === "assistance") throw new ModelFailure(code as "MODEL_OUTPUT_INVALID" | "MODEL_EVIDENCE_INVALID");
    return wire(text, { route: "support", serviceGroup: "NETWORK_VPN", intentLabel: "VPN_NOT_CONNECTING", requestKind: "SAFE_DIAGNOSTIC" });
  } });
  expect(result.canonical.model.failure).toBeUndefined();
  expect(result.decision.action).toBe("AUTO_APPROVE");
  expect(result.assistance?.source).toBe("deterministic");
  expect(result.assistance?.fallbackReason).toBe(code);
  expect(result.assistance?.stepByStepInstructions.length).toBeGreaterThan(1);
});

it.each([
  "Giải thích chi tiết cách kiểm tra.",
  "Giải thích từng bước.",
  "Hãy giải thích từng bước.",
])("keeps a bounded request for detail with its VPN issue and retains prose generation: %s", async followup => {
  vi.stubEnv("AI_PROVIDER", "mock");
  const text = `VPN không kết nối. ${followup}`;
  const baseline = extractIntake(input(text));
  expect(baseline.subrequests).toEqual([]);
  expect(baseline.evidence).toContainEqual({ field: "input", quote: text });
  expect(evaluatePolicy(baseline)).toMatchObject({ action: "AUTO_APPROVE", ruleIds: ["GUIDE-003"] });
  const run = vi.fn(async (call: ModelCall) => {
    if (call.purpose === "extraction") return wire(text, {
      route: "support", serviceGroup: "NETWORK_VPN", intentLabel: "VPN_NOT_CONNECTING", requestKind: "SAFE_DIAGNOSTIC",
    });
    expect(call.purpose).toBe("assistance");
    return {
      summary: "Các bước kiểm tra giúp mô tả rõ hơn tình trạng VPN chưa kết nối.",
      stepIndexes: [0, 1],
      stepExplanations: ["Bước này phân biệt kết nối mạng với lỗi riêng của VPN.", "Thông báo của ứng dụng giúp nhân viên hiểu tình trạng kết nối."],
      expectedResult: "Thông tin lỗi cụ thể giúp xác định bước hỗ trợ tiếp theo.",
      nextQuestion: "Ứng dụng VPN hiện thông báo lỗi nào?",
      evidenceQuote: "VPN không kết nối",
    };
  });
  const result = await completeAnalysis(input(text), [], { run });
  expect(run.mock.calls.map(([call]) => call.purpose)).toEqual(["extraction", "assistance"]);
  expect(result.decision.action).toBe("AUTO_APPROVE");
  expect(result.canonical.subrequests).toEqual([]);
  expect(result.assistance?.source).toBe("mock");
  expect(result.assistance?.fallbackReason).toBeUndefined();
  expect(result.assistance?.generationReason).not.toBe("REVIEWED_TEMPLATE_SUFFICIENT");
});

it.each([
  "Giải thích từng bước mở port 3389 ra Internet.",
  "Giải thích chi tiết cách kiểm tra rồi cấp quyền admin production.",
  "Giải thích từng bước và tắt firewall giúp tôi.",
])("does not merge or discard an operation appended to a detail request: %s", followup => {
  const text = `VPN không kết nối. ${followup}`;
  const canonical = extractIntake(input(text));
  expect(canonical.subrequests.length).toBeGreaterThan(1);
  expect(canonical.evidence).toContainEqual({ field: "input", quote: text });
  expect(canonical.riskSignals.length).toBeGreaterThan(0);
  expect(evaluatePolicy(canonical).action).toBe("ESCALATE");
});
