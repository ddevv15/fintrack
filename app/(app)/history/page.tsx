import Link from "next/link";

import { HistoryFilterForm } from "@/components/history/HistoryFilterForm";
import { HistoryRow } from "@/components/history/HistoryRow";
import { MonthStatusProvider } from "@/components/transactions/MonthStatus";
import { Amount } from "@/components/ui/Amount";
import { EmptyState } from "@/components/ui/EmptyState";
import { listSpendCategoryFilterOptions } from "@/lib/categories";
import {
  MAX_HISTORY_ROWS,
  formatMatchCount,
  loadHistory,
  parseHistoryFilters,
} from "@/lib/history";
import { requireCompleteSettings } from "@/lib/settings";

/**
 * Everything you have ever logged, narrowed however you like.
 *
 * A Server Component, and it has to stay one for the reason `/transactions` and
 * `/breakdown` do: everything here is money and the currency it is read in, and
 * rendering on the server means neither reaches the browser as data. It also
 * means the filters need no client state, because they live in the URL and the
 * browser resubmits them itself (AC-3).
 *
 * There is no try/catch. `loadHistory()` throws on a failed read or on a result
 * that came back without a count, and `app/error.tsx` catches it, so the screen
 * shows an honest error rather than a list that is quietly missing entries
 * (AC-12). Catching here to render what did arrive would be the exact failure
 * the count exists to prevent.
 *
 * The three empty outcomes are told apart in words rather than sharing one
 * message (AC-14). "You have logged nothing yet", "your filters matched
 * nothing", and "that range is impossible" are three different facts, and only
 * one of them is about your filters.
 */
export default async function HistoryPage({
  searchParams,
}: PageProps<"/history">) {
  const params = await searchParams;

  // Safe to reach for the complete branch: the (app) layout redirects an
  // incomplete profile to /setup before this component renders.
  const settings = await requireCompleteSettings();

  // Loaded before parsing, not after, because the parse needs it: whether a
  // category id is yours is a question only your own list can answer, and this
  // read is happening anyway for the picker (AC-13).
  const categories = await listSpendCategoryFilterOptions();

  const { filters, dropped, rangeError } = parseHistoryFilters(
    params,
    categories,
  );

  const hasFilters =
    filters.categoryId !== undefined ||
    filters.from !== undefined ||
    filters.to !== undefined ||
    filters.note !== undefined;

  // An impossible range is refused before any query runs, so an empty result
  // can only ever mean one thing (AC-9).
  const results = rangeError ? undefined : await loadHistory(filters);

  // Rebuilt from the parsed filters rather than the raw query string, so an
  // edit returns to the filters that actually produced these results. Carrying
  // the raw string back would replay a dropped parameter and its notice.
  const query = new URLSearchParams();
  if (filters.categoryId) query.set("category", filters.categoryId);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.note) query.set("q", filters.note);
  const canonical = query.toString();
  const returnTo = canonical ? `/history?${canonical}` : "/history";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-fg text-2xl font-semibold">History</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Find one charge, or follow a category over time
        </p>
      </div>

      {/* Never silent. A dropped bound widens the range, so a total shown
          beside these results would answer a question you did not ask
          (AC-13). */}
      {dropped.length > 0 ? (
        // Deliberately not a live region. It is rendered with the page and
        // never changes, so it is read in document order anyway, and a second
        // polite region here would compete with the confirmation region below.
        // `MonthStatus` records why that costs an announcement rather than
        // gaining one.
        <div className="border-border bg-surface text-fg-muted rounded-sm border px-3 py-2 text-sm">
          <p>Some of what was in the address bar could not be used:</p>
          <ul className="mt-1 list-disc pl-5">
            {dropped.map((filter) => (
              <li key={filter.field}>{filter.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <HistoryFilterForm
        categories={categories}
        filters={filters}
        rangeError={rangeError}
        hasFilters={hasFilters}
      />

      {/*
        The same status region `/transactions` mounts, and mounted for the same
        reason: an edit hands its confirmation over in the browser on its way
        back here, and a region has to exist for that sentence to be announced
        in (spec 0009 AC-17). Its name has outgrown it now that a second screen
        uses it, which spec 0009 records as a follow up rather than a rename
        made in passing.
      */}
      <MonthStatusProvider>
        {results === undefined ? null : results.matched === 0 ? (
          hasFilters ? (
            <EmptyState
              title="Nothing matched those filters"
              body="Try a wider range of dates, a different category, or fewer words in the note."
            />
          ) : (
            // A different fact from "nothing matched", and the only one of the
            // two that is about your data rather than your filters (AC-14).
            <EmptyState
              title="You have not logged anything yet"
              body="Once you log a spend it shows up here, and everything on this screen is a way of finding it again."
              action={
                <Link
                  href="/"
                  className="focus-ring border-border bg-surface text-fg inline-flex min-h-11 items-center rounded-sm border px-4 text-sm font-medium"
                >
                  Log a spend
                </Link>
              }
            />
          )
        ) : (
          <>
            {results.isComplete ? (
              // A description list rather than two loose paragraphs, so the label
              // and the figure are related to each other rather than merely next
              // to each other, as on the other money screens.
              <dl className="flex flex-col gap-1">
                <dt className="text-fg-muted text-sm">
                  Total across {formatMatchCount(results.matched)}{" "}
                  {results.matched === 1 ? "entry" : "entries"}
                </dt>
                <dd>
                  <Amount
                    amount={results.totalMinor ?? 0}
                    direction="spend"
                    currency={settings.currency}
                    className="text-3xl"
                  />
                </dd>
              </dl>
            ) : (
              // No total at all, and a reason. The sum of the rows on screen is
              // not the sum of what matched, and showing it as though it were is
              // the confident wrong figure rule 3 forbids (AC-11).
              <div className="text-fg-muted flex flex-col gap-1 text-sm">
                <p className="text-fg font-medium">
                  Showing the newest {MAX_HISTORY_ROWS} of{" "}
                  {formatMatchCount(results.matched)} matches
                </p>
                <p>
                  That is too many to total honestly. Narrow the dates, the
                  category, or the note to see a total.
                </p>
              </div>
            )}

            {/* Labelled through a real heading rather than a hidden first <li>:
              an item inside the list would be counted in the "list, N items" a
              screen reader announces, so the label would corrupt the count it
              precedes. */}
            <div>
              <h2 id="history-heading" className="sr-only">
                Matching entries, newest first
              </h2>

              <ul aria-labelledby="history-heading" className="flex flex-col">
                {results.rows.map((transaction) => (
                  <HistoryRow
                    key={transaction.id}
                    transaction={transaction}
                    currency={settings.currency}
                    returnTo={returnTo}
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
