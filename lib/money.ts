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
 * Turning what you type into minor units is deliberately not here yet. Rounding
 * a typed amount is a product choice (round, truncate, or refuse), and it
 * belongs with feature 6, log a spend.
 */
export type MinorUnits = number;

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Render whole minor units as money you can read.
 *
 * `currency` defaults to APP_CURRENCY, which only exists on the server. Pass it
 * explicitly from a Client Component, since spec 0001 keeps that value out of
 * the browser bundle.
 */
export function formatAmount(
  amount: MinorUnits,
  currency: string = env().APP_CURRENCY,
  locale = "en-US",
): string {
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Money must be whole minor units, received ${amount}`);
  }
  // Still the two decimal assumption, on purpose: this task is the rename and
  // nothing else, so a dollar renders exactly as it did before. Build plan task
  // 3 replaces the hundred with 10 ** decimals from the currency.
  return formatterFor(currency, locale).format(amount / 100);
}

/**
 * The currency's glyph on its own, for use as a form field adornment.
 *
 * APP_CURRENCY is a three letter code, and showing "USD" beside an input where
 * a person expects "$" reads as a bug. Intl already knows the glyph for a
 * currency in a locale, so it is pulled out of a formatted zero rather than
 * kept in a lookup table here that would drift.
 *
 * Falls back to the code itself when the locale has no distinct glyph, which is
 * correct rather than a placeholder: some currencies genuinely display as their
 * code.
 */
export function currencySymbol(
  currency: string = env().APP_CURRENCY,
  locale = "en-US",
): string {
  const parts = formatterFor(currency, locale).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
}
