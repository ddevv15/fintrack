import { formatPlainDate, type PlainDate } from "@/lib/time";
import { cn } from "@/lib/ui";

/**
 * A calendar day, in a <time> element.
 *
 * The visible text goes through lib/time.ts, the one place a date becomes
 * words, and `dateTime` carries the raw machine readable value so a screen
 * reader or a parser gets the unambiguous form (AC-12).
 */
type DateDisplayProps = {
  date: PlainDate;
  format?: "short" | "full";
  className?: string;
};

export function DateDisplay({
  date,
  format = "short",
  className,
}: DateDisplayProps) {
  return (
    <time dateTime={date} className={cn("text-fg-muted", className)}>
      {formatPlainDate(date, format)}
    </time>
  );
}
