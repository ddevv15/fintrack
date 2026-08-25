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
