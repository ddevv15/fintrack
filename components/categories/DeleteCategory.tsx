"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { deleteCategory } from "@/actions/categories";
import { holdCategoryConfirmation } from "@/components/categories/confirmation";
import { Button } from "@/components/ui/Button";
import { idleFormState, type FormState } from "@/lib/forms";

/**
 * Removing a category for good, from its own edit screen.
 *
 * "use client" for three reasons, all of which spec 0003 asks to be written
 * down. The confirm step is state that changes without a navigation.
 * `useActionState` gives the pending flag, so one click cannot become two
 * deletes. And focus has to be moved by hand, which needs refs: onto Confirm
 * when it appears, and back onto Delete if it is dismissed.
 *
 * It is only rendered when the category has no entries, which the edit screen
 * decides. That decision is what the screen renders and not what allows the
 * write: `ON DELETE RESTRICT` on the three column foreign key is the final
 * word, and an entry logged in another tab while this screen was open turns a
 * control that was fairly offered into a refusal (AC-17).
 *
 * Confirming in place rather than in a dialog is this project's established
 * answer, from spec 0007: a dialog would be a new shared primitive with its own
 * focus trap, and this is one button asking one question.
 */
export function DeleteCategory({
  categoryId,
  name,
}: {
  categoryId: string;
  name: string;
}) {
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Starts false so the first render does not grab focus from wherever it
  // actually is. Only a change away from confirming should hand it back.
  const wasConfirming = useRef(false);

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => {
      const result = await deleteCategory(previous, formData);

      if (result.status === "ok") {
        // Left for the list, then navigate, in that order: the list takes it as
        // it mounts, so it has to be waiting before the push starts (AC-16).
        holdCategoryConfirmation(result.message ?? "");
        router.push("/categories");
      }

      return result;
    },
    idleFormState,
  );

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    } else if (wasConfirming.current) {
      // Dismissed, so focus goes back where it came from rather than being
      // dropped.
      deleteRef.current?.focus();
    }

    wasConfirming.current = confirming;
  }, [confirming]);

  return (
    <div className="flex flex-col gap-2">
      {/*
        The refusal from the database lands here, not on the list, because this
        is the screen the person is still standing on when it arrives. It is a
        real alert rather than a status: it reports that something they asked
        for did not happen (AC-17).
      */}
      <p
        role="alert"
        aria-live="polite"
        className="text-danger text-sm empty:hidden"
      >
        {state.status === "error" ? state.message : ""}
      </p>

      {!confirming ? (
        <Button
          ref={deleteRef}
          type="button"
          variant="secondary"
          onClick={() => setConfirming(true)}
          // Names the category, so somebody who arrived here by keyboard and
          // cannot see the heading still knows what this is about (AC-23).
          aria-label={`Delete ${name}`}
          className="text-danger border-danger/40"
        >
          Delete this category
        </Button>
      ) : (
        <form
          action={action}
          // Escape dismisses, which is what every other transient thing on a
          // keyboard does. It sits on the form so it fires from either control.
          onKeyDown={(event) => {
            if (event.key === "Escape") setConfirming(false);
          }}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="id" value={categoryId} />

          {/* Names what is about to go, in words (AC-16). `aria-hidden`
              because both controls below already carry the category in their
              accessible names, and hearing it three times is how a confirm step
              becomes something people click through. */}
          <p aria-hidden="true" className="text-fg-muted text-sm">
            Delete {name}? This cannot be undone.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              ref={confirmRef}
              type="submit"
              variant="destructive"
              disabled={pending}
              aria-label={`Confirm deleting ${name}`}
            >
              {pending ? "Deleting..." : "Yes, delete it"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirming(false)}
              aria-label={`Keep ${name}`}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
