"use client";

import { useActionState } from "react";

import { setCategoryHidden } from "@/actions/categories";
import { useCategoryStatus } from "@/components/categories/CategoryStatus";
import { rowActionClasses } from "@/components/transactions/rowActionClasses";
import { idleFormState, type FormState } from "@/lib/forms";

/**
 * Taking a category out of your pickers, or bringing it back, from its own row.
 *
 * "use client" for two reasons, both of which spec 0003 asks to be written
 * down. `useActionState` gives the pending flag, so one click cannot become two
 * writes. And the outcome has to be announced and focus moved, because this
 * control moves its own row: hiding a category sends it down to the Hidden
 * heading, so the button holding focus is unmounted from one list and remounted
 * in another, and focus left behind drops to the top of the document.
 *
 * There is no confirm step, unlike delete. Hiding takes nothing away: every
 * past entry keeps its category, no total moves, and the row is one click from
 * coming back (AC-14). A confirm step on a reversible action is a habit people
 * learn to click through, which makes the one on delete worth less.
 *
 * The class is imported from the transactions row rather than copied, so the
 * two lists' row controls stay the same size and shape. It is the second
 * caller; spec 0007's follow up asks for promotion to a shared module on the
 * third.
 */
type HideCategoryProps = {
  categoryId: string;
  /** The category's name, for the accessible name of the control. */
  name: string;
  /** Its state now. The control offers the opposite. */
  isHidden: boolean;
};

export function HideCategory({
  categoryId,
  name,
  isHidden,
}: HideCategoryProps) {
  const announce = useCategoryStatus();

  const [, action, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => {
      const result = await setCategoryHidden(previous, formData);

      // Every outcome is spoken, and every outcome moves focus, because both
      // the successful ones move this row to the other list and the refusals
      // are the only report that nothing happened.
      //
      // `idle` is unreachable, since the action returns `ok` or `error` on
      // every path. It is handled rather than asserted away because the day
      // that stops being true, an unhandled case would change a category and
      // announce nothing at all.
      const spoken = result.status === "idle" ? "" : (result.message ?? "");
      if (spoken) announce(spoken, { focus: true });

      return result;
    },
    idleFormState,
  );

  const label = isHidden ? "Unhide" : "Hide";
  const pendingLabel = isHidden ? "Unhiding..." : "Hiding...";

  return (
    <form action={action}>
      <input type="hidden" name="id" value={categoryId} />
      {/* The state being asked for, not a toggle. A toggle would compute the
          new value from whatever the screen last rendered, which can be stale
          if another tab changed it; naming the target state means a stale
          screen asks for something already true rather than for the opposite
          of the truth. */}
      <input type="hidden" name="hidden" value={isHidden ? "false" : "true"} />

      <button
        type="submit"
        disabled={pending}
        // Short visible text, and an accessible name that says which category.
        // On a list of rows that look alike, "Hide" alone tells somebody who
        // cannot see the row absolutely nothing (AC-23).
        aria-label={`${label} ${name}`}
        className={`${rowActionClasses} disabled:pointer-events-none disabled:opacity-50`}
      >
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}
