import Link from "next/link";
import { Suspense } from "react";

import { LogSpendForm } from "@/components/transactions/LogSpendForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { listSpendCategories } from "@/lib/categories";
import { currencySymbol } from "@/lib/money";
import { requireCompleteSettings } from "@/lib/settings";
import { today } from "@/lib/time";

/**
 * Home, and the screen you will use most: log a spend.
 *
 * A Server Component that does the three things the form is not allowed to do,
 * then hands down plain strings. It reads your currency and zone, works out
 * what day it is where you are, and asks the database which categories you can
 * file against. The form itself never learns your currency and never reads a
 * clock (spec 0006, and the money and date rule in `components/ui/AGENTS.md`).
 *
 * `requireCompleteSettings()` is safe here because the layout above already
 * redirected an incomplete profile to `/setup`. The action does not get to
 * assume that, and calls it again for itself, because no layout runs for a
 * server action.
 *
 * The heading renders here and the form waits inside a `<Suspense>`. This is
 * the screen the app opens on and the one most likely to be clicked back to, so
 * the half that needs nothing from the backend should not be made to wait on
 * the half that does.
 *
 * A boundary here rather than a `loading.tsx` beside it: a `loading.tsx` at
 * this level is the (app) group's own, and it would wrap every route in the
 * group including both `[id]/edit` screens, whose `notFound()` cannot set a 404
 * once a streamed response has sent its 200 (AC-15, AC-20).
 */
export default function LogSpendPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-fg text-2xl font-semibold">Log a spend</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Amount, category, date. It takes a few seconds.
        </p>
      </div>

      <Suspense
        fallback={
          <Skeleton label="Loading the spend form." variant="row" count={4} />
        }
      >
        <SpendForm />
      </Suspense>
    </div>
  );
}

/**
 * The form, and the two reads it cannot be built without.
 */
async function SpendForm() {
  const settings = await requireCompleteSettings();

  const categories = await listSpendCategories();
  const currentDay = today(new Date(), settings.timezone);

  return (
    <>
      {categories.length === 0 ? (
        // Reachable once feature 9 can hide categories; a new account always
        // has ten from the seed trigger. A select with nothing in it looks
        // broken, and this says what happened instead (AC-12).
        <EmptyState
          title="You have no spend categories to log against."
          body="Unhide one, or add a new one, then come back."
          action={
            <Link
              href="/settings"
              className="focus-ring text-fg-muted hover:text-fg rounded-sm text-sm underline"
            >
              Your account
            </Link>
          }
        />
      ) : (
        <LogSpendForm
          categories={categories}
          currencySymbol={currencySymbol(settings.currency)}
          today={currentDay}
        />
      )}
    </>
  );
}
