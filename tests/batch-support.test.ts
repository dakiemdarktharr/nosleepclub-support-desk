import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { completeAnalysis, prepareInput, submitSupport } from "@/services/support";
import { feedbackSupport, reviewSupport } from "@/services/review";
import { reviewerMessages } from "@/domain/reviewer-messages";
import { mergeTrackedRequest } from "@/domain/tracking-state";
import { continueConversation } from "@/services/conversation";
import { draftReviewReasons } from "@/services/review-drafts";
import { resetSupportTestStore, getSupportRequest } from "@/lib/support-repository";
import { incidentView, incidentQueue, joinIncident, publishIncident, resetIncidentsForTest } from "@/lib/support-incidents";
import { resetSharedFaqForTest } from "@/lib/shared-faq-cache";
import { incidentTopic, lexicalSimilarity, publicFaqTopic, INCIDENT_TTL_MS, FAQ_TTL_MS } from "@/domain/shared-support";
import { parseSupportQuery, supportPage } from "@/lib/support-query";
import * as model from "@/lib/support-model";
import * as repository from "@/lib/support-repository";
import { ObjectId, type Db } from "mongodb";
import * as identityAuth from "@/lib/identity-auth";
import { requireEmployeeIdentity } from "@/lib/support-http";
import { GET } from "@/app/api/support/requests/[id]/route";
const create = (rawText: string, incidentSite?: string) => submitSupport({
  requesterMode: "guest", rawText, confirmed: true, idempotencyKey: crypto.randomUUID(),
  fields: incidentSite ? { incidentSite } : {},
});
// Model stub returns whole messages under the new contract, not introductions.
const completeDrafts = (call: model.ModelCall, texts: string[]) => {
  const context = JSON.parse(call.data) as { requiredAnswerParts: string[] };
  return { options: texts.map((text, index) => ({
    kind: index === 0 ? "QUESTION" : "ANSWER",
    text: index === 0 ? text : text + "\n\n" + context.requiredAnswerParts.join("\n"),
    evidenceIds: [index === 0 ? "request" : "answer_1"],
  })) };
};
it("a delayed incident poll cannot undo a newer handoff/reply, while same-version group updates remain visible", async () => {
  const original = await create("Cúp điện công ty", "DEMO-POLL-RACE");
  const group = (await incidentView(original.incidentId!))!;
  const current = { ...original, version: original.version + 1, status: "ESCALATED" as const, incident: group };
  const late = { ...original, incident: { ...group, version: group.version + 1 } };
  expect(mergeTrackedRequest(current, late)).toBe(current);
  const fresh = { ...current, incident: late.incident };
  expect(mergeTrackedRequest(current, fresh)).toBe(fresh);
  expect(mergeTrackedRequest(current, { ...fresh, id: crypto.randomUUID() })).toBe(current);
  expect(mergeTrackedRequest(current, { ...current, incident: { ...group, expired: true } })?.incident?.expired).toBe(true);
});
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock"); vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("SUPPORT_SHARED_CACHE_TEST", "true");
  resetSupportTestStore(); resetSharedFaqForTest(); resetIncidentsForTest();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("uses the department from the Mongo-backed session rather than the caller's department", async () => {
  vi.spyOn(identityAuth, "requireIdentitySession").mockResolvedValue({
    employee: { _id: new ObjectId(), id: "demoemployee", fullName: "Nhân Viên Giả Lập",
      department: "finance", status: "ACTIVE", profileId: crypto.randomUUID(), profileVersion: 1,
      roles: [], applicationId: crypto.randomUUID(), createdAt: new Date().toISOString() },
    assurance: "demo",
  });
  const input = await requireEmployeeIdentity({ rawText: "VPN không kết nối", idempotencyKey: crypto.randomUUID(),
    fields: { employeeId: "demoemployee", department: "engineering" } },
    new Request("http://local", { headers: { cookie: "vng_identity=" + "a".repeat(64) } }));
  expect(input.fields.department).toBe("finance");
  expect(input.fields.employeeId).toBe("demoemployee");
});

