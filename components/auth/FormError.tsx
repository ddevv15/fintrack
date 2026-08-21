import type { FormState } from "@/lib/forms";

/**
 * The one line summary above a form when its action refused.
 *
 * Always in the DOM, even when empty. A live region has to exist before its
 * content changes for the change to be announced, so rendering it only once
 * there is an error announces nothing, which is the same reasoning `Field`
 * uses for its per field error.
 *
 * Per field messages still render beside their fields. This is the summary a
 * screen reader reaches first, and the only place a failure with no field of
 * its own (a refused sign in, a provider that is down) can appear at all.
 */
export function FormError({ state }: { state: FormState }) {
  return (
    <p
      role="alert"
      aria-live="polite"
      className="text-danger text-sm empty:hidden"
    >
      {state.status === "error" ? state.message : ""}
    </p>
  );
}
