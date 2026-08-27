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
 * Turning what you type into minor units is `parseAmount()` below, settled by
 * spec 0006: refuse what the currency cannot hold exactly, and never multiply.
 */
export type MinorUnits = number;

/**
 * What `parseAmount()` answers with.
 *
 * A result rather than a thrown error, because a person mistyping an amount is
 * the ordinary case and not an exceptional one. The server action turns
 * `reason` into a field error; an exception would have to be caught to do the
 * same thing, and a caught exception used for control flow is how a real one
 * eventually gets swallowed.
 */
export type ParsedAmount =
  { ok: true; minor: MinorUnits } | { ok: false; reason: string };

/**
 * The shape an amount may be typed in: digits, with at most one dot.
 *
 * Both alternatives are needed. The first accepts `12`, `007`, and `12.50`
 * while refusing a trailing dot, since a dot must be followed by digits. The
 * second accepts a leading dot, `.99`, which the first cannot because it
 * requires a digit before the dot.
 *
 * A minus sign is deliberately absent, so a negative amount is refused here by
 * shape rather than by a later check that would never be reached (spec 0006,
 * AC-4).
 */
const AMOUNT_SHAPE = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Beyond this many significant digits a JavaScript number stops being exact.
 *
 * `Number.MAX_SAFE_INTEGER` is 16 digits, so 15 is always safe and 16 sometimes
 * is not. Refusing at 15 gives up nothing real: on a two decimal currency it is
 * still around 9 trillion.
 */
const MAX_SIGNIFICANT_DIGITS = 15;

/**
 * Turn what a person typed into whole minor units, exactly, or say why not.
 *
 * Spec 0006 is the decision this implements, and the rule it fixes is that no
 * step here multiplies, divides, or rounds. The obvious implementation,
 * `Number(text) * 10 ** decimals`, is not merely inelegant, it is wrong: 271 of
 * the first 2000 cent values come back as non integers, and `8.29 * 100` is
 * `828.9999999999999`. Wrapping that in `Math.round()` hides most of it and
 * still fails at `1.005` on a three decimal currency. Worse, once you round you
 * can no longer tell whether the extra precision came from the person or from
 * the arithmetic, which makes the refusal rule below impossible to implement at
 * all.
 *
 * Splitting the string has none of that, because there is no arithmetic to be
 * imprecise. `8.29` becomes `8` and `29`, which join to `829`.
 *
 * `decimals` comes from `lib/currency.ts` by way of `getSettings()`, so this is
 * correct for a currency with no minor unit (yen) and one with three (the
 * Kuwaiti dinar) from the same rule. It is never a hardcoded 2, and it is never
 * taken from a browser form.
 */
export function parseAmount(text: string, decimals: number): ParsedAmount {
  const trimmed = text.trim();

  if (trimmed === "") {
    return { ok: false, reason: "Enter an amount." };
  }

  if (!AMOUNT_SHAPE.test(trimmed)) {
    return {
      ok: false,
      reason: "Enter an amount using digits and at most one dot, like 12.50.",
    };
  }

  const [integerPart = "", fractionPart = ""] = trimmed.split(".");

  // Counts digits typed, not their value, so `500.00` is refused on a currency
  // with no decimal places. That keeps the rule to the single sentence the
  // message below can teach (spec 0006, AC-3).
  if (fractionPart.length > decimals) {
    return {
      ok: false,
      reason:
        decimals === 0
          ? "This currency has no decimal places, so enter a whole number."
          : `This currency has at most ${decimals} decimal place${decimals === 1 ? "" : "s"}.`,
    };
  }

  const digits = `${integerPart}${fractionPart.padEnd(decimals, "0")}`;

  // Leading zeros are stripped before measuring, because they carry no value:
  // `007` joins to `00700` on a two decimal currency, and refusing that for
  // being five characters long would refuse a perfectly ordinary seven.
  const significant = digits.replace(/^0+/, "");

  if (significant === "") {
    return { ok: false, reason: "An amount has to be more than zero." };
  }

  // Checked on the digits, before the conversion, and that order is the whole
  // point: `Number()` on a longer string does not fail, it silently returns an
  // imprecise value, so a check made afterwards would be inspecting a number
  // that has already lost the information it needs.
  if (significant.length > MAX_SIGNIFICANT_DIGITS) {
    return { ok: false, reason: "That amount is too large to record." };
  }

  const minor = Number(significant);

  // Unreachable given the length check above, and kept as the guard that would
  // catch it if that check were ever loosened.
  if (!Number.isSafeInteger(minor)) {
    return { ok: false, reason: "That amount is too large to record." };
  }

  return { ok: true, minor };
}

/**
 * Render whole minor units as the plain text an amount field expects.
 *
 * `formatAmount()` cannot serve here: it produces "$12.50", and a currency
 * glyph typed into a field that parses digits is a value the parser refuses.
 * This produces "12.50", which `parseAmount()` reads straight back, so opening
 * an entry and saving it unchanged stores exactly the integer it started with
 * (spec 0007, AC-12).
 *
 * It splits the digit string rather than dividing, for the same reason
 * `parseAmount()` joins one rather than multiplying. Dividing would be exact
 * often enough to look fine and wrong often enough to matter, and the whole
 * point of this round trip is that it is exact every time.
 */
export function formatAmountInput(
  amount: MinorUnits,
  currency: string = env().APP_CURRENCY,
): string {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(
      `Money must be whole, non negative minor units, received ${amount}`,
    );
  }

  const decimals = decimalsFor(currency);
  if (decimals === 0) return String(amount);

  // Padded so a value smaller than one major unit still has digits to take a
  // fraction from: 5 minor units on a two decimal currency is "005", which
  // splits into "0" and "05", giving "0.05".
  const digits = String(amount).padStart(decimals + 1, "0");
  const split = digits.length - decimals;

  return `${digits.slice(0, split)}.${digits.slice(split)}`;
}

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
