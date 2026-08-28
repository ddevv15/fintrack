import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryForm } from "@/components/categories/CategoryForm";
import { DeleteCategory } from "@/components/categories/DeleteCategory";
import { getManagedCategory, listManagedCategories } from "@/lib/categories";

export const metadata = { title: "Edit a category · FinTrack" };

/**
 * Correcting one category, on its own screen.
 *
 * `notFound()` covers an unknown id, another account's id, and an id that is
 * not a uuid, all identically (AC-20). Row level security already makes the
 * second invisible; rendering a different page for any of them would put the
 * difference back.
 *
 * Whether delete is offered rests on the entry count, and the count is the only
 * thing on this screen that is not the final word: `ON DELETE RESTRICT` is, and
 * an entry logged in another tab while this screen is open makes the count
 * stale. That is why the control is offered on the count and the write is
 * allowed by the constraint, and why a stale offer ends in a clear message
 * rather than a lost category (AC-15, AC-17).
 */
export default async function EditCategoryPage({
  params,
}: PageProps<"/categories/[id]/edit">) {
  const { id } = await params;

  const category = await getManagedCategory(id);
  if (!category) notFound();

  const categories = await listManagedCategories();

  // Every other category's colour. This one's own is left out, because a colour
  // being used by the very row you are changing is not a clash worth naming.
  const usedColors = categories
    .filter((other) => other.id !== category.id)
    .map((other) => other.color);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-fg text-2xl font-semibold">Edit this category</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Renaming it keeps every entry already filed under it.
        </p>
      </div>

      <CategoryForm
        categoryId={category.id}
        name={category.name}
        color={category.color}
        usedColors={usedColors}
        submitLabel="Save changes"
        pendingLabel="Saving..."
      />

      {category.entryCount === 0 ? (
        <DeleteCategory categoryId={category.id} name={category.name} />
      ) : (
        // No delete control at all, rather than a disabled one, and a line
        // saying why in its place (AC-15). A control that is visible and
        // refuses is a worse answer than a sentence explaining what to do
        // instead, and hiding is the thing to do instead.
        <p className="text-fg-muted text-sm">
          {category.entryCount === 1
            ? "1 entry is filed under this category, so it cannot be deleted."
            : `${category.entryCount} entries are filed under this category, so it cannot be deleted.`}{" "}
          Hide it from your categories screen instead, and its history stays
          exactly as it is.
        </p>
      )}

      <Link
        href="/categories"
        className="focus-ring text-fg-muted hover:text-fg inline-flex min-h-11 items-center self-start rounded-sm text-sm"
      >
        Back to your categories
      </Link>
    </div>
  );
}
