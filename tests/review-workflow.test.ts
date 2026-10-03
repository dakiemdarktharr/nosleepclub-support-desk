import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { submitSupport } from "@/services/support";
import {
  clarifySupport,
  feedbackSupport,
  reviewSupport,
} from "@/services/review";
import {
  resetSupportTestStore,
  getSupportRequest,
  insertSupportRequest,
} from "@/lib/support-repository";
import { canReview } from "@/domain/transitions";
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("MONGODB_URI", "");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const create = (rawText: string) =>
  submitSupport({
    rawText,
    fields: { department: "engineering", employeeId: "EMP-TEST-01" },
    confirmed: true,
    idempotencyKey: crypto.randomUUID(),
  });
const createCompleteEscalation = () =>
  submitSupport({
    rawText: "",
    mode: "structured",
    serviceGroup: "DATABASE",
    fields: {
      department: "engineering",
      employeeId: "EMP-TEST-01",
      intentLabel: "DATABASE_EXPORT",
      system: "postgresql",
      resourceScope: "demo_inventory",
      environment: "staging",
      permission: "read-only",
      duration: "2 hours",
      reason: "Create a controlled backup",
      operation: "export",
      dataSensitivity: "internal",
      destination: "Controlled internal demo backup",
    },
    confirmed: true,
    idempotencyKey: crypto.randomUUID(),
  });

