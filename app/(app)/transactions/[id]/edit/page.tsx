import { notFound } from "next/navigation";

import { EditSpendForm } from "@/components/transactions/EditSpendForm";
import { listSpendCategoryOptions } from "@/lib/categories";
import { currencySymbol, formatAmountInput } from "@/lib/money";
import { requireCompleteSettings } from "@/lib/settings";
import { today } from "@/lib/time";
import { resolveReturnPath } from "@/lib/history";
import { loadTransactionForEdit } from "@/lib/transactions";

/**
 * Correcting one entry, on its own screen.
 *
 * A Server Component that does the four things the form is not allowed to do,
 * then hands down plain strings. It reads your currency and zone, turns the
 * stored integer into the text an amount field expects, works out what day it
 * is where you are, and asks the database which categories this entry may be
 * filed under. The form never learns your currency and never reads a clock
 * (spec 0006, and the money and date rule in `components/ui/AGENTS.md`).
 *
 * `notFound()` covers an unknown id, another account's id, and an id that is
 * not a uuid, all identically (AC-15). Row level security already makes the
 * second invisible; rendering a different page for any of them would put the
 * difference back.
 */
export default async function EditTransactionPage({
  params,
  searchParams,
}: PageProps<"/transactions/[id]/edit">) {
  const { id } = await params;

  // Reached from `/history`, this carries the filtered URL to come back to, so
  // a correction does not throw away the search that found the entry. It is
  // validated here on the server rather than trusted: a navigation target taken
  // from a query string is an open redirect until something checks it, and
  // `resolveReturnPath()` falls back to `/transactions` for anything that is
  // not one of the two list routes (spec 0009 AC-18).
  const { from } = await searchParams;
  const returnTo = resolveReturnPath(Array.isArray(from) ? from[0] : from);

  // Safe to reach for the complete branch: the (app) layout redirects an
  // incomplete profile to /setup before this component renders. The action does
  // not get to assume that, and checks again for itself, because no layout runs
  // for a server action.
  const settings = await requireCompleteSettings();

  const transaction = await loadTransactionForEdit(id);
  if (!transaction) notFound();

  const categories = await listSpendCategoryOptions(transaction.categories.id);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-fg text-2xl font-semibold">Edit this entry</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Change what you logged. The month total updates with it.
        </p>
      </div>

      <EditSpendForm
        transactionId={transaction.id}
        // Formatted from the stored integer by `lib/money.ts`, never by
        // dividing here. It reads straight back into the same integer, so
        // saving an entry unchanged stores exactly what it started with.
        amount={formatAmountInput(transaction.amount_minor, settings.currency)}
        categoryId={transaction.categories.id}
        occurredOn={transaction.occurred_on}
        note={transaction.note ?? ""}
        categories={categories}
        currencySymbol={currencySymbol(settings.currency)}
        returnTo={returnTo}
        today={today(new Date(), settings.timezone)}
      />
    </div>
  );
}
