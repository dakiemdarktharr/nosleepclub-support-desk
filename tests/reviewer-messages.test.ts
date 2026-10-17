import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/review/[id]/route";
import { GET } from "@/app/api/support/requests/[id]/route";
import { reviewerMessages, REVIEW_MESSAGE_MAX_LENGTH } from "@/domain/reviewer-messages";
import { canReview } from "@/domain/transitions";
import { getSupportRequest, resetSupportTestStore } from "@/lib/support-repository";
import * as model from "@/lib/support-model";
import { submitSupport } from "@/services/support";
import { feedbackSupport, reviewSupport } from "@/services/review";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const create = (rawText: string) => submitSupport({
  requesterMode: "guest", rawText, confirmed: true, idempotencyKey: crypto.randomUUID(),
});

it.each(["Need database access", "Open public RDP port 3389", "VPN không kết nối"])(
  "delivers a reply without approving, closing or changing the policy: %s", async rawText => {
    const row = await create(rawText);
    const reason = "Bạn gửi thêm thông báo lỗi nhé.\nMình đang kiểm tra yêu cầu.";
    const callModel = vi.spyOn(model, "callModel");
    const updated = await reviewSupport(row.id, {
      version: row.version, action: "SEND_MESSAGE", reason,
    }, "public-demo-reviewer");
    expect(updated.status).toBe(row.status);
    expect(updated.decision).toEqual(row.decision);
    expect(updated.canonical).toEqual(row.canonical);
    expect(updated.assistance).toEqual(row.assistance);
    expect(updated.version).toBe(row.version + 1);
    expect(updated.events).toHaveLength(row.events.length + 1);
    expect(updated.events.at(-1)).toMatchObject({
      action: "SEND_MESSAGE", actor: "public-demo-reviewer", requestId: row.id,
      beforeStatus: row.status, afterStatus: row.status, senderMessage: reason,
    });
    expect(callModel).not.toHaveBeenCalled();
    const response = await GET(new Request("http://local"), { params: Promise.resolve({ id: row.id }) });
    const stored = (await response.json()).data;
    expect(reviewerMessages(stored.events).map(message => message.text)).toEqual([reason]);
  },
);

it("sending a message preserves the state until the reviewer explicitly approves", async () => {
  const original = await create("Need database access");
  const row = await feedbackSupport(original.id, { version: original.version, choice: "ADMIN" });
  expect(row.status).toBe("ESCALATED");
  expect(row.decision?.missingFields.length).toBeGreaterThan(0);
  const updated = await reviewSupport(row.id, {
    version: row.version, action: "SEND_MESSAGE", reason: "Bạn bổ sung phạm vi truy cập nhé.",
  }, "public-demo-reviewer");
  expect((await getSupportRequest(row.id))?.status).toBe("ESCALATED");
  const approved = await reviewSupport(row.id, {
    version: updated.version, action: "APPROVE",
  }, "public-demo-reviewer");
  expect(approved.status).toBe("APPROVED_BY_HUMAN");
  expect(approved.decision).toEqual(row.decision);
  expect(approved.events.filter(event => event.action === "APPROVE")).toHaveLength(1);
});

it("can send another message after human approval without reapproving or fulfilling", async () => {
  const original = await create("VPN không kết nối");
  const row = await feedbackSupport(original.id, { version: original.version, choice: "ADMIN" });
  const approved = await reviewSupport(row.id, { version: row.version, action: "APPROVE" }, "public-demo-reviewer");
  const updated = await reviewSupport(row.id, {
    version: approved.version, action: "SEND_MESSAGE", reason: "Mình đang theo dõi kết quả.",
  }, "public-demo-reviewer");
  expect(updated.status).toBe("APPROVED_BY_HUMAN");
  expect(updated.events.filter(event => event.action === "APPROVE")).toHaveLength(1);
  expect(updated.decision).toEqual(approved.decision);
});

it.each([
  { label: "empty", reason: "" },
  { label: "whitespace only", reason: "   \n  " },
  { label: "overlong", reason: "x".repeat(REVIEW_MESSAGE_MAX_LENGTH + 1) },
])(
  "rejects $label replies without writing an event", async ({ reason }) => {
    const row = await create("Need database access");
    await expect(reviewSupport(row.id, {
      version: row.version, action: "SEND_MESSAGE", reason,
    }, "public-demo-reviewer")).rejects.toThrow();
    expect(await getSupportRequest(row.id)).toEqual(row);
  },
);

it("accepts a short message and redacts credentials before storing and returning it", async () => {
  const row = await create("Need database access");
  const short = await reviewSupport(row.id, {
    version: row.version, action: "SEND_MESSAGE", reason: "  OK  ",
  }, "public-demo-reviewer");
  expect(short.events.at(-1)?.senderMessage).toBe("OK");
  const secret = "SYNTHETIC_REVIEW_SECRET";
  const updated = await reviewSupport(row.id, {
    version: short.version, action: "SEND_MESSAGE", reason: `Kiểm tra token=${secret}`,
  }, "public-demo-reviewer");
  expect(JSON.stringify(updated)).not.toContain(secret);
  expect(updated.events.at(-1)?.redactions.length).toBeGreaterThan(0);
  expect(reviewerMessages(updated.events)).toHaveLength(2);
});

it("concurrent or retried sends with the same version persist exactly one message", async () => {
  const row = await create("Need database access");
  const payload = { version: row.version, action: "SEND_MESSAGE", reason: "Bạn bổ sung tên hệ thống nhé." };
  const results = await Promise.allSettled([
    reviewSupport(row.id, payload, "reviewer-a"),
    reviewSupport(row.id, payload, "reviewer-b"),
  ]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  await expect(reviewSupport(row.id, payload, "reviewer-a")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  const stored = (await getSupportRequest(row.id))!;
  expect(stored.version).toBe(row.version + 1);
  expect(reviewerMessages(stored.events)).toHaveLength(1);
});

it.each(["STOP", "REJECT", "RESOLVED"] as const)("cannot message a closed request after %s", async action => {
  const row = await create("VPN không kết nối");
  const closed = action === "RESOLVED"
    ? await feedbackSupport(row.id, { version: row.version, choice: action })
    : await reviewSupport(row.id, { version: row.version, action, reason: "Đóng yêu cầu giả lập này." }, "reviewer");
  expect(canReview(closed.status, "SEND_MESSAGE")).toBe(false);
  await expect(reviewSupport(row.id, {
    version: closed.version, action: "SEND_MESSAGE", reason: "Tin nhắn gửi sau khi đóng.",
  }, "reviewer")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  expect(await getSupportRequest(row.id)).toEqual(closed);
});

it("message API retains the reviewer access guard", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SUPPORT_ACCESS_MODE", "disabled");
  const id = crypto.randomUUID();
  const response = await POST(new Request(`http://local/api/review/${id}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: 0, action: "SEND_MESSAGE", reason: "Xin chào" }),
  }), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("REVIEW_NOT_ENABLED");
});