it.each(["CONFUSED", "ADMIN"])(
  "feedback %s creates reviewer work and keeps assistance history",
  async (choice) => {
    const original = await create("VPN không kết nối");
    const updated = await feedbackSupport(original.id, {
      version: original.version,
      choice,
    });
    expect(updated.status).toBe("ESCALATED");
    expect(updated.assistance).toEqual(original.assistance);
    expect(updated.decision?.ruleIds).toContain("HANDOFF-001");
    expect(updated.events.at(-1)).toMatchObject({
      requestId: original.id,
      actor: "employee-demo",
      beforeStatus: "AUTO_APPROVED",
      afterStatus: "ESCALATED",
      action: "HANDOFF",
    });
  },
);
it("direct request for a person enters review", async () => {
  expect(
    (await create("Tôi vẫn không hiểu, chuyển admin giúp tôi")).status,
  ).toBe("ESCALATED");
});
it("a user can resolve guidance but cannot resolve an escalated production request", async () => {
  const guide = await create("Restart my laptop");
  expect(
    (
      await feedbackSupport(guide.id, {
        version: guide.version,
        choice: "RESOLVED",
      })
    ).status,
  ).toBe("COMPLETED");
  const risky = await create("Grant production admin");
  await expect(
    feedbackSupport(risky.id, { version: risky.version, choice: "RESOLVED" }),
  ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
});
it("review actions are versioned, keep the policy result, and block invalid transitions", async () => {
  const guide = await create("VPN không kết nối");
  const request = await feedbackSupport(guide.id, {
    version: guide.version,
    choice: "ADMIN",
  });

  const action = {
    action: "APPROVE",
    version: request.version,
    reason: "Synthetic manual review",
  };
  const results = await Promise.allSettled([
    reviewSupport(request.id, action, "reviewer-a"),
    reviewSupport(request.id, action, "reviewer-b"),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const current = (await getSupportRequest(request.id))!;
  expect(current.status).toBe("APPROVED_BY_HUMAN");
  expect(current.decision?.action).toBe("ESCALATE");
  expect(
    current.events.filter((event) => event.action === "APPROVE"),
  ).toHaveLength(1);
  expect(canReview("STOPPED", "APPROVE")).toBe(false);
  expect(canReview("COMPLETED", "OVERRIDE")).toBe(false);
  expect(canReview("NEEDS_INFORMATION", "APPROVE")).toBe(false);
});
it("security risk cannot be approved or overridden into approval", async () => {
  const request = await create("Open public RDP port 3389");
  for (const action of ["APPROVE", "OVERRIDE"])
    await expect(
      reviewSupport(
        request.id,
        {
          action,
          target: "APPROVED_BY_HUMAN",
          version: request.version,
          reason: "Synthetic permission review",
        },
        "reviewer",
      ),
    ).rejects.toMatchObject({ code: "SECURITY_REVIEW_REQUIRED" });
});
it("reject and override require a meaningful reason; sensitive reasons are redacted", async () => {
  const request = await create("Grant production admin");
  await expect(
    reviewSupport(
      request.id,
      { action: "REJECT", version: request.version, reason: "" },
      "reviewer",
    ),
  ).rejects.toThrow();
  const secret = "SYNTHETIC" + "_REVIEW_714";
  const rejected = await reviewSupport(
    request.id,
    {
      action: "REJECT",
      version: request.version,
      reason: `Unsafe token=${secret}`,
    },
    "reviewer",
  );
  expect(JSON.stringify(rejected)).not.toContain(secret);
});
it("cannot approve or override a request with unresolved facts", async () => {
  const request = await create("Need database access");
  expect(request.status).toBe("NEEDS_INFORMATION");
  await expect(
    reviewSupport(
      request.id,
      {
        action: "APPROVE",
        version: request.version,
        reason: "Trying to bypass missing facts",
      },
      "reviewer",
    ),
  ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  await expect(
    reviewSupport(
      request.id,
      {
        action: "OVERRIDE",
        target: "APPROVED_BY_HUMAN",
        version: request.version,
        reason: "Trying to bypass missing facts",
      },
      "reviewer",
    ),
  ).rejects.toMatchObject({ code: "MISSING_INFORMATION" });
});
it("reset clarification produces restart guidance and retains prior audit", async () => {
  const request = await create("Làm sao reset máy?");
  const result = await clarifySupport(request.id, {
    version: request.version,
    rawText: "Tôi muốn restart laptop, không factory reset",
  });
  expect(result.decision?.action).toBe("AUTO_APPROVE");
  expect(result.events).toHaveLength(3);
  expect(result.assistance).toHaveLength(1);
});
it("request information and override remain auditable human actions", async () => {
  const original = await create("Grant production admin");
  const waiting = await reviewSupport(
    original.id,
    {
      version: original.version,
      action: "REQUEST_INFORMATION",
      reason: "Cần owner xác nhận phạm vi.",
    },
    "reviewer-demo",
  );
  expect(waiting.status).toBe("NEEDS_INFORMATION");
  const override = await reviewSupport(
    original.id,
    {
      version: waiting.version,
      action: "OVERRIDE",
      target: "REJECTED",
      reason: "Owner không chấp thuận request demo.",
    },
    "reviewer-demo",
  );
  expect(override.status).toBe("REJECTED");
  expect(override.events.at(-1)?.action).toBe("OVERRIDE");
  expect(override.decision).toEqual(original.decision);
});
it("only an approved simulation can complete; stopped work cannot resume", async () => {
  const guide = await create("VPN không kết nối");
  const original = await feedbackSupport(guide.id, {
    version: guide.version,
    choice: "ADMIN",
  });

  await expect(
    reviewSupport(
      original.id,
      {
        version: original.version,
        action: "FULFILL",
        reason: "Attempt fulfillment before approval",
      },
      "reviewer-demo",
    ),
  ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  const approved = await reviewSupport(
    original.id,
    {
      version: original.version,
      action: "APPROVE",
      reason: "Reviewed export scope for simulation",
    },
    "reviewer-demo",
  );
  const completed = await reviewSupport(
    original.id,
    {
      version: approved.version,
      action: "FULFILL",
      reason: "Complete the approved simulated workflow",
    },
    "reviewer-demo",
  );
  expect(completed.status).toBe("COMPLETED");
  expect(completed.events.at(-1)?.explanation).toContain("mô phỏng");
  const another = await create("VPN không kết nối");
  const stopped = await reviewSupport(
    another.id,
    {
      version: another.version,
      action: "STOP",
      reason: "Stop this synthetic support workflow",
    },
    "reviewer-demo",
  );
  await expect(
    feedbackSupport(stopped.id, { version: stopped.version, choice: "ADMIN" }),
  ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
});

it("complete controlled export can be reviewed without losing the DBA policy decision", async () => {
  const request = await createCompleteEscalation();
  expect(request.decision?.ruleIds).toContain("AUTH-001");
  expect(request.decision?.missingFields).toEqual([]);
  const approved = await reviewSupport(
    request.id,
    {
      version: request.version,
      action: "APPROVE",
      reason: "Reviewed controlled demo destination",
    },
    "reviewer-demo",
  );
  expect(approved.status).toBe("APPROVED_BY_HUMAN");
});
it("recovers an abandoned receipt without duplicating the decision audit", async () => {
  const request = await create("Restart my laptop");
  resetSupportTestStore();
  await insertSupportRequest({
    ...request,
    version: 0,
    status: "RECEIVED",
    canonical: null,
    decision: null,
    assistance: [],
    events: request.events.slice(0, 1),
    updatedAt: new Date(Date.now() - 120_000).toISOString(),
  });
  const recovered = await submitSupport(request.input);
  expect(recovered.status).toBe("AUTO_APPROVED");
  expect(recovered.version).toBe(1);
  expect(
    recovered.events.filter((event) => event.action === "DECISION"),
  ).toHaveLength(1);
});
