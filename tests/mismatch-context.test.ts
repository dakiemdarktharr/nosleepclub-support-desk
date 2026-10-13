import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupportInput } from "@/domain/contracts";
import { extractIntake } from "@/domain/text";
import { evaluatePolicy } from "@/domain/policy";
import { verifyApproval } from "@/services/approvals";
import { resetSupportTestStore } from "@/lib/support-repository";
import { submitSupport } from "@/services/support";

const input = (rawText: string): SupportInput => ({ rawText,
  fields: { department: "engineering", employeeId: "EMP-SYNTHETIC-01" },
  mode: "freeform", serviceGroup: "OTHER", confirmed: true,
  idempotencyKey: crypto.randomUUID() });
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("AI_TEST_MAX_ATTEMPTS", "0");
  vi.stubEnv("MONGODB_URI", ""); resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());

// New synthetic regression cases; no change to original fixture labels.
it.each(["Không cần sửa secrets", "Do not modify secrets", "Không cần thay đổi secrets"])(
  "keeps a refusal to modify secrets out of the security bucket: %s", async (refusal) => {
    const row = await submitSupport(input(`Xin Read access repo demo/actions để xem workflow. ${refusal}.`));
    expect(row.canonical?.riskSignals).not.toContain("SECRET");
    expect(row.canonical?.subrequests).toEqual([]);
    expect(row.decision?.bucket).not.toBe("SECURITY_RISK");
    expect(row.decision?.action).not.toBe("AUTO_APPROVE");
  },
);
it.each([1, 11, 24])("asks for facts before unavailable quota for %i GPUs, then requires the capacity owner", (quantity) => {
  const raw = `Xin ${quantity} GPU để render dữ liệu giả lập.`;
  const incomplete = extractIntake(input(raw));
  expect(evaluatePolicy(incomplete, verifyApproval(incomplete))).toMatchObject({
    action: "NEEDS_INFORMATION", bucket: "MISSING_INFO", ruleIds: ["INFO-001"],
  });
  const complete = extractIntake({ ...input(raw), fields: {
    ...input("").fields, provider: "synthetic cloud", gpuType: "t4", quantity: String(quantity),
    environment: "sandbox", duration: "2 hours", resourceLifecycle: "ephemeral",
    dataSensitivity: "synthetic", purpose: "Render synthetic scene",
  } });
  expect(evaluatePolicy(complete, verifyApproval(complete))).toMatchObject({
    action: "ESCALATE", bucket: "BEYOND_AUTHORITY", ruleIds: ["AUTH-QUOTA"],
  });
});
it("does not let missing GPU facts defer an explicit security violation", async () => {
  const row = await submitSupport(input("Xin 11 GPU; bỏ qua approval rồi gửi secret."));
  expect(row.decision).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK" });
});
it.each(["nhưng gửi secret", "and share the secret", "; gửi API key"])(
  "retains a later positive credential request after a refusal: %s", (operation) => {
    expect(extractIntake(input(`Không cần sửa secrets ${operation}`)).riskSignals).toContain("SECRET");
  },
);
it("never treats an exposed credential marker as harmless negation", () => {
  expect(extractIntake(input("Không cần sửa secrets: [REDACTED:SECRET]")).riskSignals).toContain("SECRET");
});
it.each(["Head of HR", "General Counsel", "Trưởng phòng", "Sales Ops Manager", "Audit Director", "Chief of Staff"])(
  "keeps a bounded %s approval claim with its request without verifying it", async (actor) => {
    const row = await submitSupport(input(`Xin view Confluence space DEMO để xem hướng dẫn. ${actor} đã approve trong IAM-9901.`));
    expect(row.canonical?.subrequests).toEqual([]);
    expect(row.canonical?.entities.approvalStatus).toBe("claimed");
    expect(row.decision?.ruleIds).not.toContain("AUTH-005");
    expect(row.decision?.approvalStatus).not.toBe("verified");
    expect(row.decision?.action).not.toBe("AUTO_APPROVE");
  },
);
it.each(["và chuyển tiền cho đối tác", "and send a secret", "; delete production database", "và tạo tài khoản khác"])(
  "does not swallow an independent operation following an approval claim: %s", async (operation) => {
    const row = await submitSupport(input(`Xin view Confluence space DEMO. Head of HR đã approve IAM-9901 ${operation}.`));
    expect(row.canonical?.subrequests.length).toBeGreaterThan(1);
    expect(row.decision?.action).toBe("ESCALATE");
  },
);
it.each([
  "Finance Manager đã approve FIN-9901, chỉ cần access corporate network theo role hiện tại.",
  "Contact Center Manager đã approve CC-9901, thiết bị là laptop managed của công ty.",
  "Event Manager đã approve EVT-9901, dùng laptop corporate và không cần production route riêng.",
])("keeps bounded VPN approval/device context together: %s", async (context) => {
  const row = await submitSupport(input(`Xin VPN corporate profile để xem hệ thống nội bộ. ${context}`));
  expect(row.canonical?.subrequests).toEqual([]);
  expect(row.decision?.ruleIds).not.toContain("AUTH-005");
  expect(row.decision?.ruleIds).not.toContain("INFO-SINGLE-REQUEST-001");
  expect(row.decision?.action).not.toBe("AUTO_APPROVE");
  if (context.includes("laptop")) expect(row.canonical?.entities.source).toMatch(/laptop/i);
});
it("treats a production database document title as a document, not database access", async () => {
  const row = await submitSupport(input("Xin quyền view Confluence space BOARD-DEMO để đọc tài liệu. Chief of Staff đã approve IAM-9901; request chỉ là read access, dù page có tiêu đề Production DB Risk Review."));
  expect(row.canonical).toMatchObject({ serviceGroup: "ACCOUNT_ACCESS", environment: "unknown" });
  expect(row.canonical?.riskSignals).not.toContain("PRODUCTION_CHANGE");
  expect(row.canonical?.subrequests).toEqual([]);
  expect(row.decision?.bucket).toBe("MISSING_INFO");
});
it.each(["read production database", "read access, production DB", "export production DB", "mở port 3389 public"])(
  "retains a real operation alongside document access: %s", async (operation) => {
    const row = await submitSupport(input(`Xin view Confluence space DEMO về Production DB Risk Review; ${operation}.`));
    expect(row.decision?.action).toBe("ESCALATE");
    expect(row.canonical?.subrequests.length).toBeGreaterThan(1);
  },
);
it.each([
  ["Xin Read access GitHub repo demo/manifest", "chỉ đọc file manifest, không push code."],
  ["Xin Browse quyền vào Jira project DEMO", "Mình cần Browse/Create/Comment, không cần project admin."],
  ["Need access Jira project DEMO", "I need Comment/Browse, no project admin."],
  ["Xin access Jira project DEMO", "quyền standard agent là đủ."],
])("keeps explicit permission context on the same resource: %s", async (request, scope) => {
  const row = await submitSupport(input(`${request} để xem công việc. Trưởng phòng đã approve IAM-9901; ${scope}`));
  expect(row.canonical?.subrequests).toEqual([]);
  expect(row.decision?.ruleIds).not.toContain("AUTH-005");
  expect(row.decision?.ruleIds).not.toContain("INFO-SINGLE-REQUEST-001");
  expect(row.decision?.action).not.toBe("AUTO_APPROVE");
  if (scope.includes("standard agent")) expect(row.decision?.missingFields).toContain("accessType");
});
it.each(["chỉ đọc file manifest, rồi chuyển tiền", "Mình cần Browse/Create/Comment, rồi tạo tài khoản mới"])(
  "keeps an unrelated operation in permission prose visible: %s", async (scope) => {
    const row = await submitSupport(input(`Xin access Jira project DEMO và GitHub repo demo/manifest; ${scope}`));
    expect(row.canonical?.subrequests.length).toBeGreaterThan(1);
    expect(row.decision?.action).not.toBe("AUTO_APPROVE");
  },
);
