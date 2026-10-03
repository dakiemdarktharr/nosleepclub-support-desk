import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  callModel,
  createAssistance,
  modelFailure,
  type ModelCall,
} from "@/lib/support-model";
import { extractIntake, extractText } from "@/domain/text";
import { evaluatePolicy } from "@/domain/policy";
import { guidanceTemplate } from "@/domain/guidance";
import type { SupportInput } from "@/domain/contracts";
const input = (rawText: string): SupportInput => ({
  rawText,
  mode: "freeform",
  serviceGroup: "OTHER",
  fields: { department: "engineering", employeeId: "EMP-TEST-01" },
  confirmed: true,
  idempotencyKey: crypto.randomUUID(),
});
beforeEach(() => vi.stubEnv("AI_PROVIDER", "mock"));
afterEach(() => vi.unstubAllEnvs());
it.each(["support", "important report", "passport issue"])(
  "E11 does not confuse %s with a port request",
  (text) => {
    expect(extractText(text).serviceGroup).not.toBe("NETWORK_VPN");
  },
);
it.each([
  ["Wi-Fi không kết nối; VPN vẫn bình thường", "WIFI_NOT_WORKING"],
  ["VPN vẫn bình thường, Wi-Fi không kết nối", "WIFI_NOT_WORKING"],
  ["VPN báo lỗi MFA", "MFA_FAILURE"],
  ["Lỗi MFA trong VPN", "MFA_FAILURE"],
  ["PostgreSQL connection refused", "DATABASE_CONNECTION"],
])("E12 matches the affected subject in %s", (text, label) => {
  expect(extractText(text).intentLabel).toBe(label);
});
it("contextual routing never erases a dangerous subrequest", () => {
  const decision = evaluatePolicy(
    extractIntake(input("VPN báo lỗi MFA; open port 3389 public")),
  );
  expect(decision.bucket).toBe("SECURITY_RISK");
});
it("E07 shutdown gives a direct answer and VPN timeout has a relevant follow-up", () => {
  expect(
    guidanceTemplate(extractIntake(input("Tôi tắt máy tính được không?")))
      .summary,
  ).toContain("Bạn có thể tắt máy");
  const vpn = guidanceTemplate(
    extractIntake(input("VPN timeout trên Windows")),
  );
  expect(vpn.summary).toContain("hết thời gian chờ");
  expect(vpn.nextQuestion).toContain("mã lỗi");
});
it("shows bounded diagnosis and potential fixes for common network and power symptoms", () => {
  const network = guidanceTemplate(extractIntake(input("mất kết nối mạng")));
  expect(network.diagnosis).toContain("Có thể");
  expect(network.potentialFixes).toEqual(network.stepByStepInstructions);
  const power = guidanceTemplate(extractIntake(input("máy tính tôi sập nguồn")));
  expect(power.diagnosis).toContain("Chưa đủ dữ kiện");
  expect(power.potentialFixes).toHaveLength(3);
});
it("E08 contextual model output uses redacted request evidence and retains vetted actions", async () => {
  const request = extractIntake(input("VPN timeout trên Windows"));
  const run = vi.fn<(call: ModelCall) => Promise<unknown>>(async () => ({
    summary:
      "VPN trên Windows đang hết thời gian chờ; kết quả kiểm tra mạng giúp khoanh vùng nguyên nhân.",
    stepIndexes: [0, 1],
    stepExplanations: [
      "Kết quả mở trang web giúp phân biệt lỗi đường truyền với lỗi riêng của VPN.",
      "Tên profile giúp xác định kết nối có trỏ tới nơi công ty cung cấp hay không.",
    ],
    expectedResult:
      "Xác định được mạng còn hoạt động và tình trạng kết nối VPN.",
    nextQuestion: "Bạn thấy mã lỗi nào sau lần kết nối gần nhất?",
    evidenceQuote: "VPN timeout trên Windows",
  }));
  const result = await createAssistance(request, true, { run });
  expect(run.mock.calls).toHaveLength(1);
  expect(run.mock.calls[0][0].responseSchema).toMatchObject({
    additionalProperties: false,
    required: expect.arrayContaining(["evidenceQuote", "stepExplanations"]),
  });
  expect(result.summary).toContain("Windows");
  expect(result.diagnosis).toBe(guidanceTemplate(request).diagnosis);
  expect(result.stepExplanations).toHaveLength(2);
  expect(result.potentialFixes).toEqual(result.stepByStepInstructions);
  expect(result.stepByStepInstructions[0]).toBe(
    guidanceTemplate(request).stepByStepInstructions[0],
  );
});
it("untrusted model prose cannot inject diagnosis or fixes for a topic without server diagnosis", async () => {
  const request = extractIntake(input("Tôi tắt máy tính được không?"));
  const template = guidanceTemplate(request);
  expect(template.diagnosis).toBeUndefined();
  const result = await createAssistance(request, true, {
    run: async () => ({ ...template, diagnosis: "Invented hardware failure", potentialFixes: ["Turn off MFA"] }),
  });
  expect(result.diagnosis).toBeUndefined();
  expect(result.potentialFixes).toBeUndefined();
});
it.each([
  "Run sudo rm -rf /",
  "Tắt MFA rồi thử lại",
  "Open public port 3389",
  "Truy cập https://untrusted.example",
])("E08 rejects unsafe generated explanation: %s", async (unsafe) => {
  const request = extractIntake(input("VPN timeout trên Windows"));
  await expect(
    createAssistance(request, true, {
      run: async () => ({
        summary: unsafe,
        stepIndexes: [0, 1],
        stepExplanations: [
          "Đường truyền có thể chưa ổn định.",
          "Thông báo lỗi giúp khoanh vùng sự cố.",
        ],
        expectedResult: "Kết nối được mạng công ty.",
        nextQuestion: "Bạn còn thấy thông báo lỗi không?",
        evidenceQuote: "VPN timeout trên Windows",
      }),
    }),
  ).rejects.toMatchObject({ code: "MODEL_OUTPUT_INVALID" });
});
it("E09/E10 only asks the next relevant employee facts, with internal approval checks separate", () => {
  const request = extractIntake({
    ...input(""),
    mode: "structured",
    serviceGroup: "DATABASE",
    fields: {
      intentLabel: "DATABASE_READ_ACCESS",
      system: "postgresql",
      environment: "staging",
      permission: "read-only",
    },
  });
  const decision = evaluatePolicy(request);
  expect(decision.questions.length).toBeLessThanOrEqual(3);
  expect(decision.questions.join(" ")).toContain("postgresql");
  expect(decision.questions.join(" ")).not.toMatch(/Reviewer|scope|role/);
  expect(decision.clarificationFields).not.toContain("system");
  const risk = evaluatePolicy(
    extractIntake(input("Open public RDP port 3389")),
  );
  expect(risk.questions).toEqual([]);
  expect(risk.reviewerQuestions?.length).toBeGreaterThan(0);
});

