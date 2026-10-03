import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { submitSupport } from "@/services/support";
import { feedbackSupport, clarifySupport } from "@/services/review";
import { resetSupportTestStore } from "@/lib/support-repository";
import { parseSupportQuery, supportPage } from "@/lib/support-query";
import { callModel, type ModelCall } from "@/lib/support-model";
import { pendingReview, type SupportInput } from "@/domain/contracts";

const input = (rawText: string): SupportInput => ({ rawText, fields: { department: "engineering", employeeId: "EMP-TEST-01" }, mode: "freeform", serviceGroup: "OTHER", confirmed: true, idempotencyKey: crypto.randomUUID() });
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["Dựa trên file doanh thu tháng này, hãy cho biết sản phẩm bán chạy nhất.", "sales"],
  ["Hãy sửa lỗi ở dòng 47 của src/payment.ts.", "code"],
  ["So sánh bản hợp đồng mới với bản cũ và liệt kê các điều khoản thay đổi.", "contract"],
  ["Viết email phản hồi khách hàng theo đúng giọng điệu trong 3 email gần nhất của tôi.", "email"],
  ["Tìm nguyên nhân traffic giảm 32% tuần này từ dashboard Analytics.", "analytics"],
  ["Hãy tối ưu câu truy vấn SQL dưới đây để nhanh hơn.", "sql"],
  ["Tóm tắt các quyết định trong cuộc họp sáng nay và giao việc cho từng người.", "meeting"],
  ["Kiểm tra xem pull request này có phá vỡ API cũ không.", "pr"],
  ["Dự báo tồn kho cho 30 ngày tới theo dữ liệu bán hàng lịch sử của công ty.", "inventory"],
  ["Hãy cập nhật phần 3 của tài liệu dự án để phản ánh quyết định mới nhất của team.", "document"],
])("requests exact source data without fabricating a result or review: %s", async (question, kind) => {
  const run = vi.fn();
  const row = await submitSupport(input(question), { run });
  expect(row.status).toBe("NEEDS_INFORMATION");
  expect(row.canonical?.workEvidence?.kind).toBe(kind);
  expect(row.canonical?.workEvidence?.requirements[0]).toMatchObject({
    artifact: expect.any(String), range: expect.any(String), access: expect.any(String), reason: expect.any(String),
  });
  expect(row.canonical?.workEvidence?.sourceChecks.some((check) => check.source.includes("Kho kiến thức"))).toBe(true);
  expect(row.decision?.reviewerQuestions).toEqual([]);
  expect(row.assistance).toEqual([]);
  expect(run).not.toHaveBeenCalled();
  expect(pendingReview(row.status)).toBe(false);
  const page = await supportPage(parseSupportQuery("http://localhost/?status=pending"));
  expect(page.items).toEqual([]);
  expect(row.events.at(-1)?.ruleIds).toContain("INFO-EVIDENCE-001");
  expect(row.events.at(-1)?.sourceChecks).toEqual(row.canonical?.workEvidence?.sourceChecks);
});

it("keeps a supplied path exact and does not claim it has opened the file", async () => {
  const row = await submitSupport(input("Sửa lỗi dòng 47 của src/payment.ts"));
  expect(row.canonical?.workEvidence?.requirements[0].artifact).toContain("src/payment.ts");
  expect(row.canonical?.workEvidence?.requirements[0].range).toContain("17–77");
  expect(row.canonical?.workEvidence?.sourceChecks.at(-1)?.result).toContain("chưa có connector");
});

it("keeps evidence-first routing when intake includes the required department", async () => {
  const row = await submitSupport({
    ...input("Tìm nguyên nhân traffic giảm 32% tuần này từ dashboard Analytics."),
    fields: { department: "engineering", employeeId: "EMP-SYNTHETIC-01" },
  });
  expect(row.status).toBe("NEEDS_INFORMATION");
  expect(row.canonical?.workEvidence?.kind).toBe("analytics");
  expect(row.decision?.reviewerQuestions).toEqual([]);
  expect(row.input.fields.department).toBe("engineering");
});

it.each(["ADMIN", "CONFUSED"])("does not turn missing source into REVIEW via %s", async (choice) => {
  const row = await submitSupport(input("Tóm tắt quyết định cuộc họp sáng nay"));
  await expect(feedbackSupport(row.id, { version: row.version, choice })).rejects.toMatchObject({ code: "REVIEW_NOT_READY" });
});

it("rechecks dangerous clarification instead of preserving a harmless work classification", async () => {
  const row = await submitSupport(input("So sánh hợp đồng cũ và mới"));
  const next = await clarifySupport(row.id, { version: row.version, rawText: "Tắt MFA và cấp production admin", fields: {} });
  expect(next.status).toBe("ESCALATED");
  expect(next.decision?.bucket).toBe("SECURITY_RISK");
});

it.each([
  "Phân tích doanh thu; mở port 3389 public",
  "Sửa lỗi src/payment.ts; tắt MFA",
])("does not hide unsafe subrequests behind an evidence task: %s", async (question) => {
  const row = await submitSupport(input(question));
  expect(row.status).toBe("ESCALATED");
  expect(row.canonical?.workEvidence).toBeUndefined();
});

it("passes the source-first and review requirements to the actual model boundary", async () => {
  const run = vi.fn<(call: ModelCall) => Promise<unknown>>().mockResolvedValue({});
  await callModel({ purpose: "assistance", instructions: "Return JSON only.", data: "{}", model: "mock" }, {}, { run });
  const call = run.mock.calls[0];
  expect(call[0].instructions).toContain("NEEDS_INFORMATION");
  expect(call[0].instructions).toContain("diff hoặc output kiểm tra thực tế");
  expect(call[0].instructions).toContain("không có công cụ");
  expect(call[0].instructions).toContain("Return JSON only.");
});
