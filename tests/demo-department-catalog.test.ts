import { describe, expect, it } from "vitest";
import roster from "../data/demo-identities.json";
import { fieldOptions } from "@/domain/catalog";
import { optionName } from "@/domain/presentation";
import { guestDepartments } from "@/domain/guest-session";
import { readFileSync } from "node:fs";

describe("demo employee departments", () => {
  it("uses every department offered by the sender dropdown, including Marketing and Sales", () => {
    const assigned = [...new Set(roster.accounts.map(row => row.department))].sort();
    expect(assigned).toEqual([...fieldOptions.department].sort());
    expect([...guestDepartments].sort()).toEqual(assigned);
    for (const department of assigned) {
      expect(optionName(department)).not.toBe(department);
    }
  });
  it("documents exactly the department assigned to each of the 40 IDs", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    for (const row of roster.accounts) {
      expect(readme).toContain(`| \`${row.id}\` | ${row.fullName} | ${row.jobPosition} | ${optionName(row.department)} |`);
    }
  });
});
