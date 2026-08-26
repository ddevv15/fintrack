import type { ComponentPropsWithRef } from "react";

import { cn } from "@/lib/ui";

import type { FieldControlProps } from "./Field";
import { controlClasses } from "./Input";

/**
 * An amount field. It captures text and parses nothing.
 *
 * Turning "12.5" into minor units is a product decision (round, truncate, or refuse)
 * that belongs to feature 6, log a spend, so this returns the raw string and
 * lets the server action decide (AC-16).
 *
 * The symbol is a glyph, not a currency code, and it is hidden from assistive
 * technology because it is decoration beside the field. Name the currency in
 * the Field label or hint when it is not obvious from context.
 */
// WithRef rather than WithoutRef, for the same reason Select is: React 19
// passes ref as an ordinary prop, and LogSpendForm needs one to put focus back
// here after a save so the next spend can be typed straight away (spec 0006,
// AC-8).
type AmountInputProps = Omit<
  ComponentPropsWithRef<"input">,
  "id" | "name" | "type" | "aria-describedby" | "aria-invalid"
> &
  FieldControlProps & { currencySymbol: string };

export function AmountInput({
  currencySymbol,
  invalid,
  describedBy,
  className,
  ...props
}: AmountInputProps) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="text-fg-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base"
      >
        {currencySymbol}
      </span>
      <input
        type="text"
        // decimal, not numeric: it brings up a keypad that has a separator.
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-tabular
        className={cn(
          controlClasses,
          // Room for the glyph, scaled to its own width rather than a guess.
          "pl-[calc(--spacing(3)+2ch)]",
          className,
        )}
        {...props}
      />
    </div>
  );
}
