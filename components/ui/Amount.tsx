import { formatAmount, type MinorUnits } from "@/lib/money";
import { cn } from "@/lib/ui";

/**
 * Money, rendered on the server.
 *
 * This component does no arithmetic. It calls formatAmount() and nothing else,
 * because spec 0001 rule 1, as spec 0004 corrects it, puts every division of an
 * amount in lib/money.ts and keeps it there.
 *
 * It must stay a Server Component: formatAmount() defaults its currency from
 * APP_CURRENCY, which is server only. A Client Component that has to show money
 * takes the already formatted string as a prop, so the amount and the currency
 * code never reach the browser (AC-10).
 *
 * Pass `currency` on every signed in screen, from `getSettings()`. The default
 * is APP_CURRENCY, which since spec 0004 is only the value the sign up form
 * suggests and is nobody's actual currency. Leaving it off renders somebody's
 * yen as dollars, silently and confidently, which is the exact failure the
 * minor units work exists to prevent.
 */
type AmountProps = {
  amount: MinorUnits;
  direction: "spend" | "income";
  currency?: string;
  className?: string;
};

export function Amount({
  amount,
  direction,
  currency,
  className,
}: AmountProps) {
  const formatted = formatAmount(amount, currency);

  return (
    <span
      data-tabular
      className={cn(
        "font-medium",
        // The sign is what distinguishes income, not the colour. Colour is a
        // second, redundant signal, so the meaning survives without it.
        direction === "income" ? "text-income" : "text-fg",
        className,
      )}
    >
      {direction === "income" ? `+${formatted}` : formatted}
    </span>
  );
}
