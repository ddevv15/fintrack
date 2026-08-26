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
  | {
      /**
       * `message` is what actually landed, not what was typed, and it is
       * optional because most forms have nothing worth saying beyond having
       * worked. Log a spend does: spec 0006 answers "did it store what I meant"
       * by naming the stored amount back, formatted from the saved integer, so
       * the conversion is visible on every entry rather than invisible on all
       * of them.
       */
      status: "ok";
      message?: string;
    };

/** The starting value for a form that has not been submitted yet. */
export const idleFormState: FormState = { status: "idle" };
