import { describe, expect, it } from "vitest";

import {
  currentMonthRange,
  formatPlainDate,
  monthRange,
  timeZoneNames,
  today,
} from "@/lib/time";

/**
 * Locks rule 6 of spec 0001, as spec 0004 corrects it: the calendar day comes
 * from the zone it is handed, which for a signed in person is their own from
 * getSettings(), and never from the machine running this. Both arguments are
 * required, so the suite gives the same answer on your laptop and in CI, and so
 * no caller can fall back to a server default by leaving one out.
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
  it("derives the month from the person's own zone, not the server's", () => {
    // 02:00 UTC on 1 September is 31 August in New York, so the current month
    // is still August. A server clock would say September and be wrong.
    expect(
      currentMonthRange(new Date("2026-09-01T02:00:00Z"), "America/New_York"),
    ).toEqual({
      start: "2026-08-01",
      endExclusive: "2026-09-01",
    });
  });

  it("puts two people in different months at the same instant", () => {
    // The same moment, one person in Tokyo and one in New York, on the last
    // evening of a month: the whole reason the zone is per person.
    const now = new Date("2026-09-01T02:00:00Z");
    expect(currentMonthRange(now, "Asia/Tokyo").start).toBe("2026-09-01");
    expect(currentMonthRange(now, "America/New_York").start).toBe("2026-08-01");
  });
});

describe("formatPlainDate", () => {
  it("shows the day it was given, never the day before", () => {
    // The bug this guards: parsing to midnight UTC then formatting in a
    // negative offset zone lands on the previous day.
    expect(formatPlainDate("2026-08-19")).toBe("Aug 19");
    expect(formatPlainDate("2026-01-01")).toBe("Jan 1");
    expect(formatPlainDate("2026-12-31")).toBe("Dec 31");
  });

  it("spells the month out in the full style", () => {
    expect(formatPlainDate("2026-08-19", "full")).toBe("August 19, 2026");
  });

  it("refuses anything that is not a plain date", () => {
    expect(() => formatPlainDate("19/08/2026")).toThrow(/plain date/);
    expect(() => formatPlainDate("2026-08-19T10:00:00Z")).toThrow(/plain date/);
  });
});

describe("timeZoneNames", () => {
  // Every name here was offered by the picker and refused by the database,
  // which trapped a new account on /setup: it could not finish, and an
  // incomplete profile is sent straight back to /setup. This Postgres build
  // does not recognise the old names at all.
  const RENAMED = {
    "Africa/Asmera": "Africa/Asmara",
    "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
    "America/Catamarca": "America/Argentina/Catamarca",
    "America/Cordoba": "America/Argentina/Cordoba",
    "America/Godthab": "America/Nuuk",
    "America/Indianapolis": "America/Indiana/Indianapolis",
    "America/Jujuy": "America/Argentina/Jujuy",
    "America/Louisville": "America/Kentucky/Louisville",
    "America/Mendoza": "America/Argentina/Mendoza",
    "Asia/Calcutta": "Asia/Kolkata",
    "Asia/Katmandu": "Asia/Kathmandu",
    "Asia/Rangoon": "Asia/Yangon",
    "Asia/Saigon": "Asia/Ho_Chi_Minh",
    "Atlantic/Faeroe": "Atlantic/Faroe",
    "Europe/Kiev": "Europe/Kyiv",
    "Pacific/Enderbury": "Pacific/Kanton",
    "Pacific/Ponape": "Pacific/Pohnpei",
    "Pacific/Truk": "Pacific/Chuuk",
  } as const;

  it("never offers a name this database refuses to store", () => {
    const offered = new Set(timeZoneNames());
    const stillOffered = Object.keys(RENAMED).filter((old) => offered.has(old));
    expect(
      stillOffered,
      "the picker is offering unstorable zone names",
    ).toEqual([]);
  });

  it("offers the name the database does accept in its place", () => {
    const offered = new Set(timeZoneNames());
    const missing = Object.values(RENAMED).filter(
      (canonical) => !offered.has(canonical),
    );
    expect(missing, "a country lost its only selectable zone").toEqual([]);
  });

  it("substitutes a rename, never a different time", () => {
    // If a pair ever stopped agreeing on the offset, the substitution would be
    // silently moving somebody's month boundary rather than renaming a zone.
    const at = new Date("2026-08-21T12:00:00Z");
    const offsetOf = (zone: string) =>
      new Intl.DateTimeFormat("en", {
        timeZone: zone,
        timeZoneName: "longOffset",
      })
        .format(at)
        .split(" ")
        .pop();

    for (const [old, canonical] of Object.entries(RENAMED)) {
      expect(offsetOf(canonical), `${old} and ${canonical} disagree`).toBe(
        offsetOf(old),
      );
    }
  });

  it("has no duplicates and stays sorted, so the picker reads sanely", () => {
    const offered = timeZoneNames();
    expect(new Set(offered).size).toBe(offered.length);
    expect([...offered]).toEqual([...offered].sort());
  });
});
