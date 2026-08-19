import { cn } from "@/lib/ui";

/**
 * A placeholder while server data is on its way.
 *
 * The blocks are hidden from assistive technology, since a screen reader has
 * nothing to gain from grey rectangles, and a live region announces `label`
 * instead. `label` is required rather than optional because two sections
 * loading at once both announce, and "Loading" twice tells you nothing about
 * which part of the screen is still coming.
 */
const variantClasses = {
  text: "h-4 w-full",
  row: "h-12 w-full",
  block: "h-28 w-full",
} as const;

type SkeletonProps = {
  label: string;
  variant?: keyof typeof variantClasses;
  count?: number;
  className?: string;
};

export function Skeleton({
  label,
  variant = "text",
  count = 1,
  className,
}: SkeletonProps) {
  return (
    <div className={className}>
      <span role="status" aria-live="polite" className="sr-only">
        {label}
      </span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className={cn(
              "bg-border animate-pulse rounded-sm",
              variantClasses[variant],
            )}
          />
        ))}
      </div>
    </div>
  );
}
