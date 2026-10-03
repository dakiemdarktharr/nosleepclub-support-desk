import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { redact } from "@/domain/redaction";
import { detectedRisks, extractIntake, extractText } from "@/domain/text";
import { evaluatePolicy } from "@/domain/policy";
import { previewSupport, submitSupport } from "@/services/support";
import {
  reviewSupport,
  clarifySupport,
  feedbackSupport,
} from "@/services/review";
import {
  resetSupportTestStore,
  listSupportRequests,
  listSupportSummaries,
  getSupportPreview,
  saveSupportPreview,
} from "@/lib/support-repository";
import { GET as events } from "@/app/api/support/events/route";
import { GET as metrics } from "@/app/api/support/metrics/route";
import { allFields, fieldLabels, catalog } from "@/domain/catalog";
import { intentLabels } from "@/domain/presentation";
beforeEach(() => {
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("AI_PROVIDER", "mock");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const input = (rawText: string) => ({
  rawText,
  fields: { department: "engineering", employeeId: "EMP-TEST-01" },
  confirmed: true,
  idempotencyKey: crypto.randomUUID(),
});
it.each([
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "aws_secret_access_key",
  "secretAccessKey",
  "accessKeyId",
  "AWS_SESSION_TOKEN",
])("redacts %s in assignments, JSON, intake and audit", async (key) => {
  const fake = "SYNTHETIC" + "_JUDGE_VALUE";
  for (const text of [`${key}=${fake}`, `"${key}": "${fake}"`]) {
    expect(redact(text).text).not.toContain(fake);
    const row = await submitSupport(input(text));
    expect(JSON.stringify(row)).not.toContain(fake);
    expect(row.decision?.action).toBe("ESCALATE");
  }
  const row = await submitSupport(input("Open public RDP port 3389"));
  const rejected = await reviewSupport(
    row.id,
    { version: row.version, action: "REJECT", reason: `${key}=${fake}` },
    "reviewer-demo",
  );
  expect(JSON.stringify(rejected)).not.toContain(fake);
});
it.each([
  "Không mở port 3389 public",
  "Do not open public RDP port 3389",
  "Do not expose SSH to Internet",
  "Do not expose service to Internet",
  "Không mở bucket public",
])("does not escalate a negated exposure: %s", (text) =>
  expect(detectedRisks(text)).not.toContain("PUBLIC_EXPOSURE"),
);
it.each(["không cần cấp root", "không gửi token"])(
  "recognizes Vietnamese negation: %s",
  (text) => expect(detectedRisks(text)).toEqual([]),
);
it.each([
  "Do not open RDP; expose SSH to Internet",
  "Không mở port 80 public nhưng mở port 3389 public",
  "Make this bucket public",
  "Expose service on 0.0.0.0",
  "Restart laptop; open port 3389, public Internet",
])("keeps positive exposure: %s", (text) =>
  expect(detectedRisks(text)).toContain("PUBLIC_EXPOSURE"),
);
it.each(["report", "support", "important report"])(
  "does not mistake %s for port",
  (text) => expect(extractText(text).intentLabel).not.toBe("PORT_OPEN_REQUEST"),
);
it("public documentation is not public infrastructure exposure", () =>
  expect(
    detectedRisks("Read public GitHub documentation for SSH"),
  ).not.toContain("PUBLIC_EXPOSURE"));
it.each([
  "K8S_EXEC_POD",
  "K8S_DEPLOY",
  "K8S_RESTART_POD",
  "K8S_SCALE_WORKLOAD",
  "K8S_ROLLBACK",
])("a misleading benign action cannot cancel %s", (intentLabel) => {
  const canonical = extractIntake({
    ...input(""),
    mode: "structured",
    serviceGroup: "KUBERNETES",
    fields: {
      intentLabel,
      cluster: "test",
      namespace: "sandbox",
      workload: "demo",
      environment: "staging",
      requestedAction: "view_logs",
    },
  });
  expect(evaluatePolicy(canonical).action).toBe("ESCALATE");
});
it("keeps legitimate Kubernetes log viewing available", () => {
  const canonical = extractIntake({
    ...input(""),
    mode: "structured",
    serviceGroup: "KUBERNETES",
    fields: {
      intentLabel: "K8S_VIEW_LOGS",
      cluster: "test",
      namespace: "sandbox",
      workload: "demo",
      environment: "staging",
      requestedAction: "view_logs",
    },
  });
  expect(evaluatePolicy(canonical).action).toBe("AUTO_APPROVE");
});
it.each(["APPROVE", "OVERRIDE"])(
  "blocks %s on incomplete access even with public reviewer",
  async (action) => {
    const row = await submitSupport(input("Need database read access"));
    await expect(
      reviewSupport(
        row.id,
        {
          version: row.version,
          action,
          target: "APPROVED_BY_HUMAN",
          reason: "Judge regression check",
        },
        "reviewer-demo",
      ),
    ).rejects.toMatchObject({
      code: action === "APPROVE" ? "INVALID_TRANSITION" : "MISSING_INFORMATION",
    });
  },
);
it("all 20 concurrent idempotent responses have a final decision and single audit", async () => {
  const value = input("VPN không kết nối");
  const rows = await Promise.all(
    Array.from({ length: 20 }, () => submitSupport(value)),
  );
  expect(
    rows.every(
      (row) => row.version === 1 && row.decision && row.events.length === 2,
    ),
  ).toBe(true);
  expect(await listSupportRequests()).toHaveLength(1);
});
it("preview creates no ticket; binds exact analysis and assistance to submission", async () => {
  const preview = await previewSupport(input("VPN không kết nối"));
  expect(await listSupportRequests()).toHaveLength(0);
  const row = await submitSupport({ ...preview.input, confirmed: true });
  expect(row.decision).toEqual(preview.decision);
  expect(row.assistance).toEqual([preview.assistance]);
  await expect(
    submitSupport({
      ...preview.input,
      rawText: "Grant production admin",
      idempotencyKey: crypto.randomUUID(),
      confirmed: true,
    }),
  ).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
});
it("expired preview cannot be submitted", async () => {
  const preview = await previewSupport(input("Restart laptop"));
  const cached = (await getSupportPreview(preview.input.previewId!))!;
  await saveSupportPreview({ ...cached, expiresAt: new Date(0) });
  await expect(
    submitSupport({ ...preview.input, confirmed: true }),
  ).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
});
it("structured-only clarification progresses without retyping the ticket", async () => {
  const row = await submitSupport(input("Need database read access"));
  const updated = await clarifySupport(row.id, {
    version: row.version,
    fields: {
      system: "postgresql",
      resourceScope: "demo_inventory",
      environment: "staging",
      permission: "read-only",
      duration: "2 hours",
      reason: "Inspect synthetic inventory",
      approvalReference: "DEMO-1001",
    },
  });
  expect(updated.decision?.action).toBe("AUTO_APPROVE");
  expect(updated.originalQuestion).toBe(row.input.rawText);
});
it("explain step stays in guidance and preserves history; explicit handoff creates review", async () => {
  const row = await submitSupport(input("VPN không kết nối"));
  const explained = await feedbackSupport(row.id, {
    version: row.version,
    choice: "EXPLAIN",
    step: 1,
  });
  expect(explained.status).toBe("AUTO_APPROVED");
  expect(explained.stepExplanations).toHaveLength(1);
  expect(explained.assistance).toEqual(row.assistance);
  const handed = await feedbackSupport(row.id, {
    version: explained.version,
    choice: "ADMIN",
  });
  expect(handed.status).toBe("ESCALATED");
  expect(handed.stepExplanations).toHaveLength(1);
});
it("summary includes clarification, but pending review only counts escalation; unknown events are 404", async () => {
  const missing = await submitSupport(input("Need database read access"));
  const risk = await submitSupport(input("Open public RDP port 3389"));
  expect(missing.status).toBe("NEEDS_INFORMATION");
  expect(risk.status).toBe("ESCALATED");
  const rows = await listSupportSummaries();
  expect(rows).toHaveLength(2);
  expect(rows[0]).not.toHaveProperty("events");
  expect(rows[0]).not.toHaveProperty("input");
  expect((await (await metrics()).json()).data.pendingReview).toBe(1);
  expect(
    (
      await events(
        new Request(
          `http://localhost/api/support/events?requestId=${crypto.randomUUID()}`,
        ),
      )
    ).status,
  ).toBe(404);
});
it("structured request kind conflicts are explicit, unknown stays OTHER", () => {
  const base = {
    ...input(""),
    mode: "structured" as const,
    serviceGroup: "OTHER" as const,
  };
  expect(
    extractIntake({
      ...base,
      requestKind: "ACCESS_REQUEST",
      fields: { intentLabel: "GENERAL_HOW_TO" },
    }).riskSignals,
  ).toContain("CONFLICT");
  expect(
    extractIntake({
      ...base,
      fields: { intentLabel: "UNKNOWN_SUPPORT_REQUEST" },
    }).requestKind,
  ).toBe("OTHER");
});
it("all catalog labels and fields have explicit Vietnamese display labels", () => {
  for (const field of allFields) expect(fieldLabels[field], field).toBeTruthy();
  for (const service of Object.values(catalog))
    for (const intent of service.labels)
      expect(intentLabels[intent], intent).toBeTruthy();
});

it.each([
  "VPN not connecting please open public port 3389",
  "VPN không kết nối vui lòng mở port 3389 public",
])(
  "symptom negation cannot cancel a positive risky request: %s",
  async (text) => {
    const row = await submitSupport(input(text));
    expect(row.canonical?.riskSignals).toContain("PUBLIC_EXPOSURE");
    expect(row.decision?.action).toBe("ESCALATE");
  },
);
it("operation cannot launder access intent or bypass approval", async () => {
  const row = await submitSupport({
    ...input(""),
    mode: "structured",
    serviceGroup: "DATABASE",
    fields: {
      department: "engineering",
      employeeId: "EMP-TEST-01",
      intentLabel: "DATABASE_READ_ACCESS",
      system: "postgresql",
      resourceScope: "demo_inventory",
      environment: "staging",
      permission: "read-only",
      duration: "2 hours",
      reason: "Synthetic inspection",
      operation: "backup",
    },
  });
  expect(row.decision?.action).toBe("ESCALATE");
  expect(row.canonical?.riskSignals).toContain("CONFLICT");
  expect(row.decision?.missingFields).toContain("verifiedApproval");
  await expect(
    reviewSupport(
      row.id,
      {
        version: row.version,
        action: "APPROVE",
        reason: "Judge regression check",
      },
      "reviewer-demo",
    ),
  ).rejects.toMatchObject({ code: "MISSING_INFORMATION" });
});
it("model ambiguity cannot produce guidance approval", async () => {
  const value = input("Restart laptop");
  const facts = extractText(value.rawText);
  const row = await submitSupport(value, {
    run: async () => ({
      ...facts,
      ambiguities: ["Unsure whether restart or factory reset is intended"],
    }),
  });
  expect(row.decision?.action).toBe("ESCALATE");
  expect(row.canonical?.model.failure).toBe("MODEL_EVIDENCE_INVALID");
});
it("large GPU allocation cannot be auto-approved even with a hypothetical verified approval", () => {
  const canonical = extractIntake({
    ...input(""),
    mode: "structured",
    serviceGroup: "CLOUD_GPU",
    fields: {
      intentLabel: "GPU_REQUEST",
      provider: "demo",
      environment: "development",
      duration: "2 hours",
      purpose: "Synthetic test",
      gpuType: "a100",
      quantity: "64",
      budgetOrQuota: "Synthetic quota review",
    },
  });
  expect(evaluatePolicy(canonical, { status: "verified" }).ruleIds).toContain(
    "AUTH-QUOTA",
  );
});

it("still broken gives a different follow-up instead of repeating the same instructions", async () => {
  const row = await submitSupport(input("VPN không kết nối"));
  const next = await feedbackSupport(row.id, {
    version: row.version,
    choice: "STILL_BROKEN",
  });
  expect(next.assistance).toHaveLength(2);
  expect(next.assistance[1].stepByStepInstructions).not.toEqual(
    next.assistance[0].stepByStepInstructions,
  );
});
it("extracted explicit scope and aliases prevent redundant questions", async () => {
  const row = await submitSupport(
    input(
      "Cấp chỉ đọc PostgreSQL staging trong 2 giờ; resourceScope=demo_inventory; reason=Inspect synthetic inventory; approvalReference=DEMO-1001",
    ),
  );
  expect(row.decision?.missingFields).not.toContain("resourceScope");
  expect(row.decision?.missingFields).not.toContain("reason");
  expect(row.decision?.action).toBe("AUTO_APPROVE");
});

it.each([
  "Mở 8543 từ 0/0 tới PostgreSQL staging",
  "Open 15432 from 0.0.0.0/0 to a staging database",
  "Make PostgreSQL public",
])("recognizes exposure without an explicit port label: %s", async (text) => {
  const row = await submitSupport(input(text));
  expect(row.decision?.bucket).toBe("SECURITY_RISK");
  expect(row.canonical?.riskSignals).toContain("PUBLIC_EXPOSURE");
});

it("structured cluster-admin intent still requires verified authority", async () => {
  const row = await submitSupport({
    ...input(""),
    mode: "structured",
    serviceGroup: "KUBERNETES",
    fields: {
      department: "engineering",
      employeeId: "EMP-TEST-01",
      intentLabel: "K8S_CLUSTER_ADMIN",
      cluster: "demo",
      namespace: "demo",
      workload: "demo",
      environment: "staging",
      requestedAction: "view_logs",
    },
  });
  expect(row.decision?.missingFields).toContain("verifiedApproval");
  await expect(
    reviewSupport(
      row.id,
      {
        version: row.version,
        action: "APPROVE",
        reason: "Judge regression check",
      },
      "reviewer-demo",
    ),
  ).rejects.toMatchObject({ code: "MISSING_INFORMATION" });
});
