import { describe, expect, it } from "vitest";
import { extractIntake, normalizeQuotedFact } from "@/domain/text";

function baseline(rawText: string) {
  return extractIntake({ mode: "freeform", serviceGroup: "OTHER", rawText, fields: {},
    confirmed: false, idempotencyKey: "synthetic-quoted-fact" });
}

describe("literal evidence and existing server fact normalization", () => {
  it.each([
    ["four hours", "4 hours"], ["bốn giờ", "4 hours"], ["hai ngày", "2 days"],
  ])("retains duration semantics from a confirming literal quote: %s", (quote, expected) => {
    const request = baseline(`Cần đọc GitHub repo demo/docs trong ${quote} để kiểm tra tài liệu.`);
    expect(request.entities.duration).toBe(expected);
    expect(normalizeQuotedFact("duration", quote, request)).toBe(expected);
  });

  it.each(["eight hours", "four hours or eight hours", "-4 hours", "duration -4 hours", "4 to 8 hours", "four"])("does not normalize a contrary or unbounded duration: %s", (quote) => {
    const request = baseline("Need read-only GitHub repo demo/docs for four hours to review synthetic documentation.");
    expect(normalizeQuotedFact("duration", quote, request)).toBe(quote);
  });

  it("does not convert a server-recognized negative interval to a valid positive one", () => {
    const request = baseline("Need read-only GitHub repo demo/docs for -4 hours to review synthetic documentation.");
    expect(request.entities.duration).toBe("-4 hours");
    expect(normalizeQuotedFact("duration", "4 hours", request)).toBe("4 hours");
  });

  it.each(["Developer", "vai trò Developer"])("retains the bounded Jira Developer mapping for %s", (quote) => {
    const request = baseline("Tôi xin vai trò Developer trong Jira project DEMO để cập nhật ticket được giao.");
    expect(normalizeQuotedFact("accessType", quote, request)).toBe("developer-assigned");
  });

  it("retains the bounded Jira standard agent mapping", () => {
    const request = baseline("Need role standard agent in Jira project DEMO to handle assigned tickets.");
    expect(normalizeQuotedFact("accessType", "standard agent", request)).toBe("agent-assigned");
  });

  it.each(["Developer or admin", "not Developer", "standard agent", "root"])("retains contrary or compound role evidence instead of granting the prior role: %s", (quote) => {
    const request = baseline("Tôi xin vai trò Developer trong Jira project DEMO để cập nhật ticket được giao.");
    expect(normalizeQuotedFact("accessType", quote, request)).toBe(quote);
  });

  it("does not invent a role when the complete input did not establish it", () => {
    const request = baseline("Need read-only GitHub repo demo/docs for four hours to review synthetic documentation.");
    expect(normalizeQuotedFact("accessType", "Developer", request)).toBe("Developer");
    expect(normalizeQuotedFact("permission", "Developer", request)).toBe("Developer");
    expect(normalizeQuotedFact("permission", "chỉ đọc", request)).toBe("read-only");
    expect(normalizeQuotedFact("permission", "read and write", request)).toBe("read and write");
  });

  it("leaves every other quoted field unchanged", () => {
    const request = baseline("Need read-only GitHub repo demo/docs for four hours to review synthetic documentation.");
    expect(normalizeQuotedFact("repository", "demo/docs", request)).toBe("demo/docs");
    expect(normalizeQuotedFact("approvalStatus", "approved", request)).toBe("approved");
  });
});
