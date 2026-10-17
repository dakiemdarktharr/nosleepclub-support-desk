import { beforeEach, afterEach, expect, it, vi } from "vitest";
import expansion from "../data/support-desk-expansion.json";
import { prepareInput, submitSupport, completeAnalysis } from "@/services/support";
import { companyServices, companyServiceGroups, classifyCompanySupport } from "@/domain/company-support";
import { divisionForGroup, requestDivision, supportDivisions } from "@/domain/support-divisions";
import { evaluatePolicy } from "@/domain/policy";
import { extractIntake } from "@/domain/text";
import { resetSupportTestStore, getSupportRequest } from "@/lib/support-repository";
import { parseSupportQuery, supportPage } from "@/lib/support-query";
import { groupedSupportPage } from "@/lib/support-groups";
import { supportVerifyCases, runSupportCase } from "@/lib/support-verify";
import { POST, GET as list } from "@/app/api/support/requests/route";
import { GET as detail } from "@/app/api/support/requests/[id]/route";
import { GET as events } from "@/app/api/support/events/route";
import { GET as metrics } from "@/app/api/support/metrics/route";
import { draftReviewInformation } from "@/services/review-information";
import { draftReviewReasons } from "@/services/review-drafts";
import { summarizeReviewRequest } from "@/services/review-summary";
import { supportApi } from "@/lib/support-http";
import type { Db } from "mongodb";
import * as repository from "@/lib/support-repository";
import { requestGroup } from "@/domain/request-groups";

