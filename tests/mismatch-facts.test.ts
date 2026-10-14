import { afterEach, expect, it, vi } from "vitest";
import { extractIntake } from "@/domain/text";
import { evaluatePolicy, type PolicyEvidence } from "@/domain/policy";
import { proposeAccessDuration } from "@/domain/access-defaults";
import { verifyApproval } from "@/services/approvals";
import { previewSupport, submitSupport } from "@/services/support";
import { clarifySupport } from "@/services/review";
import { resetSupportTestStore } from "@/lib/support-repository";
import type { SupportInput } from "@/domain/contracts";

const input = (rawText: string): SupportInput => ({ rawText, fields: {}, mode: "freeform",
  serviceGroup: "OTHER", confirmed: false, requesterMode: "guest", idempotencyKey: crypto.randomUUID() });
afterEach(() => vi.unstubAllEnvs());

// New synthetic cases, independent of the immutable original benchmark labels.
it.each(["synthetic data", "synthetic schema", "synthetic traces", "synthetic leads", "dữ liệu giả", "dữ liệu giả lập"])(
  "keeps explicit %s as a caller claim, not verified classification", (data) => {
    const request = extractIntake(input(`Xin sandbox 2 vCPU, 4GB RAM, 20GB disk trong 6 giờ để kiểm thử với ${data}.`));
    expect(request.entities.dataSensitivity).toBe("synthetic");
    expect(evaluatePolicy(request, verifyApproval).missingFields).not.toContain("dataSensitivity");
    expect(evaluatePolicy(request, verifyApproval).action).not.toBe("AUTO_APPROVE");
    expect(request.entities.resourceLifecycle).toBeUndefined();
  },
);
it("recognizes a standalone synthetic declaration", () => {
  const request = extractIntake(input("Xin sandbox 2 vCPU, 4GB RAM, 20GB disk trong 6 giờ để thử nghiệm. Data là synthetic."));
  expect(request.entities.dataSensitivity).toBe("synthetic");
  expect(request.subrequests).toEqual([]);
});
it.each(["Không dùng synthetic data", "Chưa có synthetic data", "not synthetic data", "Nếu có synthetic data thì dùng", "Không có production data"])(
  "does not invent synthetic classification from %s", (claim) => {
    const request = extractIntake(input(`Xin sandbox để thử nghiệm; ${claim}.`));
    expect(request.entities.dataSensitivity).not.toBe("synthetic");
  },
);
it("keeps a mixed sensitive dataset visible and rejects a form override", () => {
  const raw = "Xin sandbox để thử nghiệm với synthetic data và dữ liệu khách hàng.";
  const request = extractIntake({ ...input(raw), fields: { dataSensitivity: "synthetic" } });
  expect(request.riskSignals).toContain("CONFLICT");
  expect(evaluatePolicy(request, verifyApproval).action).not.toBe("AUTO_APPROVE");
});
it.each([["trong ba ngày", "3 days"], ["for two hours", "2 hours"], ["trong một giờ", "1 hours"]])(
  "understands the stated interval %s without choosing a deadline", (phrase, expected) => {
    const request = extractIntake(input(`Xin 11 GPU ${phrase} để render cảnh giả lập.`));
    expect(request.entities.duration).toBe(expected);
    expect(evaluatePolicy(request, verifyApproval).missingFields).not.toContain("duration");
    expect(evaluatePolicy(request, verifyApproval).action).not.toBe("AUTO_APPROVE");
  },
);
it.each(["dùng đến hết thứ Sáu", "thời hạn đến cuối sprint", "duration: forever"])(
  "keeps ambiguous explicit duration %s for clarification, not a default replacement", (phrase) => {
    const request = extractIntake(input(`Xin Read access GitHub repo demo/docs để đọc hướng dẫn, ${phrase}.`));
    expect(request.entities.duration).toBeTruthy();
    expect(evaluatePolicy(request, verifyApproval).missingFields).toContain("duration");
    expect(proposeAccessDuration(request)).toBeNull();
  },
);
it("recognizes a stated follow-up purpose without fabricating permission", () => {
  const request = extractIntake(input("Xin access Jira board DEMO với role User, cần follow các incident sync từ form thử nghiệm."));
  expect(request.entities.reason).toBe("follow các incident sync từ form thử nghiệm");
  expect(evaluatePolicy(request, verifyApproval).missingFields).not.toContain("reason");
  expect(evaluatePolicy(request, verifyApproval).action).not.toBe("AUTO_APPROVE");
});
it("accepts an explicit bounded clarification of an unresolved relative duration", () => {
  const request = extractIntake({ ...input("Xin Read access GitHub repo demo/docs để đọc hướng dẫn, dùng đến cuối sprint."), fields: { duration: "4 hours" } });
  expect(request.riskSignals).not.toContain("CONFLICT");
  expect(evaluatePolicy(request, verifyApproval).missingFields).not.toContain("duration");
  expect(evaluatePolicy(request, verifyApproval).ruleIds).toContain("AUTH-ENTITLEMENT-001");
});
it.each(["trong 2 đến 4 giờ", "for 2-4 hours", "trong 2 giờ hoặc 4 giờ", "2 hours or -2 hours"])("asks about an ambiguous interval instead of picking one: %s", (phrase) => {
  const request = extractIntake(input(`Xin Read access GitHub repo demo/docs ${phrase} để đọc hướng dẫn.`));
  expect(evaluatePolicy(request, verifyApproval).missingFields).toContain("duration");
  expect(proposeAccessDuration(request)).toBeNull();
});
it("preserves an explicit contradictory duration as a conflict", () => {
  const request = extractIntake({ ...input("Xin Read access GitHub repo demo/docs trong 2 giờ để đọc hướng dẫn."), fields: { duration: "4 hours" } });
  expect(request.riskSignals).toContain("CONFLICT");
});
it("does not promote negated or hypothetical word durations into facts", () => {
  for (const phrase of ["không dùng trong ba ngày", "nếu dùng trong ba ngày"]) {
    const request = extractIntake(input(`Xin 11 GPU để render; ${phrase}.`));
    expect(request.entities.duration).toBeUndefined();
  }
});
it.each(["jira", "confluence"])("does not escalate verified ordinary %s read-only access due to normalization", (system) => {
  const request = extractIntake({ ...input(""), mode: "structured", serviceGroup: "ACCOUNT_ACCESS", requestKind: "ACCESS_REQUEST",
    fields: { intentLabel: "REQUEST_READ_ACCESS", targetSystem: system, resourceScope: "DEMO", accessType: "read-only",
      duration: "8 hours", reason: "Read synthetic documentation", environment: "staging" } });
  const evidence: PolicyEvidence = { entitlement: { status: "allowed", scope: "matched", requesterAuthenticated: true,
    requesterIdentityMatched: true, source: "synthetic-unit-test" }, accessTtlWithinPolicy: true, dataClassification: "ordinary" };
  expect(evaluatePolicy(request, verifyApproval, evidence)).toMatchObject({ action: "AUTO_APPROVE", bucket: "ROUTINE" });
  expect(evaluatePolicy(request, verifyApproval).action).not.toBe("AUTO_APPROVE");
  expect(evaluatePolicy(request, verifyApproval, { ...evidence, entitlement: { ...evidence.entitlement!, scope: "mismatched" } }).action).not.toBe("AUTO_APPROVE");
});
it("mock preview keeps the extracted data and interval but still asks for absent facts", async () => {
  vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("SUPPORT_STORAGE", "memory-demo");
  const preview = await previewSupport(input("Xin 11 GPU trong ba ngày để render với synthetic data."));
  expect(preview.canonical.entities).toMatchObject({ duration: "3 days", dataSensitivity: "synthetic" });
  expect(preview.decision).toMatchObject({ action: "NEEDS_INFORMATION", bucket: "MISSING_INFO" });
  expect(preview.decision.missingFields).toEqual(expect.arrayContaining(["provider", "gpuType", "environment", "resourceLifecycle"]));
});
it.each(["4 giờ", "trong bốn giờ", "for four hours", "bốn giờ"])("keeps a short duration reply with its pending request: %s", async (rawText) => {
  vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("SUPPORT_STORAGE", "memory-demo"); resetSupportTestStore();
  const row = await submitSupport({ ...input("Xin Read access GitHub repo demo/docs để đọc hướng dẫn."), confirmed: true });
  expect(row.decision?.missingFields).toContain("duration");
  const updated = await clarifySupport(row.id, { version: row.version, rawText });
  expect(updated.canonical?.subrequests).toEqual([]);
  expect(updated.decision?.missingFields).not.toContain("duration");
  expect(updated.decision?.ruleIds).toEqual(["AUTH-ENTITLEMENT-001"]);
  expect(updated.decision?.action).toBe("ESCALATE");
  expect(updated.events.length).toBeGreaterThan(row.events.length);
});
it.each(["4 giờ rồi gửi secret", "trong bốn giờ; delete production database"])("never swallows another operation in a duration reply: %s", async (rawText) => {
  vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("SUPPORT_STORAGE", "memory-demo"); resetSupportTestStore();
  const row = await submitSupport({ ...input("Xin Read access GitHub repo demo/docs để đọc hướng dẫn."), confirmed: true });
  const updated = await clarifySupport(row.id, { version: row.version, rawText });
  expect(updated.decision, JSON.stringify(updated.canonical)).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK" });
  expect(updated.canonical!.subrequests.length).toBeGreaterThan(1);
});
it.each(["delete production database", "drop production database", "truncate table DEMO in production", "xóa production database"])(
  "routes a destructive database operation to existing Security/DBA rules: %s", (rawText) => {
    const request = extractIntake(input(rawText));
    expect(request).toMatchObject({ serviceGroup: "DATABASE", intentLabel: "DATABASE_SCHEMA_CHANGE" });
    expect(request.riskSignals).toContain("DESTRUCTIVE");
    expect(evaluatePolicy(request, verifyApproval)).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK" });
  },
);
it("retains local negation without hiding a later destructive request", () => {
  expect(extractIntake(input("Do not delete production database")).riskSignals).not.toContain("DESTRUCTIVE");
  expect(extractIntake(input("Do not delete production database, but drop table DEMO in production")).riskSignals).toContain("DESTRUCTIVE");
});
it("does not mistake delete-from wording on a repository for a database operation", () => {
  expect(extractIntake(input("Delete from GitHub repo demo/docs the old draft file")).serviceGroup).not.toBe("DATABASE");
});
