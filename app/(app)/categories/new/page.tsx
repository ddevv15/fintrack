import Link from "next/link";

import { CategoryForm } from "@/components/categories/CategoryForm";
import { listManagedCategories } from "@/lib/categories";
import { firstUnusedColor } from "@/lib/category-colors";

export const metadata = { title: "Add a category · FinTrack" };

/**
 * Adding a category, on its own screen.
 *
 * A Server Component that works out the two things the form is not allowed to
 * decide for itself, then hands down plain values. Which colours are already
 * taken, and which colour this one should start on, are both read from your
 * categories here rather than guessed in the browser (AC-5, AC-6).
 *
 * The read throws on failure and `app/error.tsx` catches it, rather than
 * opening the form with every colour looking free. A form that quietly starts
 * on a colour you are already using is a small lie, and it is the kind that is
 * only noticed after the category exists.
 *
 * The cap is not checked here. `createCategory` reads it at the moment of the
 * write, because a screen rendered a minute ago is a claim and not a fact
 * (AC-9), and a form that refuses to open would be a worse way to say so.
 */
export default async function NewCategoryPage() {
  const categories = await listManagedCategories();
  const usedColors = categories.map((category) => category.color);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-fg text-2xl font-semibold">Add a category</h1>
        <p className="text-fg-muted mt-1 text-sm">
          It appears on the Log screen straight away.
        </p>
      </div>

      <CategoryForm
        name=""
        color={firstUnusedColor(usedColors)}
        usedColors={usedColors}
        submitLabel="Add category"
        pendingLabel="Adding..."
      />

      <Link
        href="/categories"
        className="focus-ring text-fg-muted hover:text-fg inline-flex min-h-11 items-center self-start rounded-sm text-sm"
      >
        Back to your categories
      </Link>
    </div>
  );
}
