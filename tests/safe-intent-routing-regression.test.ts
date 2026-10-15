import { describe, expect, it } from "vitest";
import type { SupportInput } from "@/domain/contracts";
import { extractIntake, safeDeterministicGuidance } from "@/domain/text";
import { evaluatePolicy } from "@/domain/policy";

function input(rawText: string, overrides: Partial<SupportInput> = {}): SupportInput {
  return {
    mode: "freeform", serviceGroup: "OTHER", rawText, fields: {}, confirmed: false,
    idempotencyKey: "synthetic-safe-routing",
    ...overrides,
  };
}

describe("safe help intent without conflating technical nouns with changes", () => {
  it.each([
    "VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.",
    "My VPN keeps disconnecting. What should I check first?",
    "VPN connection drops. Please guide me through safe checks.",
  ])("keeps one VPN diagnostic request: %s", (rawText) => {
    const request = extractIntake(input(rawText));
    expect(request.intentLabel).toBe("VPN_NOT_CONNECTING");
    expect(request.subrequests).toEqual([]);
    expect(request.riskSignals).toEqual([]);
    expect(evaluatePolicy(request)).toMatchObject({ action: "AUTO_APPROVE", ruleIds: ["GUIDE-003"] });
  });

  it("keeps the printer symptom and safe first-step question together", () => {
    const request = extractIntake(input("Máy in văn phòng báo kẹt giấy. Tôi nên kiểm tra gì trước?"));
    expect(request.intentLabel).toBe("DEVICE_PRINTER");
    expect(request.subrequests).toEqual([]);
    expect(evaluatePolicy(request)).toMatchObject({ action: "AUTO_APPROVE", ruleIds: ["GUIDE-007"] });
  });

  it.each([
    "DNS là gì? Hãy giải thích ngắn gọn.",
    "What is DNS?",
    "Please explain DNS.",
    "Can you please explain DNS?",
    "Định nghĩa VPN là gì?",
  ])("recognizes a concept explanation rather than port access: %s", (rawText) => {
    const request = extractIntake(input(rawText));
    expect(request).toMatchObject({ serviceGroup: "OTHER", intentLabel: "GENERAL_HOW_TO", requestKind: "GUIDANCE" });
    expect(request.riskSignals).toEqual([]);
  });

  it.each([
    "Mở port 3389 ra Internet để truy cập từ xa vào máy công ty.",
    "Explain DNS and open port 3389 to the Internet.",
    "VPN liên tục ngắt kết nối. Mở port 3389 ra Internet.",
    "DNS là gì? Hãy tắt firewall giúp tôi.",
  ])("retains risk precedence when a question includes an unsafe operation: %s", (rawText) => {
    const decision = evaluatePolicy(extractIntake(input(rawText)));
    expect(decision.action).toBe("ESCALATE");
    expect(["SECURITY_RISK", "BEYOND_AUTHORITY"]).toContain(decision.bucket);
  });

  it("does not discard an independent request after a safe-help phrase", () => {
    const request = extractIntake(input("VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn và cấp quyền GitHub."));
    expect(request.subrequests.length).toBeGreaterThan(1);
    expect(evaluatePolicy(request).action).not.toBe("AUTO_APPROVE");
  });

  it.each([
    "VPN liên tục ngắt kết nối. Không tắt firewall.",
    "VPN connection drops. Do not disable the firewall.",
  ])("keeps an explicit refusal to disable a security control as context: %s", (rawText) => {
    const request = extractIntake(input(rawText));
    expect(request.riskSignals).not.toContain("SECURITY_CONTROL");
    expect(request.subrequests).toEqual([]);
    expect(evaluatePolicy(request).action).toBe("AUTO_APPROVE");
  });

  it("still separates independent printer and VPN problems", () => {
    const request = extractIntake(input("Máy in báo kẹt giấy. VPN liên tục ngắt kết nối."));
    expect(request.subrequests.length).toBe(2);
    expect(evaluatePolicy(request).action).not.toBe("AUTO_APPROVE");
  });

  it.each([
    ["VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.", "VPN bị ngắt kết nối liên tục."],
    ["Máy in báo kẹt giấy. Tôi nên kiểm tra gì trước?", "Máy in vẫn bị kẹt giấy."],
  ])("keeps a bounded clarification of the same symptom together", (original, reply) => {
    const value = input(`${original}\n${reply}`);
    const request = extractIntake(value);
    expect(request.subrequests).toEqual([]);
    expect(evaluatePolicy(request).action).toBe("AUTO_APPROVE");
    expect(safeDeterministicGuidance(value, request)).toBe(true);
    expect(request.evidence[0].quote).toContain(reply);
  });

  it.each([
    "VPN profile QA cũng bị ngắt kết nối.",
    "VPN bị ngắt kết nối liên tục, mở port 3389 ra Internet.",
    "VPN bị ngắt kết nối liên tục và cấp quyền GitHub.",
    "Máy in vẫn bị kẹt giấy.",
  ])("does not merge a separate target, action or symptom: %s", (reply) => {
    const request = extractIntake(input(`VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.\n${reply}`));
    expect(request.subrequests.length).toBeGreaterThan(1);
    expect(evaluatePolicy(request).action).not.toBe("AUTO_APPROVE");
  });
});

