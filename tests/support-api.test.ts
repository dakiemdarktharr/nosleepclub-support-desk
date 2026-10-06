import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as submit } from "@/app/api/support/requests/route";
import { POST as preview } from "@/app/api/support/preview/route";
import { resetSupportTestStore, getSupportRequest } from "@/lib/support-repository";
import { GET as detail } from "@/app/api/support/requests/[id]/route";
import { createVerifyRun } from "@/services/verification";

beforeEach(() => {
  vi.stubEnv("MONGODB_URI", "");
  vi.stubEnv("AI_PROVIDER", "mock");
  resetSupportTestStore();
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown) =>
  new Request("http://localhost/api/support/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const identity = {
  fields: { department: "engineering", employeeId: "emp-42" },
};

it.each([
  {},
  { employeeId: "EMP-42" },
  { department: "  ", employeeId: "EMP-42" },
])("blocks a missing or blank department in both intake modes: %j", async (fields) => {
  for (const mode of ["freeform", "structured"]) {
    const input = {
      mode,
      fields,
      rawText: "Tôi cần hỗ trợ máy tính. Phòng kỹ thuật, ID EMP-42.",
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    };
    for (const route of [preview, submit]) {
      const response = await route(request(input));
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("IDENTITY_REQUIRED");
    }
    expect(await getSupportRequest(input.idempotencyKey)).toBeNull();
  }
});

it.each([undefined, "", "  \t "])("requires an employee ID before preview or submission: %j", async (employeeId) => {
  for (const mode of ["freeform", "structured"]) {
    const input = {
      mode,
      fields: { department: "engineering", ...(employeeId === undefined ? {} : { employeeId }) },
      rawText: "Restart my laptop",
      idempotencyKey: crypto.randomUUID(),
    };
    for (const route of [preview, submit]) {
      const response = await route(request(input));
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("IDENTITY_REQUIRED");
    }
    expect(await getSupportRequest(input.idempotencyKey)).toBeNull();
  }
});

it("normalizes employee codes and saves them for reviewer lookup", async () => {
  const input = {
    fields: { department: "engineering", employeeId: " ANHTN " },
    rawText: "Restart my laptop",
    idempotencyKey: crypto.randomUUID(),
  };
  const before = await preview(request(input));
  expect(before.status).toBe(200);
  const { data } = await before.json();
  expect(data.input.fields.employeeId).toBe("anhtn");
  const saved = await submit(request({ ...data.input, confirmed: true }));
  expect(saved.status).toBe(201);
  expect((await saved.json()).data.input.fields.employeeId).toBe("anhtn");
});

it.each(["bad id", "../employee", "a".repeat(33)])("rejects a malformed employee code: %s", async (employeeId) => {
  const input = {
    fields: { department: "engineering", employeeId },
    rawText: "Restart my laptop",
    idempotencyKey: crypto.randomUUID(),
  };
  for (const route of [preview, submit]) {
    const response = await route(request(input));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("IDENTITY_REQUIRED");
  }
  expect(await getSupportRequest(input.idempotencyKey)).toBeNull();
});

it("rejects an unknown department and identity without issue details", async () => {
  for (const body of [
    { rawText: "Restart laptop", fields: { department: "not-a-department", employeeId: "EMP-42" } },
    { rawText: "  ", ...identity },
  ]) {
    const input = { ...body, confirmed: true, idempotencyKey: crypto.randomUUID() };
    for (const route of [preview, submit])
      expect((await route(request(input))).status).toBe(422);
    expect(await getSupportRequest(input.idempotencyKey)).toBeNull();
  }
});

it("cannot bypass identity checks with forged Verify metadata on either endpoint", async () => {
  const run = await createVerifyRun({ pack: "de-a-v3" });
  for (const verifyRunId of [crypto.randomUUID(), run.id]) {
    const input = {
      rawText: "An arbitrary request without employee identity",
      confirmed: true,
      idempotencyKey: run.cases[0].requestId,
      verifyRunId,
      verifyCaseId: run.cases[0].caseId,
    };
    for (const route of [preview, submit]) {
      const response = await route(request(input));
      expect([404, 409]).toContain(response.status);
    }
    expect(await getSupportRequest(input.idempotencyKey)).toBeNull();
  }
});

it("preview and submission apply the same policy; detail survives a new GET", async () => {
  const input = {
    fields: { department: " engineering ", employeeId: " EMP-42 " },
    rawText: "Tôi tắt máy tính lúc về được không?",
    confirmed: true,
    idempotencyKey: crypto.randomUUID(),
  };
  const before = await (await preview(request(input))).json();
  const saved = await (await submit(request(input))).json();
  expect(saved.data.input.fields).toEqual(identity.fields);
  expect(saved.data.decision).toEqual(before.data.decision);
  const fetched = await (
    await detail(request({}), {
      params: Promise.resolve({ id: saved.data.id }),
    })
  ).json();
  expect(fetched.data.id).toBe(saved.data.id);
  expect(fetched.data.events).toHaveLength(2);
  expect(fetched.data.events[1]).toMatchObject({
    requestId: saved.data.id,
    actor: "deterministic-policy",
    ruleIds: ["GUIDE-001"],
    policyVersion: "support-guidance-v5.8",
    approvalStatus: "not_required",
    nextStep: expect.any(String),
    questions: [],
    redactions: [],
    subrequestOutcomes: [],
  });
});
it("repeated submit has one request/audit and a different payload cannot reuse the key", async () => {
  const input = {
    ...identity,
    rawText: "Restart my laptop",
    confirmed: true,
    idempotencyKey: crypto.randomUUID(),
  };
  const responses = await Promise.all([
    submit(request(input)),
    submit(request(input)),
  ]);
  expect(responses.every((response) => response.status === 201)).toBe(true);
  const replay = await (await submit(request(input))).json();
  expect(replay.data.events).toHaveLength(2);
  expect(
    (await submit(request({ ...input, rawText: "Different input" }))).status,
  ).toBe(409);
});
it("does not leak secret values in response, input, audit or validation errors", async () => {
  const secret = "SYNTHETIC" + "_SECRET_94532";
  const response = await submit(
    request({
      ...identity,
      rawText: `token=${secret}`,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    }),
  );
  const body = await response.text();
  expect(body).not.toContain(secret);
  expect(body).toContain("SEC-001");
  const invalid = await submit(
    request({
      ...identity,
      fields: { ...identity.fields, permission: secret },
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    }),
  );
  expect(await invalid.text()).not.toContain(secret);
});
it("requires confirmation and rejects forged decisions", async () => {
  const input = {
    ...identity,
    rawText: "Shutdown laptop",
    idempotencyKey: crypto.randomUUID(),
  };
  expect((await submit(request(input))).status).toBe(422);
  expect(
    (await preview(request({ ...input, decision: "AUTO_APPROVE" }))).status,
  ).toBe(422);
});
