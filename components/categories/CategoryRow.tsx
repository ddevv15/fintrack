import Link from "next/link";

import { HideCategory } from "@/components/categories/HideCategory";
import { categorySwatchClasses } from "@/components/ui/CategoryChip";
import { ListRow } from "@/components/ui/ListRow";
import { rowActionClasses } from "@/components/transactions/rowActionClasses";
import type { ManagedCategory } from "@/lib/categories";

/**
 * One category on the categories screen.
 *
 * A Server Component. Only the hide control needs the browser, and it is the
 * only thing here that carries `"use client"`.
 *
 * The colour is a decorative dot beside the name, never the name's only
 * signal, and it comes from the exhaustive map in `CategoryChip` rather than an
 * interpolated class name: Tailwind v4 generates CSS only for class names it
 * can statically read, so `` `bg-category-${color}` `` compiles to nothing and
 * the dot renders invisible in a production build but not in dev.
 */

/**
 * How much a category is used, in words.
 *
 * `0` is spelled out rather than shown as a bare number, because "0 entries"
 * reads as a measurement and "Not used yet" reads as the fact the delete
 * control is about to rest on (AC-3, AC-15).
 */
function describeUsage(entryCount: number): string {
  if (entryCount === 0) return "Not used yet";
  return entryCount === 1 ? "1 entry" : `${entryCount} entries`;
}

export function CategoryRow({ category }: { category: ManagedCategory }) {
  return (
    <ListRow
      leading={
        <span
          aria-hidden="true"
          data-category-dot={category.color}
          className={`size-3 shrink-0 rounded-full ${categorySwatchClasses[category.color]}`}
        />
      }
      title={category.name}
      subtitle={describeUsage(category.entryCount)}
      actions={
        <>
          <Link
            href={`/categories/${category.id}/edit`}
            // Says which category, for the same reason the hide control does:
            // on a list of rows that look alike, "Edit" alone tells somebody
            // who cannot see the row nothing at all (AC-23).
            aria-label={`Edit ${category.name}`}
            className={rowActionClasses}
          >
            Edit
          </Link>

          <HideCategory
            categoryId={category.id}
            name={category.name}
            isHidden={category.isHidden}
          />
        </>
      }
    />
  );
}