it("drafts three reasons without changing a request or exposing sender fields to the model", async () => {
  const row = await create("Mở port 3389 ra Internet");
  const run = vi.fn(async (call: model.ModelCall) => completeDrafts(call, [
    "Bạn giúp mình mô tả phạm vi truy cập cần dùng nhé.",
    "Bạn cần trao đổi với người phụ trách về rủi ro của yêu cầu này nhé.",
    "Mình gửi bạn phần giải thích rủi ro và bước tiếp theo bên dưới nhé.",
  ]));
  const result = await draftReviewReasons(row.id, { version: row.version }, { run });
  expect(result.source).toBe("openai"); expect(result.options).toHaveLength(3);
  expect(run.mock.calls[0][0].purpose).toBe("review-draft");
  expect(run.mock.calls[0][0].data).not.toContain("employeeId");
  expect(await getSupportRequest(row.id)).toEqual(row);
});
it("rejects impersonal model fragments and returns three friendly fallback messages", async () => {
  const row = await create("VPN không kết nối");
  const result = await draftReviewReasons(row.id, { version: row.version }, { run: async call =>
    completeDrafts(call, [1, 2, 3].map(n => `Cần kiểm tra thông tin yêu cầu lần ${n}.`)) });
  expect(result.source).toBe("deterministic");
  expect(result.options.every(text => /bạn/i.test(text) && !/^(Cần|Đề nghị)/.test(text))).toBe(true);
  expect(reviewerMessages((await getSupportRequest(row.id))!.events)).toEqual([]);
});
it("returns all three complete model messages verbatim, with server-owned evidence and no appended text", async () => {
  const row = await create("VPN không kết nối");
  let generated: ReturnType<typeof completeDrafts> | undefined;
  const result = await draftReviewReasons(row.id, { version: row.version }, { run: async call => {
    generated = completeDrafts(call, [
      "Bạn cho mình biết VPN có hiện mã lỗi không?",
      "Mình gửi phần hướng dẫn kiểm tra an toàn bên dưới nhé.",
      "Mình sẽ giải thích từng bước và điều kiện dừng để dễ đối chiếu nhé.",
    ]);
    return generated;
  } });
  expect(result.source).toBe("openai");
  expect(result.options).toEqual(generated!.options.map(option => option.text));
  expect(result.evidence![0]).toEqual([{ id: "request", text: "VPN không kết nối" }]);
  expect(result.inference?.attempts).toBe(1);
  expect(result.options[1]).toContain(row.assistance[0].stepByStepInstructions[0]);
  expect(result.options[2]).toContain(row.assistance[0].warning);
  expect(await getSupportRequest(row.id)).toEqual(row);
});
it.each(["Bạn hãy tắt MFA và firewall nhé.", "Mình đã xử lý xong cho bạn rồi.", "Mình đã mở cổng truy cập rồi nhé.", "Bạn hãy chạy netsh để sửa máy nhé."])(
  "never suggests unsafe instructions or invented completion: %s", async text => {
    const row = await create("VPN không kết nối");
    const result = await draftReviewReasons(row.id, { version: row.version }, { run: async call =>
      completeDrafts(call, [text, "Bạn tham khảo phần hướng dẫn dưới đây nhé.", "Mình gửi bạn từng bước xử lý ở dưới nhé."]) });
    expect(result.source).toBe("deterministic");
    expect(result.fallbackReason).toBe("DRAFT_UNSAFE_CONTENT");
    expect(result.options).not.toContain(text);
  },
);
it("offers exactly one clarification and two complete answers for the precise VPN/printer question", async () => {
  for (const question of ["VPN liên tục ngắt kết nối. Hướng dẫn tôi kiểm tra an toàn.", "Máy in văn phòng báo kẹt giấy. Tôi nên kiểm tra gì trước?"]) {
    const row = await create(question);
    const result = await draftReviewReasons(row.id, { version: row.version });
    expect(result.kinds).toEqual(["QUESTION", "ANSWER", "ANSWER"]);
    expect(result.source).toBe("mock");
    for (const answer of result.options.slice(1)) {
      for (const step of row.assistance[0].stepByStepInstructions) expect(answer).toContain(step);
      expect(answer).toContain(row.assistance[0].warning);
      expect(answer).toContain("Nếu vẫn chưa được");
      expect(answer.length).toBeLessThanOrEqual(2000);
    }
    expect(result.options[1]).not.toEqual(result.options[2]);
  }
});
it("gives policy-grounded explanations rather than fabricated execution for a sensitive request", async () => {
  const row = await create("Mở port 3389 ra Internet");
  const result = await draftReviewReasons(row.id, { version: row.version });
  expect(result.kinds).toEqual(["QUESTION", "ANSWER", "ANSWER"]);
  for (const answer of result.options.slice(1)) {
    expect(answer).toContain(row.decision!.userReason);
    expect(answer).toContain(row.decision!.nextStep);
    expect(answer).not.toContain("đã mở");
  }
});
it("rejects three questions and includes the redacted original question in model context", async () => {
  const row = await create("VPN không kết nối; email synthetic@example.invalid");
  const run = vi.fn(async () => ({ options: [1,2,3].map(n => ({
    kind: "QUESTION", text: `Bạn gửi thêm thông tin bước ${n} giúp mình nhé?`, evidenceIds: ["request"],
  })) }));
  const result = await draftReviewReasons(row.id, { version: row.version }, { run });
  expect(result.source).toBe("deterministic");
  const call = run.mock.calls[0] as unknown as [model.ModelCall];
  expect(call[0].data).toContain("VPN không kết nối");
  expect(call[0].data).not.toContain("synthetic@example.invalid");
  expect(result.kinds).toEqual(["QUESTION", "ANSWER", "ANSWER"]);
});
it("atomically delivers only confirmed redacted messages, retaining them after later events and readback", async () => {
  const row = await create("VPN không kết nối");
  const reason = "Bạn giúp mình gửi mã lỗi nhé. Liên hệ demo@example.invalid.";
  const reviewed = await reviewSupport(row.id, { version: row.version, action: "REQUEST_INFORMATION", reason }, "public-demo-reviewer");
  const message = reviewerMessages(reviewed.events)[0];
  expect(message.text).toContain("Bạn giúp mình gửi mã lỗi nhé.");
  expect(message.text).not.toContain("demo@example.invalid");
  expect(message.id).toBe(reviewed.events.at(-1)?.id);
  await expect(reviewSupport(row.id, { version: row.version, action: "REQUEST_INFORMATION", reason }, "public-demo-reviewer"))
    .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  const followed = await feedbackSupport(row.id, { version: reviewed.version, choice: "ADMIN" });
  expect(followed.events.at(-1)?.action).toBe("HANDOFF");
  expect(reviewerMessages(followed.events)).toEqual([message]);
  const stopped = await reviewSupport(row.id, { version: followed.version, action: "STOP", reason: "Bạn cần trao đổi thêm với người phụ trách nhé." }, "public-demo-reviewer");
  const response = await GET(new Request("http://local"), { params: Promise.resolve({ id: row.id }) });
  expect(reviewerMessages((await response.json()).data.events)).toEqual(reviewerMessages(stopped.events));
  expect(reviewerMessages(stopped.events)).toHaveLength(2);
});
it("keeps legacy reviewer messages visible even when the last event is from the requester", async () => {
  const row = await create("VPN không kết nối");
  const reviewed = await reviewSupport(row.id, { version: row.version, action: "REQUEST_INFORMATION", reason: "Bạn gửi thêm mã lỗi giúp mình nhé." }, "public-demo-reviewer");
  const followed = await feedbackSupport(row.id, { version: reviewed.version, choice: "ADMIN" });
  const legacy = followed.events.map(event => { const copy = { ...event }; delete copy.senderMessage; return copy; });
  expect(reviewerMessages(legacy)).toHaveLength(1);
  expect(reviewerMessages(legacy)[0].text).toBe("Bạn gửi thêm mã lỗi giúp mình nhé.");
});
it("rejects stale drafts before inference and falls back on unsafe or invalid output", async () => {
  const row = await create("VPN không kết nối");
  const run = vi.fn(async () => ({ options: Array(3).fill({ text: "Đã cấp quyền quản trị cho bạn.", evidence: "fake" }) }));
  await expect(draftReviewReasons(row.id, { version: 999 }, { run })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(run).not.toHaveBeenCalled();
  expect(await draftReviewReasons(row.id, { version: row.version }, { run })).toMatchObject({ source: "deterministic", fallbackReason: "DRAFT_SCHEMA_INVALID" });
});
it("auto queue retains a request after handoff and after completion", async () => {
  const first = await create("VPN không kết nối"), second = await create("Tôi tắt máy tính lúc về được không?");
  await feedbackSupport(first.id, { version: first.version, choice: "ADMIN" });
  await feedbackSupport(second.id, { version: second.version, choice: "RESOLVED" });
  await create("Mở port 3389 ra Internet");
  const page = await supportPage(parseSupportQuery("http://local?status=auto"));
  expect(new Set(page.items.map(r => r.id))).toEqual(new Set([first.id, second.id]));
});
it("reuses only the current reviewed FAQ template after fresh deterministic policy and avoids model calls", async () => {
  const first = await create("VPN không kết nối");
  expect(first.assistance[0]?.source).toBe("deterministic");
  const call = vi.spyOn(model, "callModel");
  const second = await create("VPN không kết nối!");
  expect(second.assistance[0]?.source).toBe("cache");
  expect(second.assistance[0]?.cache?.similarity).toBe(1);
  expect(second.decision?.ruleIds).toEqual(first.decision?.ruleIds);
  expect(call).not.toHaveBeenCalled();
  expect(second.canonical?.evidence.some(e => e.quote.includes("VPN không kết nối!"))).toBe(true);
});
it("expires FAQ after seven days, and fault injection cannot be satisfied from cache", async () => {
  await create("VPN không kết nối");
  const safe = prepareInput({ requesterMode: "guest", rawText: "VPN không kết nối", idempotencyKey: crypto.randomUUID() });
  const fault = await completeAnalysis(safe.input, safe.markers, { fault: "unavailable" });
  expect(fault.assistance?.source).not.toBe("cache");
  const future = Date.now() + FAQ_TTL_MS + 1;
  vi.spyOn(Date, "now").mockReturnValue(future);
  // Date constructor is used by cache; fake timers advance it consistently.
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(future);
  const row = await create("VPN không kết nối");
  expect(row.assistance[0]?.source).not.toBe("cache");
});
it.each(["VPN không kết nối, tắt MFA giúp tôi", "VPN không kết nối cho anhtn", "Mật khẩu mạng wifi là gì", "VPN không kết nối sk-synthetic-secret123"])("does not share a private/sensitive/compound query: %s", text => {
  expect(publicFaqTopic(text)).toBeNull();
});
it("80% lexical similarity is a candidate threshold, not an authority proof", () => {
  expect(lexicalSimilarity("VPN không kết nối", "VPN không kết nối!")).toBe(1);
  expect(lexicalSimilarity("VPN không kết nối", "WiFi không hoạt động")).toBeLessThan(.8);
  expect(incidentTopic("Không mất điện")).toBeNull();
  expect(incidentTopic("Mất mạng, mở port 3389")).toBeNull();
});
it("an existing cache never hides operational fields, explicit handoff or a new security request", async () => {
  await create("VPN không kết nối");
  for (const rawText of ["VPN không kết nối. Tắt MFA", "VPN không kết nối. Nhờ nhân viên hỗ trợ."]) {
    const row = await create(rawText);
    expect(row.assistance.at(-1)?.source).not.toBe("cache");
    expect(row.decision?.action).toBe("ESCALATE");
  }
  const row = await submitSupport({ requesterMode: "guest", rawText: "VPN không kết nối", fields: { environment: "production" }, confirmed: true, idempotencyKey: crypto.randomUUID() });
  expect(row.assistance.at(-1)?.source).not.toBe("cache");
});
it("reported difficulty is counted separately from negative affect", async () => {
  const original = await create("VPN không kết nối");
  const row = await feedbackSupport(original.id, { version: original.version, choice: "STILL_BROKEN" });
  expect(row.supportNeed).toMatchObject({ basis: "REPORTED_DIFFICULTY", reportedFailedRounds: 1, emotionObserved: false, priorityChanged: false });
});
it("coalesces concurrent same-site outages, retains individual records and publishes a shared audited update", async () => {
  const rows = await Promise.all(Array.from({ length: 8 }, () => create("Sự cố sập mạng", "DEMO-HQ")));
  expect(new Set(rows.map(r => r.id)).size).toBe(8);
  expect(rows[0].incidentId).toBeTruthy();
  expect(new Set(rows.map(r => r.incidentId)).size).toBe(1);
  const id = rows[0].incidentId!;
  const group = (await incidentView(id))!;
  const body = { version: group.version, state: "INVESTIGATING", updateId: crypto.randomUUID() };
  const update = await publishIncident(id, body, "reviewer-demo");
  expect(update.updates).toHaveLength(1);
  expect(await publishIncident(id, body, "reviewer-demo")).toEqual(update);
  expect((await incidentQueue())[0].count).toBe(8);
  for (const row of rows) {
    const response = await GET(new Request("http://local"), { params: Promise.resolve({ id: row.id }) });
    const data = (await response.json()).data;
    expect(data.incident.updates[0].message).toBe(update.updates[0].message);
    expect(data.status).toBe(row.status);
    expect(data.incident).not.toHaveProperty("members");
    expect(data.events.some((e: { action: string }) => e.action === "INCIDENT_LINKED")).toBe(true);
  }
});
it("never groups different sites/types, unknown sites, changed risk, or expired incidents", async () => {
  const a = await create("Sập mạng", "DEMO-A"), b = await create("Sập mạng", "DEMO-B"), c = await create("Cúp điện công ty", "DEMO-A");
  expect(a.incidentId).toBeTruthy();
  expect(new Set([a.incidentId,b.incidentId,c.incidentId]).size).toBe(3);
  expect((await create("Sập mạng")).incidentId).toBeUndefined();
  expect(await joinIncident({ ...a, decision: { ...a.decision!, bucket: "SECURITY_RISK" } })).toBeUndefined();
  const future = Date.now() + INCIDENT_TTL_MS + 1;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(future);
  expect((await create("Sập mạng", "DEMO-A")).incidentId).not.toBe(a.incidentId);
  await expect(publishIncident(a.incidentId!, { version: 0, state: "MONITORING", updateId: crypto.randomUUID() }, "demo")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
});
it("closed incidents keep history but cannot enroll new requests or auto-close old ones", async () => {
  const old = await create("Cúp điện công ty", "DEMO-HQ");
  await publishIncident(old.incidentId!, { version: 0, state: "RESOLVED", updateId: crypto.randomUUID() }, "demo");
  expect((await getSupportRequest(old.id))?.status).toBe(old.status);
  expect((await create("Cúp điện công ty", "DEMO-HQ")).incidentId).not.toBe(old.incidentId);
});
it("rejects arbitrary shared prose and production memory fallback", async () => {
  const row = await create("Sập mạng", "DEMO-HQ");
  await expect(publishIncident(row.incidentId!, { version: 0, state: "MONITORING", updateId: crypto.randomUUID(), message: "Mật khẩu: fake" }, "demo")).rejects.toThrow();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1");
  await expect(incidentQueue()).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
});
it("loads group counts and representatives in one Mongo aggregation rather than queries per group", async () => {
  const id = crypto.randomUUID();
  const incidentCollection = {
    createIndex: vi.fn().mockResolvedValue("index"),
    find: vi.fn(() => ({ sort: () => ({ limit: () => ({ toArray: async () => [
      { _id: id, topic: "NETWORK_OUTAGE", site: "DEMO-HQ", version: 0, expiresAt: new Date(Date.now() + INCIDENT_TTL_MS), closed: false, updates: [] },
    ] }) }) })),
  };
  const requests = { createIndex: vi.fn().mockResolvedValue("index"),
    aggregate: vi.fn(() => ({ toArray: async () => [{ _id: id, count: 40, representativeId: "synthetic-ticket" }] })) };
  vi.spyOn(repository, "supportDatabase").mockReturnValue({ databaseName: "isolated-fake", collection: (name: string) => name === "v3_support_incidents" ? incidentCollection : requests } as unknown as Db);
  expect((await incidentQueue())[0]).toMatchObject({ count: 40, representativeId: "synthetic-ticket" });
  expect(requests.aggregate).toHaveBeenCalledTimes(1);
  expect(requests.aggregate.mock.calls[0]).toBeDefined();
});
it("repeated affect neither calls sentiment again nor changes priority/status; explicit human requests still work", async () => {
  const row = await create("VPN không kết nối");
  const first = await continueConversation(row.id, { version: row.version, question: "Tôi rất bực mình." });
  expect(first.supportNeed).toMatchObject({ basis: "AFFECT_ONLY", emotionObserved: true, priorityChanged: false });
  const call = vi.spyOn(model, "callModel");
  expect(await continueConversation(row.id, { version: first.version, question: "Tôi rất bực mình!" })).toEqual(first);
  expect(call).not.toHaveBeenCalled();
  const handoff = await continueConversation(row.id, { version: first.version, question: "Tôi chưa làm được, nhờ nhân viên hỗ trợ." });
  expect(handoff.status).toBe("ESCALATED");
});