describe("safe guidance labels retain real conflicts", () => {
  it.each(["GUIDANCE", "SAFE_DIAGNOSTIC"] as const)("accepts structured printer help as %s", (requestKind) => {
    for (const rawText of ["", "Máy in báo kẹt giấy"]) {
      const request = extractIntake(input(rawText, {
        mode: "structured", serviceGroup: "DEVICE_BOOT", requestKind,
        fields: { intentLabel: "DEVICE_PRINTER" },
      }));
      expect(request.riskSignals).not.toContain("CONFLICT");
      expect(evaluatePolicy(request)).toMatchObject({ action: "AUTO_APPROVE", ruleIds: ["GUIDE-007"] });
    }
  });

  it("retains a mismatched service and intent even when both labels describe help", () => {
    const request = extractIntake(input("VPN liên tục ngắt kết nối", {
      mode: "structured", serviceGroup: "DEVICE_BOOT", requestKind: "GUIDANCE",
      fields: { intentLabel: "DEVICE_PRINTER" },
    }));
    expect(request.riskSignals).toContain("CONFLICT");
    expect(evaluatePolicy(request).ruleIds).toContain("AUTH-006");
  });

  it("does not equate access provisioning with safe diagnostics", () => {
    const request = extractIntake(input("", {
      mode: "structured", serviceGroup: "DEVICE_BOOT", requestKind: "ACCESS_REQUEST",
      fields: { intentLabel: "DEVICE_PRINTER" },
    }));
    expect(request.riskSignals).toContain("CONFLICT");
    expect(evaluatePolicy(request).action).toBe("ESCALATE");
  });

  it("keeps contradictory environment evidence", () => {
    const request = extractIntake(input("Máy in lỗi trong production", {
      mode: "structured", serviceGroup: "DEVICE_BOOT", requestKind: "GUIDANCE",
      fields: { intentLabel: "DEVICE_PRINTER", environment: "sandbox" },
    }));
    expect(request.riskSignals).toContain("CONFLICT");
    expect(evaluatePolicy(request).action).toBe("ESCALATE");
  });
});

