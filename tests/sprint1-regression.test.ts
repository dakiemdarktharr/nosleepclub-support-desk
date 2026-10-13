import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { evaluatePolicy } from "@/domain/policy";
import { extractIntake, extractText } from "@/domain/text";
import { prepareInput, submitSupport } from "@/services/support";
import { getSupportRequest, resetSupportTestStore } from "@/lib/support-repository";
import { POST } from "@/app/api/support/requests/route";
import { verifyApproval } from "@/services/approvals";
import extended from "../mlai26_new/data/ground-truth/extended_ticket_cases.json";
import crossFunction from "../mlai26_new/data/ground-truth/enterprise_cross_function_cases.json";

// Independent synthetic regressions, not original competition Ground Truth.
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const intake = (rawText: string, fields: Record<string, string> = {}) =>
  prepareInput({ rawText, fields: { department: "engineering", employeeId: "EMP-TEST-01", ...fields }, confirmed: true, idempotencyKey: crypto.randomUUID() }).input;
const incompleteResourceCases = [...extended, ...crossFunction].filter(
  (item) =>
    (item.id.startsWith("gt-missing-") || item.id.startsWith("xcf-missing-")) &&
    item.expected_action === "ESCALATE" &&
    item.expected_bucket === "MISSING_INFO",
);

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
it.each([
  "Mình cần standard corporate VPN profile để vào QA subnet từ laptop managed; manager approval ở QA-9931.",
  "Mình cần standard corporate VPN để vào QA subnet từ laptop managed; manager approval ở QA-9931.",
])("treats standard corporate VPN access as provisioning, not a port change: %s", (text) => {
  expect(extractText(text)).toMatchObject({
    serviceGroup: "NETWORK_VPN",
    intentLabel: "VPN_SETUP",
    requestKind: "ACCESS_REQUEST",
  });
});
it.each([
  "Cấp quyền edit Confluence space SECOPS để cập nhật RDP hardening và checklist port 3389; không yêu cầu mở network port.",
  "Cấp access Jira project NETSEC để review external-port tasks; chỉ Browse/Create Issue, không thay đổi firewall.",
])("keeps collaboration-document access separate from mentioned network topics: %s", (text) => {
  expect(extractText(text)).toMatchObject({
    serviceGroup: "ACCOUNT_ACCESS",
    intentLabel: "REQUEST_STANDARD_ACCESS",
    requestKind: "ACCESS_REQUEST",
  });
});
it("does not infer production database access from a Confluence document title", () => {
  const rawText = "Nhờ cấp quyền view Confluence page Production DB Recovery SOP cho mục đích training on-call. Mình không yêu cầu quyền vào database, chỉ đọc tài liệu.";
  const parsed = extractIntake(intake(rawText));
  expect(parsed).toMatchObject({
    serviceGroup: "ACCOUNT_ACCESS",
    intentLabel: "REQUEST_STANDARD_ACCESS",
    environment: "unknown",
  });
  expect(parsed.riskSignals).not.toContain("PRODUCTION_CHANGE");
  expect(evaluatePolicy(parsed).ruleIds).not.toContain("AUTH-001");
  expect(parsed.subrequests).toEqual([]);
});
it("respects negation when a ticket says it will not mount real secrets", () => {
  const parsed = extractIntake(intake("Xin sandbox 6 vCPU để test k3s. No public ingress and no mount real secrets."));
  expect(parsed.riskSignals).not.toContain("SECRET");
  expect(parsed.riskSignals).not.toContain("PUBLIC_EXPOSURE");
  expect(parsed.subrequests).toEqual([]);
  expect(extractText("Mount a real secret into the sandbox").riskSignals).toContain("SECRET");
});
it("keeps explicit network and production database changes on their safety paths", () => {
  expect(extractText("Open inbound TCP port 3389 from the Internet").intentLabel).toBe("PORT_OPEN_REQUEST");
  expect(extractText("Confluence page access; grant write access to production database").serviceGroup).toBe("DATABASE");
});
it.each([
  "Hi Data Ops, team mình cần một ETL VM chạy Airflow để backfill event từ ZaloPay sang lakehouse. DAG đã ready, nhờ Infra provision giúp trong tuần này; mình quên ghi sizing và chưa chốt giữ máy đến bao giờ.",
  "Finance cần một PostgreSQL staging database để reconcile settlement cuối tháng. Data khoảng 200GB và team muốn dùng ngay, nhờ IT chọn default config giúp; mình chưa ghi CPU, RAM hoặc ngày release resource.",
  "Bên VNGGames cần một Kafka Connect worker để sync gameplay events sang ClickHouse cho dashboard live ops. Throughput với retention chưa chốt, chưa có instance size và timeframe; cứ dựng trước một node giúp team được không?",
])("keeps resource sizing and readiness details with the provisioning request: %s", (rawText) => {
  const parsed = extractIntake(intake(rawText));
  const decision = evaluatePolicy(parsed);
  expect(parsed.subrequests).toEqual([]);
  expect(decision.bucket).toBe("MISSING_INFO");
  expect(decision.ruleIds).not.toContain("AUTH-005");
});
it("keeps all 27 original incomplete resource requests on the provisioning review path", () => {
  expect(incompleteResourceCases).toHaveLength(27);
  for (const item of incompleteResourceCases) {
    const parsed = extractIntake(intake(item.ticket_content));
    expect(parsed.subrequests, item.id).toEqual([]);
    expect(parsed.riskSignals, item.id).not.toContain("BYPASS");
    expect(verifyApproval(parsed).status, item.id).not.toBe("verified");
    expect(evaluatePolicy(parsed, verifyApproval), item.id).toMatchObject({
      action: "ESCALATE",
      bucket: "MISSING_INFO",
    });
    expect(evaluatePolicy(parsed, verifyApproval).ruleIds, item.id).toContain(
      "INFO-PROVISION-001",
    );
  }
});
it("recognizes a requested ETL server build while retaining the incomplete-sizing rule", () => {
  const parsed = extractIntake(intake(
    "Hi Data Ops, bên mình cần dựng gấp một ETL server để pull event từ Kafka rồi load sang warehouse cho pipeline campaign. Nhờ team provision giúp trong hôm nay nhé, config giống môi trường data thông thường là được. Cảm ơn team.",
  ));
  expect(parsed.subrequests).toEqual([]);
  expect(parsed.intentLabel).toBe("CLOUD_VM_REQUEST");
  expect(evaluatePolicy(parsed)).toMatchObject({ action: "ESCALATE", bucket: "MISSING_INFO" });
  expect(evaluatePolicy(parsed).ruleIds).toContain("INFO-PROVISION-001");
});
it("does not infer a fixed GPU quota without authoritative capacity evidence", () => {
  const item = extended.find((row) => row.id === "gt-authority-008-eleven-gpu");
  if (!item) throw new Error("Original GPU quota fixture is missing");
  const parsed = extractIntake(intake(item.ticket_content));
  const decision = evaluatePolicy(parsed);
  expect(parsed.intentLabel).not.toBe("CLOUD_VM_REQUEST");
  expect(decision.action).not.toBe("AUTO_APPROVE");
  expect(decision.ruleIds).not.toContain("AUTH-QUOTA");
});
it("does not mistake software installation on an existing data worker for provisioning", () => {
  const parsed = extractIntake(intake(
    "Nhờ cài qBittorrent lên data worker hiện có để đồng bộ dataset; chỉ cần hướng dẫn thao tác.",
  ));
  expect(parsed.intentLabel).not.toBe("CLOUD_VM_REQUEST");
});
it("keeps use of an existing compute or database resource out of provisioning", () => {
  const compute = extractIntake(intake(
    "Mình dùng Airflow worker hiện có để chạy DAG attribution.",
  ));
  const database = extractIntake(intake(
    "Mình dùng Redis instance hiện có để kiểm tra idempotency.",
  ));
  expect(compute.intentLabel).not.toBe("CLOUD_VM_REQUEST");
  expect(database.intentLabel).not.toBe("DATABASE_PROVISION");
});
it.each([
  "Please provision an Airflow worker for the attribution queue; we have not benchmarked CPU/RAM or chosen its cleanup date.",
  "Create a separate Redis instance for payment callback tests. We haven't estimated memory use or the expiry duration.",
])("routes a paraphrased incomplete resource request through provisioning review: %s", (rawText) => {
  const parsed = extractIntake(intake(rawText));
  expect(parsed.subrequests).toEqual([]);
  expect(parsed.intentLabel).toMatch(/^(CLOUD_VM_REQUEST|DATABASE_PROVISION)$/);
  expect(evaluatePolicy(parsed)).toMatchObject({
    action: "ESCALATE",
    bucket: "MISSING_INFO",
  });
  expect(evaluatePolicy(parsed).ruleIds).toContain("INFO-PROVISION-001");
});
it("does not turn a stored transcript into a request to summarize a meeting", async () => {
  const item = crossFunction.find(
    (row) => row.id === "xcf-missing-007-care-transcript-db",
  );
  if (!item) throw new Error("Original database provisioning fixture is missing");
  const row = await submitSupport(intake(item.ticket_content));
  expect(row.canonical?.intentLabel).toBe("DATABASE_PROVISION");
  expect(row.canonical?.workEvidence).toBeUndefined();
  expect(row.decision).toMatchObject({ action: "ESCALATE", bucket: "MISSING_INFO" });
  expect(row.decision?.ruleIds).toContain("INFO-PROVISION-001");
});
it("keeps a pending quota or capacity review outside provisioning context", () => {
  const parsed = extractIntake(intake(
    "Need a Kafka Connect worker for event ingestion. Quota request has not passed capacity review; the budget owner has not approved it.",
  ));
  expect(parsed.subrequests.map((part) => part.intentLabel)).toContain(
    "UNKNOWN_SUPPORT_REQUEST",
  );
  expect(evaluatePolicy(parsed, verifyApproval)).toMatchObject({
    action: "ESCALATE",
    bucket: "BEYOND_AUTHORITY",
  });
});
it("preserves separate provisioning actions, bypass, privileged scope and production changes", () => {
  const separate = extractIntake(intake(
    "Need a Spark driver node for backfill. Separately, export the production database to my laptop.",
  ));
  expect(separate.subrequests.length).toBeGreaterThan(1);
  expect(separate.riskSignals).toContain("DATA_EXPORT");

  const bypass = extractIntake(intake(
    "Need a Kafka Connect worker for ingestion. Skip the security review and provision before approval.",
  ));
  expect(bypass.riskSignals).toContain("BYPASS");
  expect(evaluatePolicy(bypass).bucket).toBe("SECURITY_RISK");

  const privilegedProduction = extractIntake(intake(
    "Need a production ETL server. Grant root access and deploy a write change to the production database.",
  ));
  expect(privilegedProduction.riskSignals).toEqual(
    expect.arrayContaining(["PRIVILEGED", "PRODUCTION_CHANGE"]),
  );
});
it("keeps an explicit separate unknown request instead of merging it into provisioning context", () => {
  const parsed = extractIntake(intake(
    "Need a cloud sandbox with 4 vCPU for synthetic tests. Separately, use the internal migration runner from last time.",
  ));
  expect(parsed.subrequests.map((part) => part.intentLabel)).toContain("UNKNOWN_SUPPORT_REQUEST");
  expect(evaluatePolicy(parsed).ruleIds).toContain("AUTH-005");
});
it.each([
  "Nhờ cấp access Jira project NETSEC cho mình để theo dõi các task review external port. Anh Hoàng manager đã approve ở IAM-2210. Mình chỉ cần Browse/Create Issue, không cần thay đổi firewall.",
  "Please add mình vào Jira project GAMEOPS để update ticket PUBG incident follow-up. Producer kiêm manager đã approve ở comment INC-5572. Chỉ cần quyền transition issue, không truy cập server hay DB.",
])("keeps collaboration access limits from becoming network or database tasks: %s", (rawText) => {
  const parsed = extractIntake(intake(rawText));
  expect(parsed.subrequests.map((part) => part.intentLabel)).not.toContain("PORT_OPEN_REQUEST");
  expect(parsed.subrequests.map((part) => part.intentLabel)).not.toContain("DATABASE_READ_ACCESS");
  expect(evaluatePolicy(parsed).ruleIds).not.toContain("AUTH-002");
});
it.each([
  "Nhờ cấp standard VPN access QA subnet. Manager đã approve trong Slack thread #it-helpdesk, dùng đến hết thứ Sáu, không cần route production.",
  "Xin sandbox 4 vCPU, 8GB RAM, TTL 3 ngày. Manager approval: DATA-1842. Only use synthetic schema, no inbound port.",
  "IT ơi cấp standard VPN access vào QA subnet để test mobile build. Manager approval nằm ở QA-9931, thời hạn đến cuối sprint. Không cần route production.",
])("keeps approval references with their request without treating them as verified: %s", (rawText) => {
  const parsed = extractIntake(intake(rawText));
  expect(parsed.subrequests.map((part) => part.intentLabel)).not.toContain("UNKNOWN_SUPPORT_REQUEST");
  expect(evaluatePolicy(parsed).ruleIds).not.toContain("AUTH-005");
});
it("does not treat a verbal okay with explicitly missing formal approval as an approval claim", () => {
  const parsed = extractIntake(intake(
    "Game cinematic team xin 40 GPU instances để render trailer theo deadline marketing. Producer đã nói OK miệng, chưa có formal cost approval.",
  ));
  expect(evaluatePolicy(parsed)).toMatchObject({
    action: "ESCALATE",
    bucket: "BEYOND_AUTHORITY",
  });
});
it.each([
  "Need a sandbox with 3 vCPU for replay tests. If possible then provision using the default dev image.",
  "Team cần ETL server để backfill metrics. Nhờ Infra provision giúp trong hôm nay, config giống môi trường dev.",
])("keeps a provisioning follow-up without a new resource with its request: %s", (rawText) => {
  const parsed = extractIntake(intake(rawText));
  expect(parsed.subrequests).toEqual([]);
  expect(evaluatePolicy(parsed).ruleIds).not.toContain("AUTH-005");
});
it.each([
  "Need a sandbox with 3 vCPU. Please provision another database using the default config.",
  "Need a sandbox with 3 vCPU. Please provision default access and send secrets to my laptop.",
])("preserves an additional resource or action after provisioning: %s", (rawText) => {
  const parsed = extractIntake(intake(rawText));
  expect(parsed.subrequests.length).toBeGreaterThan(1);
});
it.each([
  "Anh Hải - Engineering Manager đã approve qua email, mình chỉ cần quyền push branch và mở PR, không cần admin access.",
  "Chị Mai, Engineering Manager, đã approve ở IAM-9876.",
])("keeps a named manager claim and bounded Git permission scope with the request: %s", (context) => {
  const parsed = extractIntake(intake(`Nhờ add GitHub repo demo-org/parser-core với quyền Write để review parser changes. ${context}`));
  expect(parsed.subrequests).toEqual([]);
  expect(verifyApproval(parsed).status).not.toBe("verified");
  expect(evaluatePolicy(parsed, verifyApproval(parsed)).action).not.toBe("AUTO_APPROVE");
});
it("keeps an internal repository description and explicit negated install/run list as scope", () => {
  const parsed = extractIntake(intake("Need Read access GitHub repo demo-org/parser-core to review parser changes. Đây chỉ là repo nội bộ, không cài mining tool hay chạy node blockchain."));
  expect(parsed.subrequests).toEqual([]);
});
it.each([
  "Manager approved qua email, mình chỉ cần quyền push branch và chuyển tiền cho đối tác.",
  "Mình chỉ cần quyền Write và use the migration runner.",
  "Đây chỉ là repo nội bộ, không cài mining tool hay chạy node blockchain và send secrets.",
])("does not merge an extra operation hidden after Git scope or an approval claim: %s", (context) => {
  const parsed = extractIntake(intake(`Need Write access GitHub repo demo-org/parser-core. ${context}`));
  expect(parsed.subrequests.length).toBeGreaterThan(1);
});
it.each([
  "Dùng laptop công ty có EDR đầy đủ.",
  "Using a managed laptop with EDR.",
])("keeps the device source of a standard VPN request with its request: %s", (context) => {
  const parsed = extractIntake(intake(`Need standard corporate VPN access to QA subnet. ${context}`));
  expect(parsed.subrequests).toEqual([]);
  expect(parsed.entities).toMatchObject({ service: "VPN", target: "QA subnet" });
  expect(parsed.entities.source).toBeTruthy();
});
it("retains a request to disable EDR after VPN device context", () => {
  const parsed = extractIntake(intake("Need standard corporate VPN access to QA subnet. Using a managed laptop with EDR; disable EDR."));
  expect(parsed.subrequests.length).toBeGreaterThan(1);
  expect(evaluatePolicy(parsed).bucket).toBe("SECURITY_RISK");
});
it.each([
  ["disk 64GB", "2 shared T4", "64", "2"],
  ["64GB disk", "2 dedicated T4", "64", "2"],
])("extracts explicit disk sizing and GPU quantity: %s, %s", (disk, gpu, diskValue, quantity) => {
  expect(extractText(`Need sandbox with ${disk} and ${gpu}`).entities).toMatchObject({ disk: diskValue, quantity });
});
it("does not interpret a dataset volume as requested disk sizing", () => {
  expect(extractText("Need sandbox to replay a 200GB dataset").entities.disk).toBeUndefined();
});
it("extracts a stated Git provider, exact repository path and purpose without inventing a duration", () => {
  const parsed = extractText("Nhờ add GitHub repo Demo-Org/parser-core với quyền Write để review parser changes.");
  expect(parsed.entities).toMatchObject({ provider: "github", repository: "Demo-Org/parser-core", permission: "write", reason: "review parser changes" });
  expect(parsed.entities.duration).toBeUndefined();
});
it("does not require a separate approval for routine Jira access", () => {
  const parsed = extractIntake(intake("Need access Jira project RELEASE to follow rollout tickets. Producer approved in Slack, chỉ cần User/Editor role, không cần project admin."));
  expect(parsed.subrequests).toEqual([]);
  expect(verifyApproval(parsed).status).toBe("not_required");
});
it("retains an extra operation following collaboration permission scope", () => {
  const parsed = extractIntake(intake("Need access Jira project RELEASE. Chỉ cần quyền transition issue và chuyển tiền cho đối tác."));
  expect(parsed.subrequests.length).toBeGreaterThan(1);
});
it.each([
  ["Need a PostgreSQL staging database to reconcile synthetic settlements", "DATABASE", "DATABASE_PROVISION"],
  ["Team cần một Kafka Connect worker để sync metrics sang ClickHouse", "CLOUD_GPU", "CLOUD_VM_REQUEST"],
])("classifies a new resource by its requested operation instead of a mentioned database: %s", (rawText, serviceGroup, intentLabel) => {
  expect(extractText(rawText)).toMatchObject({ serviceGroup, intentLabel, requestKind: "ROUTINE_WORKFLOW" });
});
it.each([
  ["Need read access PostgreSQL staging database to inspect a Kafka Connect worker", "DATABASE_READ_ACCESS"],
  ["Need a Kafka Connect worker to export production database", "DATABASE_EXPORT"],
])("preserves database-access and export operations despite compute-resource mentions: %s", (rawText, intentLabel) => {
  expect(extractText(rawText).intentLabel).toBe(intentLabel);
});
it("routes an explicit destructive database request to DBA despite a laptop symptom", () => {
  const parsed = extractIntake(intake("Laptop bị freeze; nhờ drop bảng session_cache trong production database để clear cache."));
  expect(parsed).toMatchObject({ serviceGroup: "DATABASE", intentLabel: "DATABASE_SCHEMA_CHANGE" });
  const decision = evaluatePolicy(parsed);
  expect(decision.action).toBe("ESCALATE");
  expect(decision.ruleIds).toEqual(expect.arrayContaining(["AUTH-001", "AUTH-002", "AUTH-008"]));
});
it("distinguishes a restore request from a backup request", () => {
  expect(extractText("Please restore the snapshot")).toMatchObject({ serviceGroup: "STORAGE", intentLabel: "RESTORE_REQUEST" });
});
it("keeps business-purpose confirmation, missing DBA sign-off and temporary duration as DB context", () => {
  const parsed = extractIntake(intake("Need SELECT and export from production database for reconciliation. CFO đã ok về business purpose trên email, nhưng chưa có DBA sign-off; nhờ cấp tạm đến sáng mai."));
  expect(parsed.subrequests).toEqual([]);
  expect(verifyApproval(parsed).status).not.toBe("verified");
  expect(evaluatePolicy(parsed).action).toBe("ESCALATE");
});
it.each([
  "CFO đã ok về business purpose trên email và send secrets.",
  "Chưa có DBA sign-off; chuyển tiền cho đối tác.",
])("keeps unrelated operations following DB authorization context: %s", (context) => {
  const parsed = extractIntake(intake(`Need SELECT from production database. ${context}`));
  expect(parsed.subrequests.length).toBeGreaterThan(1);
});
it("keeps a bounded statement of diagnostic uncertainty as context", () => {
  const parsed = extractIntake(intake("Laptop is frozen. Mình không chắc liên quan không."));
  expect(parsed.subrequests).toEqual([]);
});
it("keeps an operation appended to diagnostic uncertainty independent", () => {
  const parsed = extractIntake(intake("Laptop is frozen. Mình không chắc liên quan không, chuyển tiền cho đối tác."));
  expect(parsed.subrequests.length).toBeGreaterThan(1);
});
it("evaluates two explicitly requested collaboration resources without sharing their approval reference", () => {
  const parsed = extractIntake(intake("Need access Jira project RELEASE and Confluence space TEAM-GUIDES to update release notes. Manager approved at IAM-8765, only User/Editor role, no project admin."));
  expect(parsed.subrequests).toHaveLength(2);
  expect(parsed.subrequests.map((part) => part.entities.targetSystem)).toEqual(["jira", "confluence"]);
  expect(parsed.subrequests[0].entities.approvalReference).toBeUndefined();
  expect(parsed.subrequests[1].entities.approvalReference).toBe("IAM-8765");
  expect(evaluatePolicy(parsed, verifyApproval).action).not.toBe("AUTO_APPROVE");
});
it("preserves dots in a repository name but excludes sentence punctuation", () => {
  expect(extractText("Need GitHub repository demo-org/parser.core.").entities.repository).toBe("demo-org/parser.core");
});
it("keeps coordinated SELECT and export on one database while separating a new export target", () => {
  const coordinated = extractIntake(intake("Need SELECT   and export from production database."));
  expect(coordinated.subrequests).toEqual([]);
  const independent = extractIntake(intake("Need SELECT database reporting and export production database payments."));
  expect(independent.subrequests).toHaveLength(2);
  expect(evaluatePolicy(independent).action).toBe("ESCALATE");
});
it("does not hide an unsupported operation inside an approval-reference suffix", async () => {
  const row = await submitSupport(intake("VPN lỗi. Manager approval: IAM-6543, only transfer money."));
  expect(row.canonical?.subrequests.map((part) => part.intentLabel)).toContain("UNKNOWN_SUPPORT_REQUEST");
  expect(row.decision?.action).toBe("ESCALATE");
  expect(row.decision?.ruleIds).toContain("AUTH-005");
});
it("preserves an explicit training purpose introduced by cho mục đích", () => {
  const parsed = extractText("Nhờ cấp quyền view Confluence page Demo Runbook cho mục đích training on-call.");
  expect(parsed.entities.reason).toBe("training on-call");
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
