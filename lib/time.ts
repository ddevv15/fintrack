import { addMonths, format, parseISO, startOfMonth } from "date-fns";

import { env } from "@/lib/env";

/**
 * Which day is today, and where a month starts and ends.
 *
 * Rule 6 of spec 0001: the server works this out from APP_TIMEZONE, never from
 * its own clock and never from the browser's. A server in one place deciding
 * the current month for a person in another gets it wrong late on the last
 * evening of a month, which is exactly when you are checking what you spent.
 *
 * A plain date such as "2026-08-19" carries no time and no zone, so once the
 * calendar day is settled here, everything downstream is ordinary date maths.
 */

/** A calendar day with no time and no zone, formatted YYYY-MM-DD. */
export type PlainDate = string;

/**
 * The calendar day it currently is in the app's reference zone.
 *
 * Intl does the zone shift, which avoids hand rolled offset arithmetic and
 * stays correct across daylight saving changes.
 */
export function today(
  now: Date = new Date(),
  timeZone: string = env().APP_TIMEZONE,
): PlainDate {
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

/** The month you are in right now, in the app's reference zone. */
export function currentMonthRange(now?: Date): {
  start: PlainDate;
  endExclusive: PlainDate;
} {
  return monthRange(today(now));
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
