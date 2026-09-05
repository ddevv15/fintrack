import Link from "next/link";
import { Suspense } from "react";

import { CategoryRow } from "@/components/categories/CategoryRow";
import { CategoryStatusProvider } from "@/components/categories/CategoryStatus";
import { Skeleton } from "@/components/ui/Skeleton";
import { listManagedCategories } from "@/lib/categories";

export const metadata = { title: "Your categories · FinTrack" };

/**
 * The categories you manage, and the one screen that can bring a hidden one back.
 *
 * A Server Component, and there is no reason for it to be anything else: every
 * value on it is read from the database and rendered once. Only the two
 * controls that write, hide and unhide, reach the browser.
 *
 * There is no try/catch. `listManagedCategories()` throws on a failed read, on
 * a schema that has drifted, and on a category whose usage count did not come
 * back, and `app/error.tsx` catches it, so the screen shows an honest error
 * rather than a list that is quietly missing a row or showing an invented zero
 * (AC-21). Catching here to render what did arrive is exactly the failure that
 * guard exists to prevent.
 *
 * Income categories are not here and cannot be added (AC-1). Feature 14 owns
 * them; until then the seeded `Salary` row is not something any screen offers
 * to change.
 *
 * The heading is rendered here and the list below it inside a `<Suspense>`,
 * which is deliberate on both counts. The heading needs nothing from the
 * backend, so making it wait on a query it does not use would be giving up the
 * one piece of this screen that can appear the instant it is asked for; the
 * list is the part that genuinely has to be fetched, and it is the only part
 * that shows a placeholder.
 *
 * A boundary written here rather than a `loading.tsx` in this folder, for the
 * reason spelled out on the transactions screen: a `loading.tsx` would wrap
 * `[id]/edit` as well, and a streamed response has already sent its 200 by the
 * time `notFound()` runs, which turns AC-20's 404 into a 200.
 */
export default function CategoriesPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-fg text-2xl font-semibold">Your categories</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Name them the way you actually think about your money. Renaming one
          keeps every entry already filed under it.
        </p>
      </div>

      <Suspense
        fallback={
          <Skeleton label="Loading your categories." variant="row" count={6} />
        }
      >
        <ManagedCategories />
      </Suspense>
    </div>
  );
}

/**
 * The list itself, which is everything on this screen that waits on a read.
 */
async function ManagedCategories() {
  const categories = await listManagedCategories();

  const visible = categories.filter((category) => !category.isHidden);
  const hidden = categories.filter((category) => category.isHidden);

  // The provider wraps everything below on purpose. Hiding the last visible row
  // in a section empties that section, and the outcome of that hide still has
  // to be announced somewhere that exists, and focus still has to land on it.
  return (
    <CategoryStatusProvider>
      <div>
        <Link
          href="/categories/new"
          className="focus-ring border-border bg-surface text-fg inline-flex min-h-11 items-center rounded-sm border px-4 text-sm font-medium"
        >
          Add a category
        </Link>
      </div>

      <div>
        {/* Labelled through a real heading rather than a hidden first <li>:
              an item inside the list would be counted in the "list, N items" a
              screen reader announces, so the label would corrupt the count it
              precedes. */}
        <h2
          id="visible-categories-heading"
          className="text-fg mt-2 text-sm font-medium"
        >
          In use
        </h2>

        <ul
          aria-labelledby="visible-categories-heading"
          className="flex flex-col"
        >
          {visible.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      </div>

      {/* Only when there is something in it. An empty "Hidden" heading
            invites the question of what is missing (AC-2). */}
      {hidden.length > 0 ? (
        <div>
          <h2
            id="hidden-categories-heading"
            className="text-fg mt-2 text-sm font-medium"
          >
            Hidden
          </h2>
          <p className="text-fg-muted mb-1 text-sm">
            Out of your pickers, still on every entry already filed under them.
          </p>

          <ul
            aria-labelledby="hidden-categories-heading"
            className="flex flex-col"
          >
            {hidden.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </ul>
        </div>
      ) : null}
    </CategoryStatusProvider>
  );
}
