import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/ui";

import type { FieldControlProps } from "./Field";

/**
 * Shared by every text control here, so a text box, an amount, and a select all
 * sit on the same baseline.
 *
 * 16px text is not a style choice: iOS zooms the page when a focused input is
 * smaller than that, which throws the layout on a phone.
 */
export const controlClasses =
  "focus-ring h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-fg placeholder:text-fg-subtle aria-invalid:border-danger";

/**
 * A text input.
 *
 * Uncontrolled by design, so the form works before JavaScript has loaded. That
 * is the trade recorded in spec 0003: nothing validates until submit.
 */
type InputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "id" | "name" | "aria-describedby" | "aria-invalid"
> &
  FieldControlProps;

export function Input({
  invalid,
  describedBy,
  className,
  type = "text",
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(controlClasses, className)}
      {...props}
    />
  );
}
