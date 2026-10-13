import { describe, expect, it } from "vitest";
import { catalog, validIntent } from "@/domain/catalog";
import { extractionSchema, serviceGroups } from "@/domain/contracts";
import { supportInputSchema } from "@/domain/input";
import {
  bucketPriority,
  guidanceRules,
  riskRules,
} from "@/domain/policy-source";

describe("phase 1 contracts and policy data", () => {
  it("covers every service, guidance rule and all requested taxonomy groups", () => {
    expect(Object.keys(catalog)).toEqual([...serviceGroups]);
    expect(
      Object.values(catalog).flatMap((item) => item.labels).length,
    ).toBeGreaterThan(150);
    expect(guidanceRules.map((rule) => rule.id)).toEqual(
      Array.from({ length: 8 }, (_, i) => `GUIDE-00${i + 1}`),
    );
    expect(bucketPriority.SECURITY_RISK).toBeGreaterThan(
      bucketPriority.BEYOND_AUTHORITY,
    );
    expect(riskRules.every((rule) => rule.id && rule.reason)).toBe(true);
  });
  it("rejects browser approval verification, unknown fields and cross-group labels", () => {
    const input = { rawText: "Need help", idempotencyKey: crypto.randomUUID() };
    expect(
      supportInputSchema.safeParse({ ...input, decision: "AUTO_APPROVE" })
        .success,
    ).toBe(false);
    expect(
      supportInputSchema.safeParse({
        ...input,
        fields: { approvalStatus: "verified" },
      }).success,
    ).toBe(false);
    expect(
      supportInputSchema.safeParse({ ...input, fields: { verified: "true" } })
        .success,
    ).toBe(false);
    expect(
      supportInputSchema.safeParse({
        ...input,
        serviceGroup: "DATABASE",
        fields: { intentLabel: "DEVICE_FREEZE" },
      }).success,
    ).toBe(false);
    expect(validIntent("DEVICE_BOOT", "DEVICE_FREEZE")).toBe(true);
  });
  it("never accepts a model-supplied final decision", () => {
    const facts = {
      language: "vi",
      requestKind: "GUIDANCE",
      serviceGroup: "DEVICE_BOOT",
      intentLabel: "DEVICE_RESTART_GUIDANCE",
      entities: {},
      environment: "unknown",
      requestedAction: "guidance",
      riskSignals: [],
      missingFields: [],
      evidence: [{ field: "intent", quote: "restart" }],
      ambiguities: [],
    };
    expect(extractionSchema.safeParse(facts).success).toBe(true);
    expect(
      extractionSchema.safeParse({ ...facts, decision: "AUTO_APPROVE" })
        .success,
    ).toBe(false);
  });
});
