import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

/**
 * One row in a list. Belongs inside a <ul>.
 *
 * The layout rule that matters is AC-13: the amount on the right must never
 * shrink, wrap, or truncate, because half an amount is worse than no amount.
 * The title gives way instead. `min-w-0` on the middle column is what makes
 * that work: a flex child defaults to min-width:auto, which refuses to shrink
 * below its content, and `truncate` silently does nothing without it.
 *
 * Truncation is CSS only, so the full text stays in the DOM and a screen reader
 * still reads all of it.
 *
 * The row wraps rather than crushing. At 320px a leading chip, an amount, and
 * two row actions add up to more than the row has, and with everything on one
 * line the title is the only flexible thing left, so it collapses to zero width
 * and disappears entirely: not truncated, gone. The minimum width on the title
 * forces the actions onto a second line instead, which is the one arrangement
 * where every part stays readable.
 *
 * That minimum is tuned, not arbitrary: wide enough that the title survives,
 * narrow enough that a plain row with no actions still fits on one line at
 * 320px. Raising it puts every amount on its own line.
 */
type ListRowProps = {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  actions,
  className,
}: ListRowProps) {
  return (
    <li
      className={cn(
        "border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-3 last:border-b-0",
        className,
      )}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}

      <div className="min-w-20 flex-1">
        <div className="text-fg truncate text-sm font-medium">{title}</div>
        {subtitle ? (
          <div className="text-fg-muted mt-0.5 truncate text-sm">
            {subtitle}
          </div>
        ) : null}
      </div>

      {trailing ? (
        <div className="shrink-0 text-right whitespace-nowrap">{trailing}</div>
      ) : null}

      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {actions}
        </div>
      ) : null}
    </li>
  );
}
