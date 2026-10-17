import { describe, expect, it } from "vitest";
import { businessElapsed } from "@/domain/service-calendar";
import { calendarSchema, type ServiceCalendar } from "@/domain/service-level-config";

const hour = 3_600_000;
const office = (overrides: Partial<ServiceCalendar> = {}): ServiceCalendar => calendarSchema.parse({
  id: "synthetic-office", version: "test-v1", mode: "BUSINESS", timeZone: "Asia/Ho_Chi_Minh",
  week: [1, 2, 3, 4, 5].map(day => ({ day, intervals: [{ startMinute: 540, endMinute: 720 }, { startMinute: 780, endMinute: 1020 }] })),
  holidays: [], ...overrides,
});
describe("approved business calendars (synthetic test schedules only)", () => {
  it("never invents working hours when the calendar is missing", () => {
    expect(businessElapsed("2026-10-19T00:00:00Z", "2026-10-19T10:00:00Z", null)).toBeNull();
  });
  it("excludes off-hours and lunch in the configured zone", () => {
    expect(businessElapsed("2026-10-19T01:00:00Z", "2026-10-19T11:00:00Z", office())).toBe(7 * hour);
  });
  it("preserves fractional seconds on partial working intervals", () => {
    expect(businessElapsed("2026-10-19T01:59:59.900Z", "2026-10-19T02:00:00.125Z", office())).toBe(125);
  });
  it("excludes weekends and explicit local holidays", () => {
    expect(businessElapsed("2026-10-16T09:00:00Z", "2026-10-19T03:00:00Z", office())).toBe(2 * hour);
    expect(businessElapsed("2026-10-16T09:00:00Z", "2026-10-19T03:00:00Z", office({ holidays: ["2026-10-19"] }))).toBe(hour);
  });
  it("counts every real hour in an explicitly continuous calendar", () => {
    expect(businessElapsed("2026-10-17T00:00:00Z", "2026-10-18T00:00:00Z", office({ mode: "CONTINUOUS" }))).toBe(24 * hour);
  });
  it.each([
    ["2026-03-08T06:00:00Z", "2026-03-08T08:00:00Z", 2],
    ["2026-11-01T05:00:00Z", "2026-11-01T08:00:00Z", 3],
  ])("handles New York DST gap/fold from %s", (from, to, hours) => {
    const calendar = office({ timeZone: "America/New_York", week: [{ day: 0, intervals: [{ startMinute: 60, endMinute: 240 }] }] });
    expect(businessElapsed(from, to, calendar)).toBe(hours * hour);
  });
  it("handles a half-hour DST change without assuming whole-hour zone offsets", () => {
    const calendar = office({ timeZone: "Australia/Lord_Howe", week: [{ day: 0, intervals: [{ startMinute: 60, endMinute: 180 }] }] });
    expect(businessElapsed("2026-10-03T14:30:00Z", "2026-10-03T16:00:00Z", calendar)).toBe(1.5 * hour);
  });
  it("rejects invalid calendars, overlapping shifts and duplicated weekdays", () => {
    const calendar = office();
    for (const overrides of [{ timeZone: "Synthetic/Invalid" }, { holidays: ["2026-02-30"] },
      { week: [{ day: 1, intervals: [{ startMinute: 600, endMinute: 500 }] }] },
      { week: [{ day: 1, intervals: [{ startMinute: 0, endMinute: 600 }, { startMinute: 500, endMinute: 700 }] }] },
      { week: [calendar.week[0], calendar.week[0]] }])
      expect(calendarSchema.safeParse({ ...calendar, ...overrides }).success).toBe(false);
  });
  it("returns explicit unknown for invalid/reversed dates and bounded calculation limits", () => {
    expect(businessElapsed("invalid", "2026-10-19T00:00:00Z", office())).toBeNull();
    expect(businessElapsed("2026-10-20T00:00:00Z", "2026-10-19T00:00:00Z", office())).toBeNull();
    expect(businessElapsed("2026-01-01T00:00:00Z", "2037-01-01T00:00:00Z", office())).toBeNull();
  });
});
