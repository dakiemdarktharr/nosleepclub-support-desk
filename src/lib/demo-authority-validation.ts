const capacity = { bsonType: "object", required: ["cpu", "ramGb", "diskGb", "gpuT4"], additionalProperties: false,
  properties: Object.fromEntries(["cpu", "ramGb", "diskGb", "gpuT4"].map((key) => [key, { bsonType: "number", minimum: 0, maximum: 1_000_000, ...(key === "gpuT4" ? { multipleOf: 1 } : {}) }])) };
const scope = { bsonType: "object", required: ["target", "environment", "resource", "operation"], additionalProperties: false,
  properties: { target: { enum: ["DEMO-SANDBOX"] }, environment: { enum: ["sandbox"] }, resource: { enum: ["cloud"] }, operation: { enum: ["read", "create"] } } };
export const demoAuthorityValidators = {
  identity_demo_pool: {
    required: ["id", "assurance", "version", "ownerIds", "limits", "used", "reserved", "observedAt", "validUntil", "maxHours", "budget"],
    properties: { id: { enum: ["DEMO-SANDBOX"] }, assurance: { enum: ["demo"] }, version: { bsonType: "number", minimum: 0, multipleOf: 1 },
      ownerIds: { bsonType: "array", minItems: 1, maxItems: 10, uniqueItems: true, items: { bsonType: "string", pattern: "^[a-z0-9][a-z0-9_-]{0,31}$" } },
      limits: capacity, used: capacity, reserved: capacity, observedAt: { bsonType: "string" }, validUntil: { bsonType: "string" },
      maxHours: { enum: [24] }, budget: { enum: ["unconfigured"] } },
  },
  identity_demo_grants: {
    required: ["id", "scope", "hours", "reason", "employeeId", "status", "version", "createdAt", "assurance"],
    properties: { id: { bsonType: "string" }, scope, hours: { bsonType: "number", minimum: 0, exclusiveMinimum: true, maximum: 24 },
      reason: { bsonType: "string" }, employeeId: { bsonType: "string" }, status: { enum: ["PENDING", "APPROVED", "REJECTED", "REVOKED"] },
      version: { bsonType: "number", minimum: 0, multipleOf: 1 }, createdAt: { bsonType: "string" }, assurance: { enum: ["demo"] },
      decidedBy: { bsonType: "string" }, decidedAt: { bsonType: "string" }, decisionReason: { bsonType: "string" }, expiresAt: { bsonType: "string" } },
  },
};
