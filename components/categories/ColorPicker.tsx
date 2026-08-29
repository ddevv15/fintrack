"use client";

import { categorySwatchClasses } from "@/components/ui/CategoryChip";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import type { CategoryColor } from "@/lib/schema";
import { cn } from "@/lib/ui";

/**
 * Choosing one of the ten category colours.
 *
 * "use client" for one reason, which spec 0003 asks to be written down: the
 * selection is controlled by the form above it. React 19 resets an uncontrolled
 * field once a form action returns, so a refused save would silently put the
 * colour back to its default while leaving the name you typed in place, and you
 * would submit again without noticing the colour had changed under you. Holding
 * it in the parent's state is what stops that.
 *
 * Real `<input type="radio">` elements, grouped by a shared `name` inside a
 * `<fieldset>`. That is what makes AC-23 free rather than reimplemented: arrow
 * keys move between options, only the selected one is a tab stop, the group is
 * announced with its legend, and the browser owns every bit of it. A grid of
 * buttons with a `role` bolted on would have to rebuild all of that and would
 * get it slightly wrong.
 *
 * The inputs are visually hidden rather than removed. `sr-only` keeps them
 * focusable and in the accessibility tree, which is the whole point; `hidden`
 * or `display:none` would take them out of the tab order and out of the
 * keyboard behaviour above.
 */

/**
 * What each colour is called, in words.
 *
 * AC-5 asks for the name as text so colour is never the only signal, which
 * matters twice over here: to somebody who cannot distinguish two of these
 * swatches, and to a screen reader, where a coloured dot is nothing at all.
 *
 * Exhaustive over `CategoryColor`, so adding an eleventh colour to the check
 * constraint is a type error here rather than an option labelled `undefined`.
 */
const colorLabels: Record<CategoryColor, string> = {
  green: "Green",
  orange: "Orange",
  blue: "Blue",
  purple: "Purple",
  yellow: "Yellow",
  red: "Red",
  pink: "Pink",
  teal: "Teal",
  slate: "Slate",
  emerald: "Emerald",
};

type ColorPickerProps = {
  /** The form field name the chosen colour is submitted under. */
  name: string;
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
  /**
   * Colours your spend categories already use. Marked, never blocked: AC-6 says
   * choosing one anyway is allowed, because two categories sharing a colour is
   * your business and not this form's.
   */
  usedColors: readonly CategoryColor[];
  /** The field level message, when the server refused this value. */
  error?: string;
};

export function ColorPicker({
  name,
  value,
  onChange,
  usedColors,
  error,
}: ColorPickerProps) {
  const errorId = `${name}-error`;

  return (
    <fieldset
      className="flex flex-col gap-1.5"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="text-fg text-sm font-medium">Colour</legend>

      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CATEGORY_COLORS.map((color) => {
          const used = usedColors.includes(color);
          const selected = color === value;

          return (
            <label
              key={color}
              className="has-focus-visible:outline-focus flex cursor-pointer items-center gap-2 rounded-sm outline-2 outline-offset-2 outline-transparent"
            >
              <input
                type="radio"
                name={name}
                value={color}
                checked={selected}
                onChange={() => onChange(color)}
                className="sr-only"
              />

              <span
                className={cn(
                  "border-border-strong flex min-h-11 w-full items-center gap-2 rounded-sm border px-3 text-sm",
                  // Selection is a border weight and a check mark, never colour
                  // alone: on a control whose whole subject is colour, using
                  // colour to say "this one" is the one signal that cannot
                  // work.
                  selected
                    ? "border-fg bg-surface text-fg font-medium"
                    : "bg-surface text-fg-muted",
                )}
              >
                {/* Decorative. The name beside it carries the meaning. */}
                <span
                  aria-hidden="true"
                  data-category-dot={color}
                  className={cn(
                    "size-4 shrink-0 rounded-full",
                    categorySwatchClasses[color],
                  )}
                />

                <span className="truncate">{colorLabels[color]}</span>

                {/* In text, not only in the swatch (AC-6). It is part of the
                    option's accessible name, so it is heard as well as seen. */}
                {used ? (
                  <span className="text-fg-subtle ml-auto shrink-0 text-xs">
                    used
                  </span>
                ) : null}

                {selected ? (
                  <span aria-hidden="true" className="text-fg ml-auto shrink-0">
                    &#10003;
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      {/* Always in the DOM, like `Field`'s: a live region has to exist before
          its content changes for the change to be announced. */}
      <p
        id={errorId}
        aria-live="polite"
        className="text-danger text-sm empty:hidden"
      >
        {error}
      </p>
    </fieldset>
  );
}
