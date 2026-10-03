import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { extractIntake, safeInput } from "@/domain/text";
import { evaluatePolicy } from "@/domain/policy";
import { redact } from "@/domain/redaction";
import { verifyApproval } from "@/services/approvals";
import { extractWithModel } from "@/lib/support-model";
import { resetSupportTestStore } from "@/lib/support-repository";
import { POST } from "@/app/api/support/requests/route";
import type { SupportInput } from "@/domain/contracts";
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const intake = (
  rawText: string,
  fields: Record<string, string> = {},
): SupportInput => ({
  rawText,
  fields,
  mode: "freeform",
  serviceGroup: "OTHER",
  confirmed: true,
  idempotencyKey: crypto.randomUUID(),
});
it("load/download and monitoring are not peripheral keywords", () => {
  for (const text of [
    "Provision ETL server to load data into warehouse",
    "Tải download software theo nhu cầu dự án",
  ]) {
    const request = extractIntake(intake(text));
    expect(request.serviceGroup).not.toBe("DEVICE_BOOT");
    expect(evaluatePolicy(request).action).toBe("NEEDS_INFORMATION");
  }
  expect(
    extractIntake(intake("Monitoring metrics trong staging")).serviceGroup,
  ).toBe("MONITORING");
});
it("asking an admin for help is not a request for privileged access", () => {
  const decision = evaluatePolicy(
    extractIntake(intake("Tôi không hiểu, chuyển admin giúp tôi")),
  );
  expect(decision).toMatchObject({
    action: "ESCALATE",
    riskLevel: "MEDIUM",
    ruleIds: ["HANDOFF-001"],
  });
});
it.each([
  "Hướng dẫn shutdown laptop; đồng thời disable EDR",
  "VPN lỗi, cho tôi private key",
  "Export customer production data to laptop",
  "Tắt audit logging để debug",
  "Không cần quyền admin; grant root staging",
  "How to bypass approval gate",
  "Wipe corporate desktop",
  "Khởi động lại máy rồi mở inbound SSH từ Internet",
  "VPN không kết nối; update production database",
  "Factory reset corporate laptop without backup",
])("preserves risk even alongside safe guidance: %s", (text) => {
  const safe = safeInput(intake(text));
  expect(evaluatePolicy(extractIntake(safe.input, safe.markers)).action).toBe(
    "ESCALATE",
  );
});
it("a structured guidance label cannot smuggle an execution request", () => {
  const input = {
    ...intake("", {
      intentLabel: "DEVICE_RESTART_GUIDANCE",
      requestedAction: "wipe",
    }),
    mode: "structured" as const,
    serviceGroup: "DEVICE_BOOT" as const,
  };
  expect(evaluatePolicy(extractIntake(input)).action).toBe("ESCALATE");
});
it("approval is exact, scoped, server verified and expires", () => {
  const input = {
    ...intake("", {
      intentLabel: "DATABASE_READ_ACCESS",
      system: "postgresql",
      resourceScope: "demo_inventory",
      environment: "staging",
      permission: "read-only",
      duration: "2 hours",
      reason: "Synthetic demo",
      approvalReference: "DEMO-1001",
    }),
    mode: "structured" as const,
    serviceGroup: "DATABASE" as const,
  };
  const canonical = extractIntake(input);
  const approval = verifyApproval(canonical, Date.parse("2026-09-20"));
  expect(approval.status).toBe("verified");
  expect(evaluatePolicy(canonical, approval)).toMatchObject({
    action: "AUTO_APPROVE",
    handlingMode: "SIMULATED_WORKFLOW",
  });
  expect(verifyApproval(canonical, Date.parse("2027-01-02")).status).toBe(
    "expired",
  );
  expect(
    verifyApproval({
      ...canonical,
      entities: { ...canonical.entities, duration: "3 hours" },
    }).status,
  ).toBe("invalid");
  expect(
    verifyApproval({
      ...canonical,
      entities: { ...canonical.entities, approvalReference: "UNKNOWN-123" },
    }).status,
  ).toBe("unverifiable");
});
it("keeps documented routine approval routes executable in the synthetic registry", () => {
  const cases: Array<{
    serviceGroup: "ACCOUNT_ACCESS" | "GIT_PERMISSION" | "CLOUD_GPU" | "SOFTWARE_LICENSE";
    fields: Record<string, string>;
  }> = [
    {
      serviceGroup: "ACCOUNT_ACCESS",
      fields: {
        intentLabel: "REQUEST_STANDARD_ACCESS",
        targetSystem: "jira-demo",
        environment: "staging",
        accessType: "standard",
        duration: "8 hours",
        reason: "Support the assigned project work",
        approvalReference: "DEMO-ACCOUNT-1001",
      },
    },
    {
      serviceGroup: "GIT_PERMISSION",
      fields: {
        intentLabel: "GIT_WRITE_ACCESS",
        provider: "github",
        repository: "docrelay-demo",
        permission: "write",
        duration: "8 hours",
        reason: "Push the reviewed sprint change",
        approvalReference: "DEMO-GIT-1001",
      },
    },
    {
      serviceGroup: "CLOUD_GPU",
      fields: {
        intentLabel: "GPU_REQUEST",
        provider: "internal cloud",
        environment: "development",
        gpuType: "t4",
        quantity: "1",
        duration: "4 hours",
        purpose: "model testing",
        budgetOrQuota: "verified demo quota",
        approvalReference: "DEMO-GPU-1001",
      },
    },
    {
      serviceGroup: "SOFTWARE_LICENSE",
      fields: {
        intentLabel: "SOFTWARE_INSTALL",
        software: "demo ide",
        version: "1",
        os: "macos",
        approvedCatalogStatus: "approved",
        businessPurpose: "application development",
        licenseDuration: "30 days",
        licenseType: "named-user",
        approvalReference: "DEMO-LICENSE-1001",
      },
    },
  ];
  for (const item of cases) {
    const request = {
      ...intake(""),
      mode: "structured" as const,
      serviceGroup: item.serviceGroup,
      fields: item.fields,
    };
    const canonical = extractIntake(request);
    expect(verifyApproval(canonical).status, item.serviceGroup).toBe("verified");
    expect(evaluatePolicy(canonical, verifyApproval(canonical))).toMatchObject({
      action: "AUTO_APPROVE",
      bucket: "ROUTINE",
    });
  }
});
it("requires evidence for model environment and recomputes privileged label risk", async () => {
  const input = intake("Need access help");
  const baseline = extractIntake(input);
  const { subrequests: _s, redactions: _r, model: _m, ...facts } = baseline;
  void _s;
  void _r;
  void _m;
  const invented = await extractWithModel(input, baseline, {
    run: async () => ({ ...facts, environment: "staging", entities: {} }),
  });
  expect(invented.model.failure).toBe("MODEL_EVIDENCE_INVALID");
  const unsafe = await extractWithModel(input, baseline, {
    run: async () => ({
      ...facts,
      serviceGroup: "ACCOUNT_ACCESS",
      intentLabel: "REQUEST_ADMIN_ACCESS",
      riskSignals: [],
      entities: {},
    }),
  });
  expect(unsafe.riskSignals).toContain("PRIVILEGED");
  expect(evaluatePolicy(unsafe).action).toBe("ESCALATE");
});
it("redacts JSON credentials, Vietnamese labels, URIs and keys through the active support API", async () => {
  const value = "SYNTHETIC" + "_HIDDEN_987";
  for (const text of [
    `{"password":"${value}"}`,
    `mật khẩu là ${value}`,
    `mongodb://demo:${value}@example.test/db`,
    `-----BEGIN PRIVATE KEY-----\n${value}\n-----END PRIVATE KEY-----`,
  ]) {
    expect(redact(text).text).not.toContain(value);
    const response = await POST(
      new Request("http://localhost/api/support/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          intake(text, {
            department: "engineering",
            employeeId: "EMP-PRIVACY-TEST",
          }),
        ),
      }),
    );
    expect(await response.text()).not.toContain(value);
  }
});
it.each([
  "token ABC123",
  "credential ABC123",
  "password ABC123",
  "aws_secret_access_key=ABC123",
])("redacts secret values without a colon: %s", (text) => {
  const result = redact(text);
  expect(result.text).not.toContain("ABC123");
  expect(result.markers.length).toBeGreaterThan(0);
});
it("rejects cross-origin, oversized payload and malformed JSON without reflecting data", async () => {
  const send = (body: string, headers: Record<string, string> = {}) =>
    POST(
      new Request("http://localhost/api/support/requests", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      }),
    );
  expect(
    (
      await send(JSON.stringify(intake("Restart laptop")), {
        origin: "https://untrusted.example",
      })
    ).status,
  ).toBe(403);
  expect((await send("x".repeat(65000))).status).toBe(413);
  expect((await send("{malformed")).status).toBe(422);
});
