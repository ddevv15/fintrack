import type { CategoryColor } from "@/lib/schema";
import { cn } from "@/lib/ui";

/**
 * A category, shown as its colour and always its name.
 *
 * The colour comes from an exhaustive literal map, never an interpolated class
 * name. Tailwind v4 generates CSS only for class names it can statically read
 * out of the source, so `bg-category-${color}` compiles to nothing at all and
 * the dot renders invisible, a failure that shows up in a production build and
 * not in dev. Written this way, a missing colour is a type error instead
 * (AC-18).
 */
export const categorySwatchClasses: Record<CategoryColor, string> = {
  green: "bg-category-green",
  orange: "bg-category-orange",
  blue: "bg-category-blue",
  purple: "bg-category-purple",
  yellow: "bg-category-yellow",
  red: "bg-category-red",
  pink: "bg-category-pink",
  teal: "bg-category-teal",
  slate: "bg-category-slate",
  emerald: "bg-category-emerald",
};

type CategoryChipProps = {
  name: string;
  color: CategoryColor;
  className?: string;
};

export function CategoryChip({ name, color, className }: CategoryChipProps) {
  return (
    <span
      className={cn(
        "border-border bg-surface text-fg inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs",
        className,
      )}
    >
      {/* Decorative: the name beside it carries the meaning, so colour is
          never the only thing saying which category this is. */}
      <span
        aria-hidden="true"
        data-category-dot={color}
        className={cn(
          "size-2 shrink-0 rounded-full",
          categorySwatchClasses[color],
        )}
      />
      {name}
    </span>
  );
}
