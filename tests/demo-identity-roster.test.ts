import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import roster from "../data/demo-identities.json";
import { evaluateScope, generateEmployeeId, loginSchema, profileSchema } from "@/domain/identity";

describe("synthetic demo identity roster", () => {
  it("contains exactly 40 distinct names, IDs, positions and profiles", () => {
    expect(roster.version).toBe(2);
    expect(roster.synthetic).toBe(true);
    expect([3, 4, 5].map(length => roster.accounts.filter(a => a.fullName.split(/\s+/).length === length).length)).toEqual([24, 12, 4]);
    expect(roster.accounts).toHaveLength(40);
    for (const field of ["id", "fullName", "jobPosition", "profileId"] as const)
      expect(new Set(roster.accounts.map(account => account[field])).size).toBe(40);
    expect(generateEmployeeId("Phạm Thiên Bình")).toBe("binhpt");
    expect(roster.accounts.some(account => account.id === "itnvgl")).toBe(false);
  });
  it("documents all current names and IDs in the README", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    for (const account of roster.accounts)
      expect(readme).toContain("| `" + account.id + "` | " + account.fullName + " | " + account.jobPosition + " |");
  });
  for (const [index, account] of roster.accounts.entries()) {
    it(`${account.id}: validates the name and job, permits only the expected scope and denies other IDs`, () => {
      expect(generateEmployeeId(account.fullName)).toBe(account.id);
      expect(loginSchema.parse({ employeeId: account.id.toUpperCase() }).employeeId).toBe(account.id);
      const profile = profileSchema.parse({ id: account.profileId, version: account.profileVersion, name: `${account.jobPosition} — demo`, scopes: account.scopes, active: true, createdAt: "2026-10-15T00:00:00.000Z", createdBy: roster.batchId });
      const own = evaluateScope(profile.scopes, profile.scopes[0]);
      expect(own.bucket).toBe(account.expectedAccess);
      expect(own.allowed).toBe(account.expectedAccess === "IN_SCOPE");
      const other = roster.accounts[(index + 1) % roster.accounts.length];
      expect(evaluateScope(profile.scopes, { ...profile.scopes[0], target: other.scopes[0].target })).toMatchObject({ allowed: false, bucket: "OUT_OF_SCOPE" });
      expect(evaluateScope(profile.scopes, { ...profile.scopes[0], environment: profile.scopes[0].environment === "sandbox" ? "staging" : "sandbox" })).toMatchObject({ allowed: false, bucket: "OUT_OF_SCOPE" });
    });
  }
});
