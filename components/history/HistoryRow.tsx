import Link from "next/link";

import { describeTransaction } from "@/components/transactions/TransactionRow";
import { rowActionClasses } from "@/components/transactions/rowActionClasses";
import { Amount } from "@/components/ui/Amount";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { DateDisplay } from "@/components/ui/DateDisplay";
import { ListRow } from "@/components/ui/ListRow";
import type { MonthTransaction } from "@/lib/transactions";

/**
 * One entry in your history, with the one thing you can do to it from here.
 *
 * A Server Component, and it has to stay one: it formats money and a date, and
 * both belong to `lib/money.ts` and `lib/time.ts` on the server
 * (`components/ui/AGENTS.md`).
 *
 * Edit only, no Delete. Spec 0009 puts deleting on `/transactions` alone rather
 * than giving this screen a second implementation of the confirm, the focus
 * move, and the already gone race that spec 0007 AC-16 to AC-19 pin down. You
 * can still reach the entry and fix it, which is what searching for it was for.
 *
 * The date is written in full rather than the short form the month list uses,
 * and that is the one deliberate difference between the two rows. On a list
 * covering one month, "Aug 19" is unambiguous; on a list covering years it
 * names four possible days, which is exactly the confusion somebody hunting one
 * charge does not need.
 *
 * The Edit link carries where to come back to. Without it a correction made
 * from a filtered search would land you on `/transactions` with every filter
 * gone, and the entry you were looking at nowhere in sight.
 */
type HistoryRowProps = {
  transaction: MonthTransaction;
  /** From `getSettings()`, never from APP_CURRENCY. */
  currency: string;
  /** The filtered history URL to return to after an edit. */
  returnTo: string;
};

export function HistoryRow({
  transaction,
  currency,
  returnTo,
}: HistoryRowProps) {
  const { id, amountMinor, occurredOn, note, category } = transaction;

  // The same composition the month list uses, so one entry can never be
  // described two ways by two screens (spec 0007 AC-8).
  const described = describeTransaction(transaction, currency);

  return (
    <ListRow
      leading={
        <DateDisplay date={occurredOn} format="full" className="text-sm" />
      }
      title={<CategoryChip name={category.name} color={category.color} />}
      // Truncated to one line by `ListRow`, in CSS, so the whole note stays in
      // the DOM and a screen reader still reads all of it.
      subtitle={note}
      trailing={
        <Amount
          amount={amountMinor}
          direction="spend"
          currency={currency}
          className="text-sm"
        />
      }
      actions={
        <Link
          href={`/transactions/${id}/edit?from=${encodeURIComponent(returnTo)}`}
          aria-label={`Edit ${described}`}
          className={rowActionClasses}
        >
          Edit
        </Link>
      }
    />
  );
}
