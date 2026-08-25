import Link from "next/link";

import { BreakdownRow } from "@/components/breakdown/BreakdownRow";
import { Amount } from "@/components/ui/Amount";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadMonthBreakdown } from "@/lib/breakdown";
import { requireCompleteSettings } from "@/lib/settings";
import { formatMonth } from "@/lib/time";

/**
 * Where your money went: the screen this app exists for.
 *
 * A Server Component, and it has to stay one. Everything here is money and the
 * currency it is read in, and rendering on the server means neither reaches the
 * browser as data (AC-12). It also means no loading state and no client
 * arithmetic: the total is already worked out when the HTML is written.
 *
 * There is no try/catch. `loadMonthBreakdown()` throws on a failed read or on a
 * result it cannot prove is complete, and `app/error.tsx` catches it, so the
 * screen shows an honest error rather than a total that is quietly short
 * (AC-9). Catching here to render a zero would be the exact failure spec 0005
 * was written to prevent.
 */
export default async function BreakdownPage() {
  // Safe to reach for the complete branch: the (app) layout redirects an
  // incomplete profile to /setup before this component renders. Cached per
  // request, so this and the loader's own call cost one query between them.
  const settings = await requireCompleteSettings();
  const breakdown = await loadMonthBreakdown();
  const month = formatMonth(breakdown.month);

  const heading = (
    <div>
      <h1 className="text-fg text-2xl font-semibold">{month}</h1>
      <p className="text-fg-muted mt-1 text-sm">Where your money went</p>
    </div>
  );

  // A month with nothing in it renders no total at all, not a zero (AC-8). A
  // zero is a result, and "you spent nothing" is a different claim from "you
  // have logged nothing yet", which is the one that is actually true here.
  if (breakdown.rows.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        {heading}

        <EmptyState
          title={`Nothing logged in ${month}`}
          body="Once you log a spend it shows up here, split by category with the biggest first."
          action={
            <Link
              href="/"
              className="focus-ring border-border bg-surface text-fg inline-flex min-h-11 items-center rounded-sm border px-4 text-sm font-medium"
            >
              Log a spend
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      {heading}

      {/* A description list rather than two loose paragraphs, so the label and
          the figure are related to each other rather than merely next to each
          other, the same pairing the home screen uses. */}
      <dl className="flex flex-col gap-1">
        <dt className="text-fg-muted text-sm">Total spent</dt>
        <dd>
          <Amount
            amount={breakdown.totalMinor}
            direction="spend"
            currency={settings.currency}
            className="text-3xl"
          />
        </dd>
      </dl>

      {/* Labelled through a real heading rather than a hidden first <li>: an
          item inside the list would be counted in the "list, N items" a screen
          reader announces, so the label would corrupt the count it precedes.

          The label sits on the <ul> itself rather than on a wrapper, so the
          list is announced by name. Without it this page has two unnamed lists,
          the nav and this one, and nothing tells them apart. */}
      <div>
        <h2 id="breakdown-heading" className="sr-only">
          Spending by category, largest first
        </h2>

        <ul aria-labelledby="breakdown-heading" className="flex flex-col">
          {breakdown.rows.map((share) => (
            <BreakdownRow
              key={share.categoryId}
              share={share}
              currency={settings.currency}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
