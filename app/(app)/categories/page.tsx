import Link from "next/link";

import { CategoryRow } from "@/components/categories/CategoryRow";
import { CategoryStatusProvider } from "@/components/categories/CategoryStatus";
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
 */
export default async function CategoriesPage() {
  const categories = await listManagedCategories();

  const visible = categories.filter((category) => !category.isHidden);
  const hidden = categories.filter((category) => category.isHidden);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-fg text-2xl font-semibold">Your categories</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Name them the way you actually think about your money. Renaming one
          keeps every entry already filed under it.
        </p>
      </div>

      {/*
        The provider wraps everything below on purpose. Hiding the last visible
        row in a section empties that section, and the outcome of that hide
        still has to be announced somewhere that exists, and focus still has to
        land on it.
      */}
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
              Out of your pickers, still on every entry already filed under
              them.
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
    </div>
  );
}
