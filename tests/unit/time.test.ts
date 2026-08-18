import { describe, expect, it } from "vitest";

import { currentMonthRange, monthRange, today } from "@/lib/time";

/**
 * Locks rule 6 of spec 0001: the calendar day comes from APP_TIMEZONE, not from
 * the machine running this. Every case passes `now` and the zone explicitly, so
 * the suite gives the same answer on your laptop and in CI.
 */
describe("today", () => {
  it("reads the calendar day in the given zone, not in UTC", () => {
    // 02:00 UTC on 1 September is still 31 August in New York.
    const now = new Date("2026-09-01T02:00:00Z");
    expect(today(now, "America/New_York")).toBe("2026-08-31");
    expect(today(now, "UTC")).toBe("2026-09-01");
  });

  it("rolls forward for a zone ahead of UTC", () => {
    // 20:00 UTC on 31 August is already 1 September in Tokyo.
    const now = new Date("2026-08-31T20:00:00Z");
    expect(today(now, "Asia/Tokyo")).toBe("2026-09-01");
    expect(today(now, "UTC")).toBe("2026-08-31");
  });

  it("holds through a daylight saving change", () => {
    // 06:30 UTC on the US spring forward Sunday is 02:30 EDT, same calendar day.
    const now = new Date("2026-03-08T06:30:00Z");
    expect(today(now, "America/New_York")).toBe("2026-03-08");
  });

  it("pads the month and day to two digits", () => {
    const now = new Date("2026-01-05T12:00:00Z");
    expect(today(now, "UTC")).toBe("2026-01-05");
  });

  it("refuses a zone it does not recognise", () => {
    expect(() => today(new Date(), "Mars/Olympus_Mons")).toThrow();
  });
});

describe("monthRange", () => {
  it("returns a half open range: start included, end excluded", () => {
    expect(monthRange("2026-08-19")).toEqual({
      start: "2026-08-01",
      endExclusive: "2026-09-01",
    });
  });

  it("gives the same range from any day in the month", () => {
    expect(monthRange("2026-08-01")).toEqual(monthRange("2026-08-31"));
  });

  it("rolls the year over at December", () => {
    expect(monthRange("2026-12-25")).toEqual({
      start: "2026-12-01",
      endExclusive: "2027-01-01",
    });
  });

  it("ends February on the 1st of March in a leap year", () => {
    // The end being exclusive is what removes the 28 versus 29 question.
    expect(monthRange("2028-02-29")).toEqual({
      start: "2028-02-01",
      endExclusive: "2028-03-01",
    });
  });
});

describe("currentMonthRange", () => {
  it("derives the month from the app's own idea of today", () => {
    // 02:00 UTC on 1 September is 31 August in New York, so the current month
    // is still August. A server clock would say September and be wrong.
    process.env.APP_TIMEZONE = "America/New_York";
    process.env.NEXT_PUBLIC_INSFORGE_URL = "https://example.insforge.app";
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY = "test-anon-key";
    process.env.APP_CURRENCY = "USD";

    expect(currentMonthRange(new Date("2026-09-01T02:00:00Z"))).toEqual({
      start: "2026-08-01",
      endExclusive: "2026-09-01",
    });
  });
});
