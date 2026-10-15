import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportInput } from "@/domain/contracts";
import { extractionSchema } from "@/domain/contracts";
import { extractIntake, extractText } from "@/domain/text";
import { evaluatePolicy } from "@/domain/policy";
import { extractWithModel } from "@/lib/support-model";

const input = (rawText: string, fields: Record<string, string> = {}): SupportInput => ({
  mode: "freeform", serviceGroup: "OTHER", rawText, fields, confirmed: false,
  idempotencyKey: "a12a3901-9654-4e33-a824-7c4c9ab76fe8",
});

describe("network facts survive the deterministic hazard gate", () => {
  it("retains the exact reported 3389 port without assuming protocol or either endpoint", () => {
    const raw = "Mở port 3389 ra Internet để truy cập từ xa vào máy công ty.";
    const canonical = extractIntake(input(raw));
    expect(canonical).toMatchObject({
      serviceGroup: "NETWORK_VPN", intentLabel: "PORT_OPEN_REQUEST", entities: { port: "3389" },
      environment: "unknown", model: { source: "deterministic" },
    });
    for (const key of ["protocol", "source", "target", "environment", "approvalReference", "permission"])
      expect(canonical.entities).not.toHaveProperty(key);
    expect(canonical.evidence).toContainEqual({ field: "port", quote: "3389" });
    expect(canonical.evidence).toContainEqual({ field: "input", quote: raw });
    expect(extractionSchema.safeParse(extractText(raw)).success).toBe(true);
    const decision = evaluatePolicy(canonical);
    expect(decision).toMatchObject({ action: "ESCALATE", bucket: "SECURITY_RISK", assignedTeam: "Security / Network" });
    expect(decision.ruleIds).toContain("SEC-002");
    expect(decision.missingFields).not.toContain("port");
    expect(decision.missingFields).toEqual(expect.arrayContaining(["source", "target", "protocol", "environment"]));
  });

  it.each([
    ["Mở cổng 443 ra Internet.", "443"],
    ["Open port 1 to the Internet.", "1"],
    ["Open port 65535 to the Internet.", "65535"],
    ["Open destination port: 3389 to the Internet.", "3389"],
    ["Mở cổng đích 3389 ra Internet.", "3389"],
    ["Open port 3389.", "3389"],
    ["Mở port 3389, port 3389 ra Internet.", "3389"],
  ])("extracts one explicitly stated valid port: %s", (raw, port) => {
    const canonical = extractIntake(input(raw));
    expect(canonical.entities.port).toBe(port);
    expect(canonical.missingFields).not.toContain("port");
    expect(canonical.evidence).toContainEqual({ field: "port", quote: port });
  });

  it("does not turn a source port into the destination port", () => {
    const raw = "Open source port 50000 to destination port 3389 on the Internet.";
    const canonical = extractIntake(input(raw));
    expect(canonical.entities.port).toBe("3389");
    expect(canonical.entities).not.toHaveProperty("source");
    expect(canonical.entities).not.toHaveProperty("sourcePort");
    expect(canonical.evidence).toContainEqual({ field: "input", quote: "source port 50000" });
    expect(canonical.evidence).toContainEqual({ field: "port", quote: "3389" });
  });

  it("still asks for the connection port when only source port was supplied", () => {
    const canonical = extractIntake(input("Open source port 50000 to the Internet."));
    expect(canonical.entities).not.toHaveProperty("port");
    expect(evaluatePolicy(canonical).missingFields).toContain("port");
  });

  it("accepts an explicit destination answer after only a source port was supplied", () => {
    const canonical = extractIntake(input("Open source port 50000 to the Internet.", { port: "3389" }));
    expect(canonical.entities.port).toBe("3389");
    expect(canonical.missingFields).not.toContain("port");
    expect(canonical.riskSignals).not.toContain("CONFLICT");
  });

  it("retains explicit labelled endpoints and protocol while preserving SEC-002", () => {
    const canonical = extractIntake(input("Open port 3389 to Internet; source: 198.51.100.8; destination: demo-laptop; protocol: TCP; environment: staging"));
    expect(canonical.entities).toMatchObject({ port: "3389", source: "198.51.100.8", target: "demo-laptop", protocol: "TCP", environment: "staging" });
    expect(canonical.subrequests).toEqual([]);
    expect(canonical.evidence).toContainEqual({ field: "source", quote: "198.51.100.8" });
    expect(canonical.evidence).toContainEqual({ field: "target", quote: "demo-laptop" });
    expect(evaluatePolicy(canonical).ruleIds).toContain("SEC-002");
    expect(evaluatePolicy(canonical).missingFields).toEqual([]);
  });

  it.each([
    "Mở port 0 ra Internet.", "Mở port 65536 ra Internet.", "Mở port 999999 ra Internet.",
    "Mở port -3389 ra Internet.", "Mở port 3389.5 ra Internet.",
    "Mở ports 3389, 443 ra Internet.", "Mở ports 3389 và 443 ra Internet.",
    "Mở ports 3389/443 ra Internet.", "Mở port 3389-3390 ra Internet.",
    "Mở cổng 3389 đến 3390 ra Internet.", "Mở port 3389 và port 443 ra Internet.",
  ])("does not select a port from an invalid or ambiguous scope: %s", (raw) => {
    const canonical = extractIntake(input(raw));
    expect(canonical.entities).not.toHaveProperty("port");
    expect(canonical.missingFields).toContain("port");
    expect(canonical.ambiguities.length).toBeGreaterThan(0);
    expect(canonical.evidence).toContainEqual({ field: "input", quote: raw });
    const decision = evaluatePolicy(canonical);
    expect(decision.action).toBe("ESCALATE");
    expect(decision.ruleIds).toContain("SEC-002");
    expect(decision.missingFields).toContain("port");
  });

  it("keeps contradictory port assignments visible", () => {
    const canonical = extractIntake(input("Open port to Internet; port=3389; port=443"));
    expect(canonical.entities).not.toHaveProperty("port");
    expect(canonical.riskSignals).toEqual(expect.arrayContaining(["PUBLIC_EXPOSURE", "CONFLICT"]));
    expect(canonical.evidence).toContainEqual({ field: "port", quote: "3389" });
    expect(canonical.evidence).toContainEqual({ field: "port", quote: "443" });
  });

  it("does not extract a port that was explicitly excluded", () => {
    const canonical = extractIntake(input("Không mở port 3389; mở port 443 ra Internet."));
    expect(canonical.entities.port).toBe("443");
    expect(canonical.evidence).not.toContainEqual({ field: "port", quote: "3389" });
  });

  it.each(["TCP port 3389", "port 3389/TCP", "port 3389 TCP"])("keeps an explicitly adjacent protocol: %s", (phrase) => {
    const canonical = extractIntake(input(`Open ${phrase} to Internet.`));
    expect(canonical.entities).toMatchObject({ port: "3389", protocol: "TCP" });
    expect(canonical.evidence).toContainEqual({ field: "protocol", quote: "TCP" });
  });

  it.each(["TCP/UDP", "TCP or UDP", "TCP, UDP", "SCTP"])("does not select a protocol from an unsupported declaration: %s", (protocol) => {
    const canonical = extractIntake(input(`Open port 3389 to Internet; protocol: ${protocol}`));
    expect(canonical.entities).not.toHaveProperty("protocol");
    expect(canonical.missingFields).toContain("protocol");
    expect(evaluatePolicy(canonical).missingFields).toContain("protocol");
  });

  it.each(["source", "target"])("preserves a comma-separated %s scope instead of choosing its first member", (field) => {
    const raw = `Open port 443 to Internet; ${field}: demo-one, demo-two`;
    const canonical = extractIntake(input(raw));
    expect(canonical.entities).not.toHaveProperty(field);
    expect(canonical.missingFields).toContain(field);
    expect(canonical.evidence).toContainEqual({ field, quote: "demo-one, demo-two" });
    expect(evaluatePolicy(canonical).ruleIds).toContain("SEC-002");
  });

  it("separates labelled fields after a comma while retaining a protocol list", () => {
    const canonical = extractIntake(input("Open port 443 to Internet; protocol: TCP, UDP, source: demo-client, target: demo-server"));
    expect(canonical.entities).toMatchObject({ source: "demo-client", target: "demo-server" });
    expect(canonical.entities.protocol).toBeUndefined();
    expect(canonical.missingFields).toContain("protocol");
    expect(canonical.evidence).toContainEqual({ field: "protocol", quote: "TCP, UDP" });
  });

  it("does not assume an arbitrary endpoint identifier is case-insensitive", () => {
    const canonical = extractIntake(input("Open port 443 to Internet; source: PodA; source: poda"));
    expect(canonical.entities.source).toBeUndefined();
    expect(canonical.missingFields).toContain("source");
    expect(canonical.riskSignals).toContain("CONFLICT");
    expect(canonical.evidence).toEqual(expect.arrayContaining([
      { field: "source", quote: "PodA" }, { field: "source", quote: "poda" },
    ]));
  });

  it("does not select the first adjacent protocol or infer one from an unrelated number", () => {
    for (const phrase of ["port 3389/TCP/UDP", "TCP/UDP port 3389", "TCP or UDP port 3389"]) {
      const multiple = extractIntake(input(`Open ${phrase} to Internet.`));
      expect(multiple.entities.protocol).toBeUndefined();
      expect(multiple.missingFields).toContain("protocol");
    }
    const unrelated = extractIntake(input("Open port 3389 to Internet, there are 10 SSH sessions."));
    expect(unrelated.entities.protocol).toBeUndefined();
  });

  it.each(["TCP, UDP port 443", "port 443 TCP, UDP"])("keeps a comma-separated adjacent protocol list unresolved: %s", (phrase) => {
    const canonical = extractIntake(input(`Open ${phrase} to Internet.`));
    expect(canonical.entities.port).toBe("443");
    expect(canonical.entities.protocol).toBeUndefined();
    expect(canonical.missingFields).toContain("protocol");
    expect(canonical.evidence).toContainEqual({ field: "protocol", quote: "TCP, UDP" });
    expect(evaluatePolicy(canonical).ruleIds).toContain("SEC-002");
  });

  it("does not confuse Vietnamese công ty with a network cổng", () => {
    const canonical = extractIntake(input("Internet công ty là gì?"));
    expect(canonical.riskSignals).not.toContain("PUBLIC_EXPOSURE");
  });
});

