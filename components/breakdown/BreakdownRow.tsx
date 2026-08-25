import { Amount } from "@/components/ui/Amount";
import { categorySwatchClasses } from "@/components/ui/CategoryChip";
import type { CategoryShare } from "@/lib/breakdown";
import { cn } from "@/lib/ui";

/**
 * One category's slice of the month: name, amount, share, and a bar.
 *
 * Belongs inside a `<ul>`. It is a row rather than a link on purpose: spec 0005
 * leaves these untappable until feature 10 adds the filtered history there
 * would be to tap through to.
 *
 * The bar is `aria-hidden` because it says nothing the row has not already
 * said in words (AC-5). A screen reader reads the name, the amount, and the
 * share, which is the whole content of the row; announcing a decorative
 * rectangle as well would be noise.
 *
 * Its width comes from the same `percent` the row prints beside it, not from
 * the exact ratio, so the picture and the number cannot disagree even by a
 * fraction. The width is an inline style because Tailwind v4 generates CSS only
 * for class names it can read statically, so a `w-[38%]` built at runtime
 * compiles to nothing. The colour goes the other way, through the exhaustive
 * map, so a missing colour is a type error rather than an invisible bar.
 */
type BreakdownRowProps = {
  share: CategoryShare;
  /** From `getSettings()`, never from APP_CURRENCY. */
  currency: string;
};

export function BreakdownRow({ share, currency }: BreakdownRowProps) {
  const { name, color, amountMinor, percent } = share;

  // A category can hold real money and still round to nothing. Printing "0%"
  // beside a real amount reads as a bug, and rounding it up to 1% would take
  // the point from a larger category, so it says what is true instead (AC-2).
  const shareLabel = percent === 0 && amountMinor > 0 ? "<1%" : `${percent}%`;

  return (
    <li className="border-border flex flex-col gap-1.5 border-b py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          // Decorative: the name sits right beside it, so colour is never the
          // only thing naming the category. design.md notes that no palette can
          // fully separate three greens for a red green colour vision
          // deficiency, which is why this can never be the label.
          aria-hidden="true"
          data-category-dot={color}
          className={cn(
            "size-2 shrink-0 rounded-full",
            categorySwatchClasses[color],
          )}
        />

        {/* min-w-0 is what lets the name truncate: a flex child refuses to
            shrink below its content without it, and `truncate` then silently
            does nothing. The name gives way so the amount never has to. */}
        <span className="text-fg min-w-0 flex-1 truncate text-sm font-medium">
          {name}
        </span>

        <Amount
          amount={amountMinor}
          direction="spend"
          currency={currency}
          className="shrink-0 text-sm whitespace-nowrap"
        />
      </div>

      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="bg-bg border-border h-1.5 min-w-0 flex-1 overflow-hidden rounded-full border"
        >
          <div
            className={cn("h-full rounded-full", categorySwatchClasses[color])}
            style={{ width: `${percent}%` }}
          />
        </div>

        <span
          data-tabular
          className="text-fg-muted w-10 shrink-0 text-right text-xs"
        >
          {shareLabel}
        </span>
      </div>
    </li>
  );
}
