/**
 * What a server action hands back to the form that called it.
 *
 * Spec 0003 defines the shape here so the form layer has one thing to read;
 * feature 6, log a spend, returns the first real one. Rule 3 of spec 0001 is
 * why `error` carries a message: a failure is shown, never swallowed into a
 * quietly empty result.
 *
 * `fieldErrors` is keyed by the control's `name`, which is what `Field` needs
 * to decide whether it is the control in error.
 */
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string>;
    }
  | { status: "ok" };

/** The starting value for a form that has not been submitted yet. */
export const idleFormState: FormState = { status: "idle" };
