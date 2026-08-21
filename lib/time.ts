import { addMonths, format, parseISO, startOfMonth } from "date-fns";

/**
 * Which day is today, and where a month starts and ends.
 *
 * Rule 6 of spec 0001, as spec 0004 corrects it: the calendar day comes from
 * the signed in person's own timezone, read through `getSettings()`, never from
 * the server clock, never from the browser, and no longer from APP_TIMEZONE. A
 * server in one place deciding the current month for a person in another gets
 * it wrong late on the last evening of a month, which is exactly when you are
 * checking what you spent.
 *
 * The timezone is a required argument rather than a default read from the
 * environment, which is what makes that rule enforceable: there is no way to
 * call these and accidentally get somebody else's idea of today.
 *
 * A plain date such as "2026-08-19" carries no time and no zone, so once the
 * calendar day is settled here, everything downstream is ordinary date maths.
 */

/** A calendar day with no time and no zone, formatted YYYY-MM-DD. */
export type PlainDate = string;

/**
 * The calendar day it currently is in a given zone.
 *
 * Intl does the zone shift, which avoids hand rolled offset arithmetic and
 * stays correct across daylight saving changes.
 */
export function today(now: Date, timeZone: string): PlainDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;

  const year = get("year");
  const month = get("month");
  const day = get("day");

  if (!year || !month || !day) {
    throw new Error(`Could not read a calendar date for time zone ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

/**
 * The month containing `day`, as a half open range: start is included,
 * endExclusive is not.
 *
 * Half open is what SQL wants (`occurred_on >= start AND occurred_on <
 * endExclusive`), and it removes the off by one day that an inclusive end
 * invites.
 */
export function monthRange(day: PlainDate): {
  start: PlainDate;
  endExclusive: PlainDate;
} {
  const first = startOfMonth(parseISO(day));
  return {
    start: format(first, "yyyy-MM-dd"),
    endExclusive: format(addMonths(first, 1), "yyyy-MM-dd"),
  };
}

/** The month you are in right now, in a given zone. */
export function currentMonthRange(
  now: Date,
  timeZone: string,
): {
  start: PlainDate;
  endExclusive: PlainDate;
} {
  return monthRange(today(now, timeZone));
}

/**
 * Render a plain date for a person to read.
 *
 * Formatting happens in UTC on purpose. A PlainDate carries no time and no
 * zone, so "2026-08-19" parses to midnight UTC; formatting that instant in any
 * other zone can land on the 18th and show the wrong day. UTC in and UTC out
 * means the string that goes in is the day that comes out.
 *
 * This is the only place a date becomes text, so no component formats one
 * itself (spec 0003 AC-12).
 */
export function formatPlainDate(
  date: PlainDate,
  style: "short" | "full" = "short",
  locale = "en-US",
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Expected a YYYY-MM-DD plain date, received ${date}`);
  }

  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "long", day: "numeric" };

  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "UTC",
  }).format(parseISO(`${date}T00:00:00Z`));
}

/**
 * The zones a picker may offer, which is the set the database will accept.
 *
 * Read from the runtime rather than kept as a list here, because the set of
 * zone names belongs to the platform's timezone database and a copy in this
 * repository would go stale the first time a country changes its mind about
 * daylight saving.
 *
 * One correction is applied on the way out, and it is not cosmetic. The runtime
 * and the database both track IANA data, but they disagree about which name is
 * primary once a zone has been renamed: ICU still offers `Asia/Calcutta`, while
 * this Postgres build does not recognise that name at all and refuses to store
 * it. Offering a name the database will refuse is worse than it first looks,
 * because `/setup` is the screen every new account has to finish before it can
 * use anything, and for India, Ukraine, Vietnam, Myanmar, Argentina, Nepal, and
 * Greenland the runtime offers only the old name. Somebody in Delhi could pick
 * their own zone and never get off the setup screen.
 */
const RENAMED_ZONES: Readonly<Record<string, string>> = {
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
};

/**
 * Every zone name a picker may offer, corrected and sorted.
 *
 * Each pair in `RENAMED_ZONES` is a rename and nothing else: both names resolve
 * to the same offset, checked at the same instant, so substituting one for the
 * other changes what the database stores and never what time it is. The drift
 * test in `tests/integration/schema-drift.test.ts` fails if the runtime and the
 * database ever disagree again, which is the part that stops this rotting
 * quietly the next time either side updates its timezone data.
 */
export function timeZoneNames(): readonly string[] {
  const corrected = Intl.supportedValuesOf("timeZone").map(
    (zone) => RENAMED_ZONES[zone] ?? zone,
  );
  return [...new Set(corrected)].sort();
}
