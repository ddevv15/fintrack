import Link from "next/link";

import { Amount } from "@/components/ui/Amount";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { DateDisplay } from "@/components/ui/DateDisplay";
import { ListRow } from "@/components/ui/ListRow";
import type { MonthTransaction } from "@/lib/transactions";
import { formatAmount } from "@/lib/money";
import { formatPlainDate } from "@/lib/time";

/**
 * One entry in the month, with the two things you can do to it.
 *
 * A Server Component, and it has to stay one: it formats money and a date, and
 * both of those belong to `lib/money.ts` and `lib/time.ts` on the server
 * (`components/ui/AGENTS.md`). The delete control below is a client component
 * and is handed the finished strings, so the currency and the raw amount never
 * reach the browser.
 *
 * The row is not a link. Spec 0007 puts editing behind an explicit Edit control
 * rather than making the whole row tappable, because the other control beside
 * it deletes the entry, and a destructive action should never be a mis-tap away
 * from the thing you meant to do.
 */

/**
 * The shared look for the two row controls, so Edit and Delete are the same
 * size and shape despite one being a link and the other a button. Matches the
 * `sm` Button: 44px on a phone, tighter once there is a pointer.
 */
export const rowActionClasses =
  "focus-ring inline-flex h-11 items-center justify-center rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-fg hover:border-fg-subtle md:h-9";

/**
 * Name one entry the way it reads on screen: "12.50 Groceries, Aug 19".
 *
 * Both controls need this and AC-8 is why. On a list of rows that look alike,
 * "Edit" on its own tells somebody who cannot see which row it sits in
 * absolutely nothing, and a list of nine identical "Edit" buttons is a list
 * nobody can navigate. The visible text stays short; the accessible name
 * carries the row.
 *
 * Composed from the same three values already on screen, so the label can never
 * describe a row differently from the row itself.
 */
export function describeTransaction(
  transaction: MonthTransaction,
  currency: string,
): string {
  return `${formatAmount(transaction.amountMinor, currency)} ${transaction.category.name}, ${formatPlainDate(transaction.occurredOn)}`;
}

type TransactionRowProps = {
  transaction: MonthTransaction;
  /** From `getSettings()`, never from APP_CURRENCY. */
  currency: string;
};

export function TransactionRow({ transaction, currency }: TransactionRowProps) {
  const { id, amountMinor, occurredOn, note, category } = transaction;
  const described = describeTransaction(transaction, currency);

  return (
    <ListRow
      leading={<DateDisplay date={occurredOn} className="text-sm" />}
      title={<CategoryChip name={category.name} color={category.color} />}
      // Truncated to one line by `ListRow`, in CSS, so the whole note stays in
      // the DOM and a screen reader still reads all of it (AC-4).
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
          href={`/transactions/${id}/edit`}
          aria-label={`Edit ${described}`}
          className={rowActionClasses}
        >
          Edit
        </Link>
      }
    />
  );
}