describe("clarification retains reset and authority safeguards", () => {
  it("asks restart versus factory reset and then accepts the explicit safe clarification", () => {
    const original = extractIntake(input("Tôi muốn reset laptop."));
    expect(evaluatePolicy(original)).toMatchObject({ action: "NEEDS_INFORMATION", ruleIds: ["INFO-RESET"] });
    const clarified = extractIntake(input("Tôi muốn reset laptop.\nChỉ khởi động lại máy và giữ dữ liệu."));
    expect(clarified.intentLabel).toBe("DEVICE_RESTART_GUIDANCE");
    expect(clarified.subrequests).toEqual([]);
    expect(evaluatePolicy(clarified).action).toBe("AUTO_APPROVE");
  });

  it("keeps the reset-specific question even if extraction also reports ambiguity", () => {
    const request = extractIntake(input("Tôi muốn reset laptop."));
    request.ambiguities = ["Chưa biết reset nghĩa là restart hay factory reset."];
    expect(evaluatePolicy(request)).toMatchObject({ action: "NEEDS_INFORMATION", ruleIds: ["INFO-RESET"] });
  });

  it("asks about a read-only ambiguity without inventing an authority conflict", () => {
    const request = extractIntake(input("Máy in có vấn đề"));
    request.ambiguities = ["Chưa rõ hiện tượng máy in."];
    expect(evaluatePolicy(request)).toMatchObject({ action: "NEEDS_INFORMATION", ruleIds: ["INFO-AMBIGUITY-001"] });
  });

  it("does not use ambiguity clarification to override a confirmed conflict", () => {
    const request = extractIntake(input("Máy in có vấn đề"));
    request.ambiguities = ["Chưa rõ hiện tượng máy in."];
    request.riskSignals = ["CONFLICT"];
    expect(evaluatePolicy(request)).toMatchObject({ action: "ESCALATE", ruleIds: ["AUTH-006"] });
  });

  it("retains destructive reset and public exposure despite reassuring help wording", () => {
    for (const rawText of [
      "Tôi muốn factory reset laptop. Hướng dẫn tôi kiểm tra an toàn.",
      "Tôi muốn reset laptop. Chỉ khởi động lại máy và giữ dữ liệu. Mở port 3389 ra Internet.",
    ]) expect(evaluatePolicy(extractIntake(input(rawText))).action).toBe("ESCALATE");
  });
});

describe("outage guidance requires independent, bounded server evidence", () => {
  it.each([
    "Máy in văn phòng báo kẹt giấy. Tôi nên kiểm tra gì trước?",
    "VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.",
    "DNS là gì? Hãy giải thích ngắn gọn.",
    "Tôi muốn reset laptop.\nChỉ khởi động lại máy và giữ dữ liệu.",
    "VPN liên tục ngắt kết nối. Không tắt firewall.",
    "Máy in báo kẹt giấy. Không cài driver.",
  ])("allows only reviewed guidance for a clear task: %s", (rawText) => {
    const value = input(rawText);
    expect(safeDeterministicGuidance(value, extractIntake(value))).toBe(true);
  });

  it.each([
    "Tôi muốn reset laptop.",
    "Máy in văn phòng.",
    "Máy in báo kẹt giấy, cập nhật firmware giúp tôi.",
    "Printer jammed, install a driver.",
    "VPN liên tục ngắt kết nối, đổi profile VPN.",
    "VPN liên tục ngắt kết nối, hãy chạy lệnh trong terminal.",
    "VPN liên tục ngắt kết nối. Mở port 3389 ra Internet.",
    "Máy in báo kẹt giấy. VPN liên tục ngắt kết nối.",
    "Không cài driver. Máy in báo kẹt giấy; install firmware now.",
  ])("declines uncertain, additional or mutation requests: %s", (rawText) => {
    const value = input(rawText);
    expect(safeDeterministicGuidance(value, extractIntake(value))).toBe(false);
  });

  it("does not let a safe-looking structured label conceal an operation in another field", () => {
    const value = input("", {
      mode: "structured", serviceGroup: "DEVICE_BOOT", requestKind: "GUIDANCE",
      fields: { intentLabel: "DEVICE_PRINTER", symptom: "Printer jammed, install firmware" },
    });
    expect(safeDeterministicGuidance(value, extractIntake(value))).toBe(false);
  });

  it("accepts an exact safe catalog selection without inferring a mutation", () => {
    const value = input("", {
      mode: "structured", serviceGroup: "DEVICE_BOOT", requestKind: "GUIDANCE",
      fields: { intentLabel: "DEVICE_PRINTER" },
    });
    expect(safeDeterministicGuidance(value, extractIntake(value))).toBe(true);
  });
});