describe("network model facts retain scope and recompute missing fields", () => {
  beforeEach(() => vi.stubEnv("AI_PROVIDER", "openai"));
  afterEach(() => vi.unstubAllEnvs());

  const wire = (raw: string, entityFacts: { field: string; quote: string }[] = [], missingFields: string[] = []) => ({
    language: "en", routing: { route: "support", serviceGroup: "NETWORK_VPN", intentLabel: "PORT_OPEN_REQUEST", requestKind: "CONFIGURATION_CHANGE" },
    entityFacts, environment: "unknown", requestedAction: "change", riskSignals: [], missingFields, ambiguities: [], intentEvidence: raw,
    sentiment: { sentiment: "neutral", evidence: raw, explanation: "Synthetic request describes a network change." },
  });

  it("does not call extraction across the public exposure gate, but keeps the known port", async () => {
    const value = input("Mở port 3389 ra Internet để truy cập từ xa vào máy công ty.");
    const run = vi.fn(async () => { throw new Error("Model must not replace hazard facts"); });
    const canonical = await extractWithModel(value, extractIntake(value), { run });
    expect(run).not.toHaveBeenCalled();
    expect(canonical.entities.port).toBe("3389");
    expect(evaluatePolicy(canonical).missingFields).not.toContain("port");
    expect(evaluatePolicy(canonical).ruleIds).toContain("SEC-002");
  });

  it("removes stale model-missing fields only after merging valid known facts", async () => {
    const value = input("Open port 443 for a sandbox connection; protocol: TCP", { source: "demo-client", target: "demo-server" });
    const canonical = await extractWithModel(value, extractIntake(value), { run: async () => wire(value.rawText, [], ["port", "protocol", "source", "target", "duration"]) });
    expect(canonical.model.failure).toBeUndefined();
    expect(canonical.entities).toMatchObject({ port: "443", protocol: "TCP", source: "demo-client", target: "demo-server" });
    for (const field of ["port", "protocol", "source", "target"]) expect(canonical.missingFields).not.toContain(field);
    expect(canonical.missingFields).toContain("duration");
  });

  it.each(["3389-3390", "3389, 3390", "-3389"])("does not let the model narrow unresolved scope %s to a literal substring", async (port) => {
    const value = input(`Open port ${port} for a sandbox connection.`);
    const canonical = await extractWithModel(value, extractIntake(value), { run: async () => wire(value.rawText, [{ field: "port", quote: "3389" }]) });
    expect(canonical.entities.port).toBeUndefined();
    expect(canonical.missingFields).toContain("port");
    expect(canonical.evidence.some(item => item.quote.includes(port))).toBe(true);
    expect(evaluatePolicy(canonical).action).not.toBe("AUTO_APPROVE");
  });

  it("rejects a source port relabelled as the destination by the model", async () => {
    const value = input("Open source port 50000 for a sandbox connection.");
    const canonical = await extractWithModel(value, extractIntake(value), { run: async () => wire(value.rawText, [{ field: "port", quote: "50000" }]) });
    expect(canonical.entities.port).toBeUndefined();
    expect(canonical.model.failure).toBe("MODEL_EVIDENCE_INVALID");
  });

  it.each([
    ["source", "target"], ["target", "source"],
  ])("rejects a literal %s endpoint relabelled as %s by the model", async (stated, invented) => {
    const value = input(`Open port 443 for a sandbox connection; ${stated}: demo-client`);
    const canonical = await extractWithModel(value, extractIntake(value), { run: async () => wire(value.rawText, [{ field: invented, quote: "demo-client" }]) });
    expect(canonical.model.failure).toBe("MODEL_EVIDENCE_INVALID");
    expect(canonical.entities[stated]).toBe("demo-client");
    expect(canonical.entities[invented]).toBeUndefined();
  });

  it("rejects swapping already declared source and target roles", async () => {
    const value = input("Open port 443 for a sandbox connection; source: demo-client; target: demo-server");
    const canonical = await extractWithModel(value, extractIntake(value), { run: async () => wire(value.rawText, [
      { field: "source", quote: "demo-server" }, { field: "target", quote: "demo-client" },
    ]) });
    expect(canonical.model.failure).toBe("MODEL_EVIDENCE_INVALID");
    expect(canonical.entities).toMatchObject({ source: "demo-client", target: "demo-server" });
  });

  it("allows correctly attributed explicit endpoint facts", async () => {
    const value = input("Open port 443 for a sandbox connection; source: demo-client; target: demo-server");
    const canonical = await extractWithModel(value, extractIntake(value), { run: async () => wire(value.rawText, [
      { field: "source", quote: "demo-client" }, { field: "target", quote: "demo-server" },
    ]) });
    expect(canonical.model.failure).toBeUndefined();
    expect(canonical.entities).toMatchObject({ source: "demo-client", target: "demo-server" });
  });

  it("keeps a port conflict in the form before invoking the model", async () => {
    const value = input("Open port 3389 for a sandbox connection.", { port: "443" });
    const run = vi.fn(async () => wire(value.rawText));
    const canonical = await extractWithModel(value, extractIntake(value), { run });
    expect(run).not.toHaveBeenCalled();
    expect(canonical.riskSignals).toContain("CONFLICT");
    expect(canonical.missingFields).toContain("port");
    expect(canonical.entities.port).toBeUndefined();
  });
});