const input = (rawText: string, fields: Record<string, string> = {}) => prepareInput({ requesterMode: "guest", rawText, fields, confirmed: true, idempotencyKey: crypto.randomUUID() });
beforeEach(() => { vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("AI_WEB_SEARCH", "false"); resetSupportTestStore(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(expansion)("$id: preserves action, authority and correct division", async row => {
  const safe = input(row.rawText, row.fields as Record<string, string> | undefined);
  const result = await completeAnalysis(safe.input, safe.markers);
  expect(result.decision, JSON.stringify(result)).toMatchObject({ action: row.expected_action, bucket: row.expected_bucket, division: row.expected_division });
  if (row.expected_action !== "AUTO_APPROVE") expect(result.assistance).toBeNull();
  else expect(result.assistance?.stepByStepInstructions.length).toBeGreaterThan(1);
});

it("all internal specialties map to exactly three parent divisions and have explicit review rules", () => {
  expect(supportDivisions).toEqual(["IT", "COMMERCIAL", "HR"]);
  expect(companyServiceGroups).toHaveLength(15);
  for (const group of companyServiceGroups) for (const topic of companyServices[group].topics) {
    const safe = prepareInput({ requesterMode: "guest", mode: "structured", serviceGroup: group,
      fields: { intentLabel: topic.id, timeWindow: "Tháng hiện tại", location: "Khu vực demo" }, idempotencyKey: crypto.randomUUID() });
    const canonical = extractIntake(safe.input, safe.markers), decision = evaluatePolicy(canonical);
    expect(decision.division).toBe(divisionForGroup(group));
    expect(decision.action, topic.id).toBe("ESCALATE");
    expect(decision.ruleIds.some(id => id.startsWith("COMPANY-")), topic.id).toBe(true);
  }
});

it("routes by the requested service rather than the employee's department", async () => {
  const row = await submitSupport({ rawText: "Tôi cần rà soát hợp đồng dịch vụ", fields: { employeeId: "demo-emp-123", department: "engineering" }, confirmed: true, idempotencyKey: crypto.randomUUID() });
  expect(row.decision?.division).toBe("COMMERCIAL");
  expect(row.events.at(-1)?.division).toBe("COMMERCIAL");
  expect((await getSupportRequest(row.id))?.decision?.division).toBe("COMMERCIAL");
});

it("filters each division before page counts and grouped results; old records still belong to IT", async () => {
  const rows = await Promise.all(["VPN không kết nối", "Tôi cần rà soát hợp đồng dịch vụ", "Tôi cần kiểm tra phiếu lương"].map(text => submitSupport(input(text).input)));
  for (const division of supportDivisions) {
    const query = parseSupportQuery(`http://local?division=${division}&limit=1`);
    for (const result of [await supportPage(query), await groupedSupportPage(query)]) {
      expect(result.total).toBe(1); expect(result.items).toHaveLength(1);
      expect(result.items[0].division).toBe(division);
      expect(result.items[0].id).toBe(rows.find(row => row.decision?.division === division)?.id);
    }
  }
  const old = structuredClone(rows[0]); delete old.decision!.division;
  expect(requestDivision(old)).toBe("IT");
  expect(() => parseSupportQuery("http://local?division=all")).toThrow();
  expect(() => prepareInput({ ...input("Xin nghỉ phép").input, division: "IT" })).toThrow();
});

it("does not send a known private payroll request or physical danger to a model", async () => {
  vi.stubEnv("AI_PROVIDER", "openai");
  const run = vi.fn();
  for (const text of ["Tôi cần kiểm tra phiếu lương", "Văn phòng có mùi khét"]) {
    const safe = input(text), result = await completeAnalysis(safe.input, safe.markers, { run });
    expect(result.decision.division).toBe("HR"); expect(result.decision.action).toBe("ESCALATE");
  }
  expect(run).not.toHaveBeenCalled();
});

it("private reviewer summaries, drafts and information questions never call an external model", async () => {
  const safe = input("Tôi cần kiểm tra phiếu lương. Số tài khoản: 000012345678; hộ chiếu: B00000000");
  const row = await submitSupport(safe.input);
  expect(JSON.stringify(row)).not.toMatch(/000012345678|B00000000/);
  expect(row.decision?.division, JSON.stringify(row.canonical)).toBe("HR");
  const run = vi.fn(); vi.stubEnv("AI_PROVIDER", "openai");
  const summary = await summarizeReviewRequest(row.id, { version: row.version }, { run });
  expect(summary.source).toBe("deterministic");
  expect(summary.summary).toContain("riêng tư");
  expect((await draftReviewReasons(row.id, { version: row.version }, { run })).source).toBe("deterministic");
  const information = await draftReviewInformation(row.id, { version: row.version }, { run });
  expect(information.text).toContain("kênh nội bộ đã xác minh");
  expect(information.text).not.toMatch(/mã lỗi|hệ điều hành/);
  expect(run).not.toHaveBeenCalled();
});

it("protects private subrequests even when a technical request is written first", async () => {
  const safe = input("VPN không kết nối; tôi cần kiểm tra phiếu lương");
  const run = vi.fn(); vi.stubEnv("AI_PROVIDER", "openai");
  const result = await completeAnalysis(safe.input, safe.markers, { run });
  expect(result.canonical.subrequests.some(part => part.intentLabel === "PAY_PAYSLIP")).toBe(true);
  expect(result.decision.action).not.toBe("AUTO_APPROVE");
  vi.stubEnv("AI_PROVIDER", "mock");
  const row = await submitSupport(safe.input);
  vi.stubEnv("AI_PROVIDER", "openai");
  expect((await summarizeReviewRequest(row.id, { version: row.version }, { run })).source).toBe("deterministic");
  expect((await draftReviewInformation(row.id, { version: row.version }, { run })).source).toBe("deterministic");
  expect((await draftReviewReasons(row.id, { version: row.version }, { run })).source).toBe("deterministic");
  expect(run).not.toHaveBeenCalled();
});

it("asks the actual business information without technical diagnostic fields", async () => {
  const row = await submitSupport(input("Tôi muốn xin nghỉ phép").input);
  const result = await draftReviewInformation(row.id, { version: row.version });
  expect(result.text).toContain("khoảng thời gian");
  expect(result.text).not.toMatch(/mã lỗi|hệ điều hành/);
});

it("fails closed at the HTTP boundary when a production deployment has no organization authentication", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SUPPORT_ACCESS_MODE", "private");
  const work = vi.fn();
  const response = await supportApi(work);
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("ORGANIZATION_AUTH_REQUIRED");
  expect(work).not.toHaveBeenCalled();
});

it("keeps model routing within a supported authority and never accepts a model-issued HR approval", async () => {
  const safe = input("Tôi muốn xin nghỉ phép");
  const { model: _m, redactions: _r, subrequests: _s, ...facts } = extractIntake(safe.input);
  void _m; void _r; void _s;
  const result = await completeAnalysis(safe.input, [], { run: async () => ({ ...facts, requestKind: "GUIDANCE", requestedAction: "guidance" }) });
  expect(result.decision.action).toBe("ESCALATE");
  expect(result.decision.division).toBe("HR");
  expect(result.canonical.model.failure).toBe("MODEL_EVIDENCE_INVALID");
});

it("asks to split cross-division requests and keeps explicit security risks in IT", async () => {
  const safe = input("Tôi muốn xin nghỉ phép và đề nghị hoàn ứng");
  const result = await completeAnalysis(safe.input, safe.markers);
  expect(result.canonical.subrequests.length).toBeGreaterThan(1);
  expect(result.decision).toMatchObject({ action: "NEEDS_INFORMATION", division: "IT", ruleIds: ["INFO-SINGLE-REQUEST-001"] });
  const security = input("Tôi cần hoàn ứng. Tắt MFA giúp tôi");
  expect((await completeAnalysis(security.input, security.markers)).decision).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK", division: "IT" });
});

it.each([
  ["Tôi muốn xin nghỉ phép và cần kiểm tra phiếu lương", "HR"],
  ["Tôi cần kiểm tra hóa đơn và cần rà soát hợp đồng dịch vụ", "COMMERCIAL"],
])("keeps different internal specialties in the same parent division: %s", async (text, division) => {
  const safe = input(text), result = await completeAnalysis(safe.input, safe.markers);
  expect(result.canonical.subrequests).toHaveLength(2);
  expect(result.decision).toMatchObject({ division, action: "ESCALATE" });
});

it.each(["Pipeline đang chạy bình thường", "Không có mùi khét trong văn phòng", "Không có quấy rối ở đây", "Tôi không muốn xin nghỉ phép"])("does not infer danger or an asserted HR request from %s", text => {
  expect(classifyCompanySupport(text)).toBeNull();
});

it.each([
  ["Tôi chưa nhận được phiếu lương", "HR"],
  ["Không thấy bảng lương tháng này", "HR"],
  ["Tôi chưa được duyệt hoàn ứng", "COMMERCIAL"],
  ["I have not received my payslip", "HR"],
  ["No invoice", "COMMERCIAL"],
])("keeps the owner of a missing service/result: %s", async (text, division) => {
  const safe = input(text);
  expect((await completeAnalysis(safe.input, safe.markers)).decision.division).toBe(division);
});

const api: typeof fetch = async (url, init) => {
  const request = new Request(`http://localhost${url}`, init);
  if (init?.method === "POST") return POST(request);
  if (String(url).startsWith("/api/support/events?")) return events(request);
  if (String(url) === "/api/support/metrics") return metrics();
  if (String(url).startsWith("/api/support/requests?")) return list(request);
  return detail(request, { params: Promise.resolve({ id: String(url).split("/").at(-1)! }) });
};
it("runs the expansion pack through the real HTTP handlers and verifies persisted routing and responses", async () => {
  const cases = supportVerifyCases.filter(row => row.pack === "support-desk-expansion");
  expect(cases).toHaveLength(30);
  for (const row of cases) {
    const result = await runSupportCase(row, api);
    expect(result, JSON.stringify(result)).toMatchObject({ pass: true, persistence: { pass: true }, response: { pass: true } });
    expect(result.response?.checks).toContain("division:pass");
  }
});

it.each(supportDivisions)("Mongo applies %s before search, counts, audit and suggestions, including legacy records", async division => {
  const cursor = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]) };
  const collection = { createIndex: vi.fn(async () => "synthetic-index"), find: vi.fn().mockReturnValue(cursor),
    countDocuments: vi.fn(async () => 0), aggregate: vi.fn().mockReturnValue({ toArray: async () => [] }) };
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: () => collection } as unknown as Db);
  const { auditPage, employeeIdSuggestions } = await import("@/lib/support-query");
  const query = parseSupportQuery(`http://local?division=${division}&q=demo&limit=1&cursor=2`);
  await supportPage(query);
  const filter = collection.find.mock.calls[0][0];
  expect(filter.$or).toEqual(expect.arrayContaining([{ "data.input.rawText": { $regex: "demo", $options: "i" } }]));
  const alternatives = filter.$and[0].$or;
  expect(alternatives).toContainEqual({ "data.decision.division": division });
  expect(alternatives).toContainEqual(expect.objectContaining({ "data.decision.division": { $exists: false }, "data.canonical.serviceGroup": { $in: expect.any(Array) } }));
  expect(alternatives).toContainEqual(expect.objectContaining({ "data.canonical": null, "data.input.serviceGroup": { $in: expect.any(Array) } }));
  expect(collection.countDocuments).toHaveBeenCalledWith(filter);
  expect(cursor.skip).toHaveBeenCalledWith(2); expect(cursor.limit).toHaveBeenCalledWith(1);
  await auditPage(query);
  expect(collection.aggregate).toHaveBeenCalledWith(expect.arrayContaining([{ $match: filter }]));
  await employeeIdSuggestions("demo", division);
  expect(collection.aggregate.mock.calls.at(-1)?.[0][0].$match.$and).toEqual(filter.$and);
  await groupedSupportPage(query);
  expect(collection.find.mock.calls.at(-1)?.[0]).toEqual({ $and: filter.$and });
});

