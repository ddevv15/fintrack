import { redirect } from "next/navigation";

import { AppShell } from "@/components/ui/AppShell";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

/**
 * The frame every signed in screen sits in, and the second of the two gates.
 *
 * `proxy.ts` already refused this request if there was no session, so the check
 * here is the belt to its braces: a forged access token looks valid to a cookie
 * check and is rejected by `requireUser()`, which asks the backend.
 *
 * The completeness redirect lives here rather than in the proxy because it
 * needs a query, and a query in the proxy would run on every request in the app
 * including ones about to redirect anyway. The value still comes from
 * `getSettings()`, which is what spec 0004's cross child contract actually
 * fixes: one function owns the answer, wherever it is asked (AC-14).
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  const settings = await getSettings();
  if (!settings.isComplete) redirect("/setup");

  return <AppShell>{children}</AppShell>;
}