describe("network form and prose facts reconcile without inventing scope", () => {
  it("computes missing facts after merging complementary form facts", () => {
    const canonical = extractIntake(input("Mở port 3389 ra Internet để truy cập từ xa vào máy công ty.", {
      source: "198.51.100.8", target: "demo-laptop", protocol: "TCP", environment: "staging",
    }));
    expect(canonical.entities.port).toBe("3389");
    expect(evaluatePolicy(canonical).missingFields).toEqual([]);
    expect(evaluatePolicy(canonical).ruleIds).toContain("SEC-002");
  });

  it("accepts matching form and prose ports", () => {
    const canonical = extractIntake(input("Open port 3389 to Internet.", { port: "3389" }));
    expect(canonical.entities.port).toBe("3389");
    expect(canonical.riskSignals).not.toContain("CONFLICT");
  });

  it.each(["443", "0", "65536", "3389-3390", "3389,443"])("does not overwrite the stated port with %s", (port) => {
    const canonical = extractIntake(input("Open port 3389 to Internet.", { port }));
    expect(canonical.entities).not.toHaveProperty("port");
    expect(canonical.riskSignals).toContain("CONFLICT");
    expect(canonical.missingFields).toContain("port");
    expect(canonical.evidence).toContainEqual({ field: "port", quote: `port=${port}` });
    expect(evaluatePolicy(canonical).action).toBe("ESCALATE");
  });

  it("does not silently narrow a range to the submitted form port", () => {
    const canonical = extractIntake(input("Open ports 3389-3390 to Internet.", { port: "3389" }));
    expect(canonical.entities).not.toHaveProperty("port");
    expect(canonical.riskSignals).toContain("CONFLICT");
    expect(canonical.missingFields).toContain("port");
  });

  it.each(["demo-two", "demo one"])("treats a contrary endpoint %s as an unresolved conflict", (target) => {
    const canonical = extractIntake(input("Open port 3389 to Internet; target: demo-one", { target }));
    expect(canonical.entities).not.toHaveProperty("target");
    expect(canonical.missingFields).toContain("target");
    expect(canonical.riskSignals).toContain("CONFLICT");
  });

  it("rejects invalid structured-only ports as missing facts", () => {
    const canonical = extractIntake({ ...input("", { intentLabel: "PORT_OPEN_REQUEST", port: "65536", publicExposure: "yes" }),
      mode: "structured", serviceGroup: "NETWORK_VPN", requestKind: "CONFIGURATION_CHANGE" });
    expect(canonical.entities).not.toHaveProperty("port");
    expect(canonical.missingFields).toContain("port");
    expect(evaluatePolicy(canonical).ruleIds).toContain("SEC-002");
  });
});