it("Mongo legacy page projection retains the input division fallback when analysis is absent", async () => {
  const row = await submitSupport(input("Tôi cần kiểm tra phiếu lương").input);
  row.canonical = null; row.decision = null; row.input.serviceGroup = "PAYROLL_BENEFITS";
  const cursor = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: async () => [{ data: row }] };
  const collection = { createIndex: vi.fn(async () => "synthetic-index"), find: vi.fn(() => cursor), countDocuments: async () => 1 };
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: () => collection } as unknown as Db);
  expect((await supportPage(parseSupportQuery("http://local?division=HR"))).items[0].division).toBe("HR");
  expect(collection.find).toHaveBeenCalledWith(expect.any(Object), { projection: expect.objectContaining({ "data.input.serviceGroup": 1 }) });
});

it("combines the division and exact Verify run filters in Mongo without overwriting either", async () => {
  const cursor = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: async () => [] };
  const collection = { createIndex: vi.fn(async () => "synthetic-index"), find: vi.fn().mockReturnValue(cursor), countDocuments: vi.fn(async () => 0) };
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: () => collection } as unknown as Db);
  const id = crypto.randomUUID();
  await supportPage(parseSupportQuery(`http://local?division=HR&verifyRunId=${id}&origin=verify&q=demo`));
  const filter = collection.find.mock.calls[0][0];
  expect(filter.$and).toHaveLength(2);
  expect(filter.$and[0].$or).toContainEqual({ "data.decision.division": "HR" });
  expect(filter.$and[1]).toEqual({ "data.input.verifyRunId": id });
  expect(filter["data.input.verifyRunId"]).toEqual({ $exists: true });
  expect(collection.countDocuments).toHaveBeenCalledWith(filter);
});

