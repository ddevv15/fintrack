import { useId, type ReactNode } from "react";

/**
 * What Field hands to the control it wraps. A control cannot render without
 * spreading these, which is the point: the linkage cannot be forgotten.
 */
export type FieldControlProps = {
  id: string;
  name: string;
  invalid: boolean;
  describedBy: string | undefined;
};

/**
 * A label, a control, an optional hint, and its error, wired together.
 *
 * Field owns the ids rather than taking them from the caller, because the
 * accessible wiring in AC-6 is exactly the kind of thing that gets skipped on
 * the fifth form. `children` is a function so the generated ids reach the
 * control without cloneElement, and it stays a Server Component: React 19
 * supports useId during a server render.
 *
 * The error paragraph is always in the DOM, even when empty. A live region has
 * to exist before its content changes for the change to be announced, so
 * rendering it only once an error appears would announce nothing.
 */
type FieldProps = {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  children: (control: FieldControlProps) => ReactNode;
};

export function Field({ label, name, hint, error, children }: FieldProps) {
  const generated = useId();
  const id = `${generated}${name}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  // Hint first, then error: the order AC-6 fixes, so a screen reader explains
  // what is wanted before it says what went wrong.
  const describedBy =
    [hint ? hintId : undefined, error ? errorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-fg text-sm font-medium">
        {label}
      </label>

      {children({ id, name, invalid: Boolean(error), describedBy })}

      {hint ? (
        <p id={hintId} className="text-fg-subtle text-sm">
          {hint}
        </p>
      ) : null}

      <p
        id={errorId}
        aria-live="polite"
        className="text-danger text-sm empty:hidden"
      >
        {error}
      </p>
    </div>
  );
}
