import Link from "next/link";

import { MonthStatusProvider } from "@/components/transactions/MonthStatus";
import { TransactionRow } from "@/components/transactions/TransactionRow";
import { Amount } from "@/components/ui/Amount";
import { EmptyState } from "@/components/ui/EmptyState";
import { readFlash } from "@/lib/flash";
import { requireCompleteSettings } from "@/lib/settings";
import { formatMonth } from "@/lib/time";
import { loadMonthTransactions } from "@/lib/transactions";

/**
 * This month, entry by entry: the screen that makes the app checkable.
 *
 * A Server Component, and it has to stay one for the reason `/breakdown` does.
 * Everything on it is money and the currency it is read in, and rendering on
 * the server means neither reaches the browser as data. It also means the total
 * is already worked out when the HTML is written, so there is no loading state
 * and no arithmetic in a browser.
 *
 * There is no try/catch. `loadMonthTransactions()` throws on a failed read or
 * on a result it cannot prove complete, and `app/error.tsx` catches it, so the
 * screen shows an honest error rather than a list that is quietly missing
 * entries (AC-7). Catching here to render what did arrive would be the exact
 * failure the completeness guard exists to prevent.
 */
export default async function TransactionsPage() {
  // Safe to reach for the complete branch: the (app) layout redirects an
  // incomplete profile to /setup before this component renders. Cached per
  // request, so this and the loader's own call cost one query between them.
  const settings = await requireCompleteSettings();
  const month = await loadMonthTransactions();

  // The confirmation an edit left behind, if there is one. Read only: clearing
  // it is `proxy.ts`'s half of the single use flash, because Next.js does not
  // let a render mutate a cookie. See `lib/flash.ts` (AC-13).
  const flash = await readFlash();

  const monthName = formatMonth(month.month);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-fg text-2xl font-semibold">{monthName}</h1>
        <p className="text-fg-muted mt-1 text-sm">What you logged this month</p>
      </div>

      {/*
        The provider wraps both branches on purpose. Deleting the last entry
        empties the list, and the confirmation for that delete still has to be
        announced somewhere that exists (AC-24), and focus still has to land on
        it (AC-17).
      */}
      <MonthStatusProvider flash={flash}>
        {month.rows.length === 0 ? (
          // No total at all, not a zero (AC-6). A zero is a result, and "you
          // spent nothing" is a different claim from "you have logged nothing
          // yet", which is the one that is actually true here.
          <EmptyState
            title={`Nothing logged in ${monthName}`}
            body="Every spend you log this month shows up here, newest first, so you can check it and fix anything wrong."
            action={
              <Link
                href="/"
                className="focus-ring border-border bg-surface text-fg inline-flex min-h-11 items-center rounded-sm border px-4 text-sm font-medium"
              >
                Log a spend
              </Link>
            }
          />
        ) : (
          <>
            {/* A description list rather than two loose paragraphs, so the
                label and the figure are related to each other rather than
                merely next to each other, as on the breakdown screen. */}
            <dl className="flex flex-col gap-1">
              <dt className="text-fg-muted text-sm">Total this month</dt>
              <dd>
                <Amount
                  amount={month.totalMinor}
                  direction="spend"
                  currency={settings.currency}
                  className="text-3xl"
                />
              </dd>
            </dl>

            {/* Labelled through a real heading rather than a hidden first
                <li>: an item inside the list would be counted in the "list, N
                items" a screen reader announces, so the label would corrupt the
                count it precedes. The label sits on the <ul> itself, because
                without it this page has two unnamed lists, the nav and this
                one, and nothing tells them apart. */}
            <div>
              <h2 id="transactions-heading" className="sr-only">
                This month&apos;s entries, newest first
              </h2>

              <ul
                aria-labelledby="transactions-heading"
                className="flex flex-col"
              >
                {month.rows.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    currency={settings.currency}
                  />
                ))}
              </ul>
            </div>
          </>
        )}
      </MonthStatusProvider>
    </div>
  );
}
