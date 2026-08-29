import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { SpendCategoryOption } from "@/lib/categories";
import type { HistoryFilters } from "@/lib/history";

/**
 * The four filter controls, as a plain form the browser itself submits.
 *
 * A Server Component with no `"use client"` anywhere, which is the whole point
 * of `method="get"`: the browser turns these fields into the query string, so
 * the filters land in the URL without a line of JavaScript and survive a
 * reload, a bookmark, and the back button for free (spec 0009 AC-3). The page
 * behind it stays server rendered, so no money reaches the browser as data.
 *
 * `action` is stated rather than left implicit, so a submit replaces the query
 * string outright. Left to the current URL, a parameter this form does not know
 * about would ride along for ever.
 *
 * Every value is a `defaultValue` read back from the parsed filters rather than
 * the raw query string, so what the fields show is exactly what the results
 * were built from. A parameter that was dropped comes back blank, which matches
 * the notice above the form saying it was ignored.
 */
type HistoryFilterFormProps = {
  categories: readonly SpendCategoryOption[];
  filters: HistoryFilters;
  /** Set when the range runs backwards. Shown against the end date. */
  rangeError: string | undefined;
  /** Whether anything is worth clearing. */
  hasFilters: boolean;
};

export function HistoryFilterForm({
  categories,
  filters,
  rangeError,
  hasFilters,
}: HistoryFilterFormProps) {
  // Hidden categories stay selectable, because money you spent still counts
  // whatever you later did with the label (AC-6). The label carries the state,
  // and the database's name ordering is left alone, so a hidden category keeps
  // its alphabetical place rather than being herded to the end.
  const options = [
    { value: "", label: "All categories" },
    ...categories.map((category) => ({
      value: category.id,
      label: category.isHidden ? `${category.name} (hidden)` : category.name,
    })),
  ];

  return (
    <form method="get" action="/history" className="flex flex-col gap-4">
      <Field label="Category" name="category">
        {(control) => (
          <Select
            {...control}
            options={options}
            defaultValue={filters.categoryId ?? ""}
          />
        )}
      </Field>

      {/* Stacked on a phone, side by side once there is room. Two native date
          inputs share 320px badly: each column lands near 140px, which is
          narrower than the control's own `mm/dd/yyyy` plus its calendar button,
          so both ends up clipped. `md` is the project's only breakpoint. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="From" name="from">
          {(control) => (
            <Input {...control} type="date" defaultValue={filters.from ?? ""} />
          )}
        </Field>

        {/* The range error sits on the end date rather than floating loose, so
            a screen reader hears it as part of the field it is about. */}
        <Field label="To" name="to" error={rangeError}>
          {(control) => (
            <Input {...control} type="date" defaultValue={filters.to ?? ""} />
          )}
        </Field>
      </div>

      <Field
        label="Note contains"
        name="q"
        hint="Matches anywhere in a note, upper or lower case."
      >
        {(control) => (
          <Input
            {...control}
            type="search"
            defaultValue={filters.note ?? ""}
            placeholder="coffee"
          />
        )}
      </Field>

      <div className="flex items-center gap-2">
        <Button type="submit">Search</Button>

        {hasFilters ? (
          <Link
            href="/history"
            className="focus-ring text-fg-muted hover:text-fg inline-flex h-11 items-center rounded-sm px-3 text-sm font-medium md:h-9"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </form>
  );
}