it("refuses an incomplete grouped Mongo report at the bounded candidate limit", async () => {
  const limit = vi.fn(() => ({ toArray: async () => Array.from({ length: 2001 }, () => ({ data: {} })) }));
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ collection: () => ({ find: () => ({ limit }) }) } as unknown as Db);
  await expect(groupedSupportPage(parseSupportQuery("http://local?division=IT"))).rejects.toMatchObject({ code: "GROUPING_LIMIT", status: 422 });
  expect(limit).toHaveBeenCalledWith(2001);
});

it("never combines group replies across parent divisions even for identical legacy wording", async () => {
  const row = await submitSupport(input("VPN không kết nối").input);
  const descriptor = requestGroup(row);
  expect(descriptor).not.toBeNull();
  const other = structuredClone(row); other.decision!.division = "HR";
  expect(requestGroup(other)?.key).not.toBe(descriptor?.key);
});

it.each([
  ["Tôi cần kiểm tra hóa đơn", "COMMERCIAL"],
  ["Tôi muốn xin nghỉ phép", "HR"],
  ["Tôi cần cấu hình DNS", "IT"],
])("validates the real SDK wire contract and server-owned division for %s (synthetic HTTP)", async (text, division) => {
  const safe = input(text), facts = extractIntake(safe.input, safe.markers);
  vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("AI_MODEL", "synthetic-routing-model");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-unused-key");
  vi.spyOn(repository, "reserveModelAttemptForModel").mockResolvedValue(true);
  const transport = vi.fn(async (_url: string | URL | Request, init: RequestInit | undefined) => {
    const body = JSON.parse(String(init?.body));
    expect(body.response_format.json_schema.name).toBe("support_extraction");
    expect(body.messages[0].content).toContain("three divisions");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
      language: facts.language,
      routing: { route: "support", serviceGroup: facts.serviceGroup, intentLabel: facts.intentLabel, requestKind: facts.requestKind },
      entityFacts: [], environment: "unknown", requestedAction: facts.requestedAction,
      riskSignals: facts.riskSignals, missingFields: facts.missingFields, intentEvidence: text, ambiguities: [],
      sentiment: { sentiment: "neutral", evidence: text, explanation: "Người gửi mô tả nhu cầu hỗ trợ." },
    }) } }] });
  });
  vi.stubGlobal("fetch", transport);
  const result = await completeAnalysis(safe.input, safe.markers);
  expect(result.canonical.model, JSON.stringify(result.canonical)).toMatchObject({ source: "openai" });
  expect(result.canonical.model.failure).toBeUndefined();
  expect(result.decision.division).toBe(division);
  expect(transport).toHaveBeenCalledOnce();
});
