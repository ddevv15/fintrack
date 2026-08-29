import Link from "next/link";

import { signOut } from "@/actions/auth";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { DeleteAccountForm } from "@/components/settings/DeleteAccountForm";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/auth";
import { currencyName, listCurrencies } from "@/lib/currency";
import { createInsforgeServer } from "@/lib/insforge-server";
import { requireCompleteSettings } from "@/lib/settings";
import { timeZoneNames } from "@/lib/time";

export const metadata = { title: "Your account · FinTrack" };

/**
 * Your account: what it knows about you, and how to leave.
 *
 * Four things, in the order somebody actually wants them: what is changeable,
 * the way out of this browser, the password, and then the irreversible one,
 * last and visually apart.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await requireCompleteSettings();

  // Whether the currency is still yours to change. The trigger on profiles is
  // the real guard; this only decides whether to render a control that would be
  // refused. head:true asks for the count without the rows.
  const { count, error } = await createInsforgeServer().then((insforge) =>
    insforge.database
      .from("transactions")
      .select("id", { count: "exact", head: true }),
  );

  if (error) {
    // Rule 3 of AGENTS.md. Guessing "probably none" here would offer a currency
    // control that the database then refuses, which is a worse screen than an
    // honest failure.
    throw new Error(
      `Could not check whether your currency is fixed: ${error.message}`,
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-fg text-2xl font-semibold">Your account</h1>
        <p className="text-fg-muted mt-1 text-sm">Signed in as {user.email}</p>
      </div>

      <Card>
        <h2 className="text-fg mb-4 text-sm font-medium">Details</h2>
        <ProfileForm
          displayName={settings.displayName ?? ""}
          timezone={settings.timezone}
          currency={settings.currency}
          currencyLabel={`${settings.currency} · ${currencyName(settings.currency)}`}
          currencies={listCurrencies()}
          zones={timeZoneNames()}
          currencyIsLocked={(count ?? 0) > 0}
        />
      </Card>

      <Card>
        <h2 className="text-fg mb-1 text-sm font-medium">Categories</h2>
        <p className="text-fg-muted mb-4 text-sm">
          Add, rename, and hide the categories your spends are filed under.
        </p>
        {/* A plain link, not a form: this reads a screen, it does not write. */}
        <Link
          href="/categories"
          className="focus-ring border-border-strong bg-surface text-fg inline-flex min-h-11 items-center rounded-sm border px-4 text-sm font-medium"
        >
          Manage your categories
        </Link>
      </Card>

      <Card>
        <h2 className="text-fg mb-1 text-sm font-medium">Export and backup</h2>
        <p className="text-fg-muted mb-4 text-sm">
          Take everything you have logged out of the app, as a file a
          spreadsheet opens. Nothing is narrowed and nothing is left out, and
          the file is either complete or you get told why not.
        </p>
        {/* Plain anchors, not `next/link`. These are downloads, not screens:
            client navigation has nothing to render and would swallow the
            response the browser is supposed to save. Each one names the file it
            fetches, so its accessible name says what you are about to get
            rather than just "download" (spec 0010, AC-1). */}
        <div className="flex flex-col items-start gap-2">
          <a
            href="/api/export/transactions"
            className="focus-ring border-border-strong bg-surface text-fg inline-flex min-h-11 items-center rounded-sm border px-4 text-sm font-medium"
          >
            Download your transactions as a CSV file
          </a>
          <a
            href="/api/export/categories"
            className="focus-ring border-border-strong bg-surface text-fg inline-flex min-h-11 items-center rounded-sm border px-4 text-sm font-medium"
          >
            Download your categories as a CSV file
          </a>
        </div>
      </Card>

      <Card>
        <h2 className="text-fg mb-1 text-sm font-medium">This browser</h2>
        <p className="text-fg-muted mb-4 text-sm">
          Signing out ends this session here. Any other browser you are signed
          in on stays signed in.
        </p>
        {/* A form posting a server action, not an onClick: ending a session is
            a write, and it happens on the server where the cookies are. */}
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-fg mb-1 text-sm font-medium">Password</h2>
        <p className="text-fg-muted mb-4 text-sm">
          Changing it signs out every other browser you are signed in on.
        </p>
        <ChangePasswordForm email={user.email} />
      </Card>

      <Card className="border-danger/40">
        <h2 className="text-danger mb-4 text-sm font-medium">
          Delete your account
        </h2>
        <DeleteAccountForm email={user.email} />
      </Card>
    </div>
  );
}
