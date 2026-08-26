"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { deleteTransaction } from "@/actions/transactions";
import { useMonthStatus } from "@/components/transactions/MonthStatus";
import { rowActionClasses } from "@/components/transactions/rowActionClasses";
import { idleFormState, type FormState } from "@/lib/forms";
import { cn } from "@/lib/ui";

/**
 * Removing one entry, confirmed on the row it is about.
 *
 * "use client" for three reasons, all of which spec 0003 asks to be written
 * down. The confirm step is state that changes without a navigation.
 * `useActionState` gives the pending flag, so one click cannot become two
 * deletes. And focus has to be moved by hand, which needs refs: onto Confirm
 * when it appears, back onto Delete if it is dismissed, and onto the list's
 * status message once the row this was standing on no longer exists (AC-17).
 *
 * It is handed `label`, a finished string naming the entry, rather than the
 * amount and the currency. A client component that shows money takes the
 * formatted text as a prop, which is the rule in `components/ui/AGENTS.md` and
 * here also keeps the currency out of the browser.
 *
 * Confirming in place rather than in a dialog is spec 0007's choice: a dialog
 * would be a new shared primitive with its own focus trap, and this is one
 * button asking one question about the row it sits on.
 */
type DeleteTransactionProps = {
  transactionId: string;
  /** The entry as it reads on screen, for example "$12.50 Groceries, Aug 19". */
  label: string;
};

export function DeleteTransaction({
  transactionId,
  label,
}: DeleteTransactionProps) {
  const announce = useMonthStatus();

  const [confirming, setConfirming] = useState(false);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Starts false so the first render does not grab focus from wherever it
  // actually is. Only a change away from confirming should hand it back.
  const wasConfirming = useRef(false);

  const [, action, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => {
      const result = await deleteTransaction(previous, formData);

      /*
       * Every outcome is spoken, and both of them move focus.
       *
       * A successful delete removes the row, and so does the "already gone"
       * case, because that one revalidates a list which is showing something
       * that no longer exists. Either way the button holding focus is about to
       * be unmounted, and focus left on a removed element drops to the top of
       * the document, which is the failure AC-17 names. Moving it to the status
       * message first means it lands on the sentence explaining what happened.
       */
      // `idle` is unreachable, since the action returns `ok` or `error` on
      // every path. It is handled rather than asserted away because the day
      // that stops being true, an unhandled case would delete an entry and
      // announce nothing at all.
      const spoken = result.status === "idle" ? "" : (result.message ?? "");
      if (spoken) announce(spoken, { focus: true });

      return result;
    },
    idleFormState,
  );

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    } else if (wasConfirming.current) {
      // Dismissed, so focus goes back where it came from rather than being
      // dropped (AC-17).
      deleteRef.current?.focus();
    }

    wasConfirming.current = confirming;
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        ref={deleteRef}
        type="button"
        onClick={() => setConfirming(true)}
        // Short visible text, and an accessible name that says which entry. On
        // a list of rows that look alike, "Delete" alone tells somebody who
        // cannot see the row absolutely nothing (AC-8).
        aria-label={`Delete ${label}`}
        className={cn(rowActionClasses, "text-danger")}
      >
        Delete
      </button>
    );
  }

  return (
    <form
      action={action}
      // Escape dismisses, which is what every other transient thing on a
      // keyboard does. It sits on the form so it fires from either control.
      onKeyDown={(event) => {
        if (event.key === "Escape") setConfirming(false);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={transactionId} />

      {/* Names what is about to go, in words, on the row it is about (AC-16).
          `aria-hidden` because both controls below already carry the same
          entry in their accessible names, and hearing it three times is how a
          confirm step becomes something people click through. */}
      <span aria-hidden="true" className="text-fg-muted text-sm">
        Delete {label}?
      </span>

      <button
        ref={confirmRef}
        type="submit"
        disabled={pending}
        aria-label={`Confirm deleting ${label}`}
        className={cn(
          rowActionClasses,
          "bg-danger text-bg border-transparent hover:opacity-90",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {pending ? "Deleting..." : "Confirm"}
      </button>

      <button
        type="button"
        onClick={() => setConfirming(false)}
        aria-label={`Keep ${label}`}
        className={rowActionClasses}
      >
        Cancel
      </button>
    </form>
  );
}
