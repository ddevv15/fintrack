import { redirect } from "next/navigation";

import { SetupForm } from "@/components/auth/SetupForm";
import { AuthLayout } from "@/components/ui/AuthLayout";
import { listCurrencies } from "@/lib/currency";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { timeZoneNames } from "@/lib/time";

export const metadata = { title: "Finish setting up · FinTrack" };

/**
 * The one time screen for a profile missing its currency or its time zone.
 *
 * It sits outside the `(app)` route group on purpose, which is the whole trick:
 * that group's layout is what redirects an incomplete profile here, so a screen
 * inside it would redirect to itself forever. It needs a session like every
 * other signed in screen, and is exempt only from the completeness rule.
 *
 * It wears `AuthLayout` rather than `AppShell` for the same reason. Showing the
 * three tabs would offer screens this account cannot use yet.
 */
export default async function SetupPage() {
  await requireUser();

  // Already answered: nothing to ask, so do not make somebody answer twice.
  const settings = await getSettings();
  if (settings.isComplete) redirect("/");

  return (
    <AuthLayout title="Two last things">
      <p className="text-fg-muted mb-5 text-sm">
        FinTrack needs to know what money you count in and where your day ends.
        Neither is guessed, because a wrong guess quietly changes what every
        amount means.
      </p>

      <SetupForm
        currencies={listCurrencies()}
        zones={timeZoneNames()}
        suggestedCurrency={env().APP_CURRENCY}
        suggestedZone={env().APP_TIMEZONE}
      />
    </AuthLayout>
  );
}