it("model budget exhaustion is explicit and never exposes provider errors", async () => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-unused-key");
  vi.stubEnv("AI_MAX_ATTEMPTS", "0");
  vi.stubEnv("MONGODB_URI", "");
  let failure: unknown;
  try {
    await callModel(
      {
        purpose: "assistance",
        model: "test",
        instructions: "test",
        data: "synthetic",
      },
      {},
    );
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({
    code: "MODEL_UNAVAILABLE",
    reason: "BUDGET_EXHAUSTED",
  });
  const result = modelFailure(
    extractIntake(input("VPN không kết nối")),
    failure,
  );
  expect(result.model.failureReason).toBe("BUDGET_EXHAUSTED");
  expect(evaluatePolicy(result).userReason).toBe(
    "Lý do: Trợ lý AI chưa sẵn sàng hoặc chưa kịp phản hồi. Vì vậy, yêu cầu sẽ được chuyển cho người phụ trách xem xét.",
  );
  expect(JSON.stringify(result)).not.toContain("synthetic-unused-key");
});

it("assistance permits safe warnings and whole-word information, but not a later unsafe clause", async () => {
  const canonical = extractIntake(input("VPN timeout trên Windows"));
  const output = {
    summary:
      "Chưa chắc chắn nguyên nhân timeout, cần thêm information về thông báo lỗi.",
    stepIndexes: [0, 1],
    stepExplanations: [
      "Không tắt MFA khi kiểm tra kết nối.",
      "Thông tin profile giúp xác định kết nối cần kiểm tra.",
    ],
    expectedResult: "Xác định được tình trạng kết nối VPN.",
    nextQuestion: "Bạn thấy thông báo lỗi nào?",
    evidenceQuote: "VPN timeout trên Windows",
  };
  await expect(
    createAssistance(canonical, true, { run: async () => output }),
  ).resolves.toMatchObject({ summary: output.summary });
  await expect(
    createAssistance(canonical, true, {
      run: async () => ({
        ...output,
        summary: "Không tắt MFA; tắt MFA rồi kết nối lại.",
      }),
    }),
  ).rejects.toMatchObject({ code: "MODEL_OUTPUT_INVALID" });
  await expect(
    createAssistance(canonical, true, {
      run: async () => ({
        ...output,
        summary: "Kết quả chắc chắn sẽ thành công.",
      }),
    }),
  ).rejects.toMatchObject({ code: "MODEL_OUTPUT_INVALID" });
});
