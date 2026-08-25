import { decimalsFor } from "@/lib/currency";
import { env } from "@/lib/env";

/**
 * The one module that converts money for display.
 *
 * Rule 1 of spec 0001, as spec 0004 corrects it: amounts are read and written
 * as a whole number of minor units, and nothing outside this file multiplies or
 * divides an amount. A minor unit is the smallest unit the currency actually
 * has, which is a cent for a dollar, a whole yen for a yen, and a thousandth of
 * a dinar for a Kuwaiti dinar. Whole integers are exact in Postgres, exact
 * under SUM, and exact across JSON, which a decimal number is not.
 *
 * How many minor units make one major unit comes from `lib/currency.ts`, never
 * from a hardcoded hundred and never from `Intl`. Intl answers from whatever
 * ICU version the runtime ships, and a server and a browser disagreeing about
 * the yen renders an amount a hundred times off.
 *
 * Turning what you type into minor units is deliberately not here yet. Rounding
 * a typed amount is a product choice (round, truncate, or refuse), and it
 * belongs with feature 6, log a spend.
 */
export type MinorUnits = number;

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(
  currency: string,
  locale: string,
  decimals: number,
): Intl.NumberFormat {
  const key = `${locale}:${currency}:${decimals}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      // Pinned to our own list rather than left to Intl's default for the
      // currency, so the digits shown and the divisor used below can never
      // disagree with each other.
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Render whole minor units as money you can read.
 *
 * The stored integer 500 is ¥500 on a yen profile, $5.00 on a dollar profile,
 * and 0.500 dinar on a Kuwaiti one. The integer never changes meaning; only the
 * number of decimal places does, and that is a fact about the currency.
 *
 * `currency` defaults to APP_CURRENCY, which is now only the value the sign up
 * form preselects and which only exists on the server. Every signed in screen
 * passes the currency from `getSettings()` explicitly.
 */
export function formatAmount(
  amount: MinorUnits,
  currency: string = env().APP_CURRENCY,
  locale = "en-US",
): string {
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Money must be whole minor units, received ${amount}`);
  }

  const decimals = decimalsFor(currency);
  return formatterFor(currency, locale, decimals).format(
    amount / 10 ** decimals,
  );
}

/**
 * Split a total into whole number percentage shares that add to exactly 100.
 *
 * The naive way, rounding each share on its own, produces a column that adds to
 * 101 often enough to notice. Nothing on screen claims the column adds up, but
 * a reader can add it up, and a total of 101 in an app whose whole promise is
 * that its numbers are right is a visible wrongness (spec 0005, AC-4).
 *
 * So this is the largest remainder method: floor every share, then hand the
 * leftover points to whoever was cut by the most. `amounts` must already be in
 * the order the rows will be shown, because ties are broken by that order.
 * Awarding a tie by position rather than arbitrarily is what stops a row
 * showing a share its own ranking contradicts.
 *
 * The remainders are compared as exact integers (`amount * 100 % total`) rather
 * than as floating point fractions. Two equal thirds must compare equal, and
 * `33.333333333333336` against `33.33333333333333` does not, so a float compare
 * would decide a tie by rounding noise instead of by the stated rule.
 *
 * This does no rounding of money and divides no amount, so it does not break
 * the rule this module exists to hold: it turns integers into percentages,
 * which are not money.
 *
 * A share may come back as 0 for a category that genuinely has spending, when
 * its true share is under half a percent. That is real, and the caller renders
 * it as `<1%` rather than `0%` (AC-2). Forcing it up to 1 would take the point
 * from a larger category, which is the worse lie.
 */
export function percentShares(
  amounts: readonly MinorUnits[],
  total: MinorUnits,
): readonly number[] {
  if (amounts.length === 0) return [];

  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(
        `A share must come from whole, non negative minor units, received ${amount}`,
      );
    }
  }

  // A mismatch means the caller worked out one of the two from different rows
  // than the other. Rule 3 of AGENTS.md: fail rather than render shares of a
  // total that is not the total.
  const summed = amounts.reduce((running, amount) => running + amount, 0);
  if (!Number.isSafeInteger(total) || total !== summed) {
    throw new Error(
      `Shares must be taken against the sum of their own amounts. ` +
        `Received a total of ${total} for amounts summing to ${summed}.`,
    );
  }
  if (total <= 0) {
    throw new Error(
      "Cannot take percentage shares of a total of zero. A month with no spending has no shares; render the empty state instead.",
    );
  }

  const floored = amounts.map((amount) => Math.floor((amount * 100) / total));
  const remainders = amounts.map((amount) => (amount * 100) % total);

  let leftover = 100 - floored.reduce((running, share) => running + share, 0);

  // Biggest remainder first; an exact tie keeps the order it arrived in, which
  // is the row order, so the extra point lands on the row that sorts first.
  const byRemainder = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const shares = [...floored];
  for (const { index } of byRemainder) {
    if (leftover <= 0) break;
    shares[index] += 1;
    leftover -= 1;
  }

  return shares;
}

/**
 * The currency's glyph on its own, for use as a form field adornment.
 *
 * A three letter code beside an input where a person expects "$" reads as a
 * bug. Intl already knows the glyph for a currency in a locale, so it is pulled
 * out of a formatted zero rather than kept in a second lookup table that would
 * drift. Intl is safe for this and not for the exponent: a wrong glyph is
 * cosmetic, a wrong exponent is a wrong number.
 *
 * Falls back to the code itself when the locale has no distinct glyph, which is
 * correct rather than a placeholder: some currencies genuinely display as their
 * code.
 *
 * Deliberately does not ask lib/currency.ts for a decimal count. A glyph is the
 * same however many decimal places the currency has, and coupling the two would
 * mean an unsupported code could not even be labelled, only refused.
 */
export function currencySymbol(
  currency: string = env().APP_CURRENCY,
  locale = "en-US",
): string {
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency })
    .formatToParts(0)
    .filter((part) => part.type === "currency");
  return parts[0]?.value ?? currency;
}
