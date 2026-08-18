import { env } from "@/lib/env";

/**
 * The one module that converts money for display.
 *
 * Rule 1 of spec 0001: amounts are read and written as whole cents, and nothing
 * outside this file multiplies or divides an amount. Integer cents are exact in
 * Postgres, exact under SUM, and exact across JSON, which a decimal number is
 * not.
 *
 * Turning what you type into cents is deliberately not here yet. Rounding a
 * typed amount is a product choice (round, truncate, or refuse), and it belongs
 * with feature 6, log a spend.
 */
export type Cents = number;

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
 * Render whole cents as money you can read.
 *
 * `currency` defaults to APP_CURRENCY, which only exists on the server. Pass it
 * explicitly from a Client Component, since spec 0001 keeps that value out of
 * the browser bundle.
 */
export function formatCents(
  cents: Cents,
  currency: string = env().APP_CURRENCY,
  locale = "en-US",
): string {
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Money must be whole cents, received ${cents}`);
  }
  return formatterFor(currency, locale).format(cents / 100);
}
