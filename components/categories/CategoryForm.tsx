"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { createCategory, updateCategory } from "@/actions/categories";
import { ColorPicker } from "@/components/categories/ColorPicker";
import { holdCategoryConfirmation } from "@/components/categories/confirmation";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { idleFormState, type FormState } from "@/lib/forms";
import type { CategoryColor } from "@/lib/schema";

/**
 * Naming a category and giving it a colour: the same form for adding and for
 * correcting.
 *
 * One component rather than two, because the two screens differ in exactly
 * three things (which action runs, what the button says, and whether an id
 * travels with it) and in nothing a person would notice. Two files would be
 * two places to fix the next accessibility detail.
 *
 * "use client" for two reasons, both of which spec 0003 asks to be written
 * down. `useActionState` gives the pending flag, so one click cannot become two
 * categories. And the fields are controlled, which is what keeps a refused save
 * from wiping what was typed: React 19 resets an uncontrolled field once a form
 * action returns, so a duplicate name would clear both the name and the colour
 * and you would resubmit without noticing the colour had changed under you.
 *
 * The delete control is deliberately not part of this component. It posts its
 * own action, so it has to be its own `<form>`, and a form inside a form is
 * markup the browser silently rearranges. The edit screen renders it as a
 * sibling below instead.
 *
 * `kind` is nowhere in this form and there is no control that offers it, which
 * is the whole of AC-11. `ON UPDATE RESTRICT` on the three column foreign key
 * would refuse the change on any category that has ever been used anyway.
 */
type CategoryFormProps = {
  /** Absent when adding. Present, and submitted hidden, when correcting. */
  categoryId?: string;
  /** The starting name. Empty when adding. */
  name: string;
  /**
   * The starting colour. When adding, the first colour of the ten your
   * categories are not already using, worked out on the server (AC-5).
   */
  color: CategoryColor;
  /**
   * The colours your other spend categories use. Marked on the picker, never
   * blocked. On the edit screen this excludes the category being edited, since
   * a colour being used by the very row you are changing is not a clash worth
   * naming.
   */
  usedColors: readonly CategoryColor[];
  submitLabel: string;
  pendingLabel: string;
};

export function CategoryForm({
  categoryId,
  name: initialName,
  color: initialColor,
  usedColors,
  submitLabel,
  pendingLabel,
}: CategoryFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<CategoryColor>(initialColor);

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => {
      const result = categoryId
        ? await updateCategory(previous, formData)
        : await createCategory(previous, formData);

      if (result.status === "ok") {
        // Left for the list, then navigate. This order matters: the list takes
        // it as it mounts, so it has to be waiting before the push starts.
        holdCategoryConfirmation(result.message ?? "");
        router.push("/categories");
      }

      return result;
    },
    idleFormState,
  );

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* Hidden rather than in the URL of the action, and checked as a uuid on
          the server before it is used. */}
      {categoryId ? <input type="hidden" name="id" value={categoryId} /> : null}

      <FormError state={state} />

      <Field
        label="Name"
        name="name"
        hint="Up to 60 characters. It has to be different from your other categories."
        error={fieldErrors?.name}
      >
        {(control) => (
          <Input
            {...control}
            maxLength={60}
            placeholder="Groceries"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>

      <ColorPicker
        name="color"
        value={color}
        onChange={setColor}
        usedColors={usedColors}
        error={fieldErrors?.color}
      />

      <SubmitButton pending={pending} pendingLabel={pendingLabel}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
