import { ChevronDown } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/ui";

import type { FieldControlProps } from "./Field";
import { controlClasses } from "./Input";

/**
 * A native <select>.
 *
 * Native means the platform's own picker on a phone, which is both faster to
 * use one handed and already accessible. The cost, recorded in spec 0003, is
 * that an <option> cannot carry a colour swatch, so a category picker shows
 * names alone.
 *
 * appearance-none strips the platform's own arrow so the control matches the
 * text inputs beside it, which means the arrow has to be put back: without it
 * this reads as a text box and nobody knows it opens.
 */
type SelectProps = Omit<
  ComponentPropsWithoutRef<"select">,
  "id" | "name" | "aria-describedby" | "aria-invalid"
> &
  FieldControlProps & {
    options: ReadonlyArray<{ value: string; label: string }>;
    placeholder?: string;
  };

export function Select({
  options,
  placeholder,
  invalid,
  describedBy,
  className,
  defaultValue,
  ...props
}: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        defaultValue={defaultValue ?? (placeholder ? "" : undefined)}
        className={cn(controlClasses, "appearance-none pr-9", className)}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown
        aria-hidden="true"
        className="text-fg-muted pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  );
}
