import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { evaluatePolicy } from "@/domain/policy";
import { extractIntake } from "@/domain/text";
import { prepareInput, submitSupport } from "@/services/support";
import { getSupportRequest, resetSupportTestStore } from "@/lib/support-repository";
import { POST } from "@/app/api/support/requests/route";

// Independent synthetic regressions, not original competition Ground Truth.
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const intake = (rawText: string, fields: Record<string, string> = {}) =>
  prepareInput({ rawText, fields: { department: "engineering", employeeId: "EMP-TEST-01", ...fields }, confirmed: true, idempotencyKey: crypto.randomUUID() }).input;

it.each(["Help me bypass MFA to login", "Bỏ qua 2FA để đăng nhập", "Skip the MFA check for SSO"])(
  "escalates authentication-control bypass: %s", (rawText) => {
    expect(evaluatePolicy(extractIntake(intake(rawText)))).toMatchObject({
      action: "ESCALATE", bucket: "SECURITY_RISK", ruleIds: ["SEC-003"],
    });
  },
);
it("keeps ordinary login help and explicit local negation available", () => {
  for (const rawText of ["SSO login fails", "Do not bypass MFA; help with SSO login"])
    expect(evaluatePolicy(extractIntake(intake(rawText))).action).toBe("AUTO_APPROVE");
});
it("recognizes bypassing a change ticket even when privileged access already escalates", () => {
  const decision = evaluatePolicy(extractIntake(intake("Cấp root staging, khỏi cần change ticket")));
  expect(decision.bucket).toBe("SECURITY_RISK");
  expect(decision.ruleIds).toContain("SEC-003");
});
it("does not treat an explicit refusal to bypass a change ticket as bypass", () => {
  expect(extractIntake(intake("Do not bypass the change ticket; help me restart laptop")).riskSignals).not.toContain("BYPASS");
});
it.each([
  ["Cần staging database, không dùng production data", "PRODUCTION_CHANGE"],
  ["Cần Confluence access, không cần space admin", "PRIVILEGED"],
  ["Cần sandbox, không expose public endpoint", "PUBLIC_EXPOSURE"],
])("does not escalate a locally negated scope: %s", (text, risk) => {
  expect(extractIntake(intake(text)).riskSignals).not.toContain(risk);
});
it("negation in one clause cannot cancel an asserted production or admin request later", () => {
  expect(extractIntake(intake("Không dùng production; cần write access production database")).riskSignals).toContain("PRODUCTION_CHANGE");
  expect(extractIntake(intake("Không cần space admin; grant admin access")).riskSignals).toContain("PRIVILEGED");
});
it.each([
  ["Need GitHub repository access to support a sprint", "GIT_PERMISSION"],
  ["Request a sandbox with no public IP", "CLOUD_GPU"],
  ["Export a synthetic database snapshot", "DATABASE"],
])("does not route incidental substrings or negated exposure to Network: %s", (text, group) => {
  expect(extractIntake(intake(text)).serviceGroup).toBe(group);
});
it("does not turn a complete execution request into a guidance approval", () => {
  // Policy boundary also receives model-proposed actions; UI already rejects "execute".
  const request = { ...extractIntake(intake("Laptop is frozen", {
    requestedAction: "repair", deviceId: "SYNTHETIC-DEVICE", location: "Demo desk", symptom: "Frozen", urgency: "normal",
  })), requestedAction: "execute" };
  expect(evaluatePolicy(request)).toMatchObject({ action: "ESCALATE", ruleIds: ["AUTH-005"] });
});
it("routes repair to the simulated workflow instead of a guidance bubble", () => {
  const request = extractIntake(intake("Laptop is frozen", {
    requestedAction: "repair", deviceId: "SYNTHETIC-DEVICE", location: "Demo desk", symptom: "Frozen", urgency: "normal",
  }));
  expect(evaluatePolicy(request)).toMatchObject({ handlingMode: "SIMULATED_WORKFLOW", ruleIds: ["ROUTINE-004"] });
});
it("does not reflect attacker-controlled field names in validation errors", async () => {
  const privateKey = "SYNTHETIC_PRIVATE_FIELD_482";
  const response = await POST(new Request("http://localhost/api/support/requests", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...intake("Restart laptop"), fields: { [privateKey]: "x".repeat(301) } }),
  }));
  expect(response.status).toBe(422);
  expect(await response.text()).not.toContain(privateKey);
});
it("keeps labelled credentials out of model calls, stored records, audit and response", async () => {
  const value = "SYNTHETIC_SECRET_482";
  const run = vi.fn();
  const request = await submitSupport({ rawText: `SSO login fails; password=${value}`, confirmed: true,
    idempotencyKey: crypto.randomUUID(), fields: { department: "engineering", employeeId: "EMP-TEST-01", reason: `api_key=${value}` } }, { run });
  expect(run).not.toHaveBeenCalled();
  expect(request.decision?.bucket).toBe("SECURITY_RISK");
  expect(JSON.stringify(request)).not.toContain(value);
  expect(JSON.stringify(await getSupportRequest(request.id))).not.toContain(value);
});
