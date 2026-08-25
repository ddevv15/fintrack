import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { getSettings } from "@/lib/settings";

/**
 * Home, for now.
 *
 * Feature 6 replaces this with the screen you will actually use most: amount,
 * date, category, note, saved in seconds. Until then it proves the thing this
 * feature was for, which is that you are signed in, this account is yours, and
 * the app knows your currency and your zone without having guessed either.
 */
export default async function HomePage() {
  // Safe to reach for the complete branch: the layout above this redirected an
  // incomplete profile to /setup before this component ever rendered.
  const settings = await getSettings();
  if (!settings.isComplete) return null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-fg text-2xl font-semibold">
          {settings.displayName ? `Hello, ${settings.displayName}` : "Hello"}
        </h1>
        <p className="text-fg-muted mt-1 text-sm">
          Your account is ready. Logging a spend arrives with the next feature.
        </p>
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="text-fg text-sm font-medium">What this app knows</h2>
        <dl className="text-sm">
          <div className="flex justify-between py-1">
            <dt className="text-fg-muted">Currency</dt>
            <dd className="text-fg">{settings.currency}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-fg-muted">Time zone</dt>
            <dd className="text-fg">{settings.timezone}</dd>
          </div>
        </dl>
        <p className="text-fg-subtle mt-1 text-sm">
          Both came from you, not from this server. They decide how an amount
          reads and where your month ends.
        </p>
      </Card>

      <Link
        href="/settings"
        className="focus-ring text-fg-muted hover:text-fg self-start rounded-sm text-sm underline"
      >
        Your account
      </Link>
    </div>
  );
}
