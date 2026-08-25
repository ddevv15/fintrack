import { cache } from "react";

import { decimalsFor } from "@/lib/currency";
import { createInsforgeServer } from "@/lib/insforge-server";
import { parseRow, profileSchema } from "@/lib/schema";

/**
 * Your currency, your timezone, and your name, read once per request.
 *
 * This is the single read path spec 0004 fixes as the seam between the two
 * halves of the feature: authentication resolves who is signed in, and this
 * resolves that person into the three values every money or date rendering
 * needs. No server module reads APP_CURRENCY or APP_TIMEZONE for a signed in
 * person, ever. Those two are now only the suggestions the sign up form
 * preselects.
 *
 * The return type is a discriminated union rather than an object with optional
 * fields, and that is the whole design. A caller cannot reach `currency` or
 * `timezone` without narrowing on `isComplete` first, so "we have not asked
 * this person yet" cannot be quietly treated as "use the default".
 */
export type Settings =
  | {
      isComplete: true;
      currency: string;
      decimals: number;
      timezone: string;
      displayName: string | undefined;
    }
  | { isComplete: false; displayName: string | undefined };

/**
 * Load the signed in person's settings for this request.
 *
 * Wrapped in React `cache()`, so a page that renders three amounts and a date
 * costs one query rather than four, and every one of them sees the same values.
 *
 * Throws rather than returning partial data. A missing or unreadable profile is
 * an error page, never a screen with money on it: rule 3 of `AGENTS.md` says a
 * wrong money figure shown confidently is worse than an honest failure. An
 * incomplete profile is neither of those, it is an ordinary state a new account
 * is in, so that comes back as `isComplete: false`.
 */
export const getSettings = cache(
  async function getSettings(): Promise<Settings> {
    const insforge = await createInsforgeServer();

    const { data: userData, error: userError } =
      await insforge.auth.getCurrentUser();
    if (userError || !userData?.user?.id) {
      throw new Error(
        "Cannot read settings: nobody is signed in. Every caller of getSettings() is behind route protection, so reaching this means the proxy let an unauthenticated request through.",
      );
    }

    const { data, error } = await insforge.database
      .from("profiles")
      .select("user_id,display_name,currency,timezone,created_at")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not read your profile: ${error.message}`);
    }
    if (!data) {
      throw new Error(
        "Your profile row is missing. It is created by the database when the account is created, so this means it was deleted by hand.",
      );
    }

    const profile = parseRow(profileSchema, "profiles", data);

    if (!profile.currency || !profile.timezone) {
      return { isComplete: false, displayName: profile.display_name };
    }

    return {
      isComplete: true,
      currency: profile.currency,
      // Throws on a code that is not in lib/currency.ts. The foreign key means
      // that cannot normally happen, so if it does the two lists have drifted and
      // an error is the right answer rather than a guessed exponent.
      decimals: decimalsFor(profile.currency),
      timezone: profile.timezone,
      displayName: profile.display_name,
    };
  },
);

/**
 * The same, but for code that has already established the profile is complete.
 *
 * Anything behind the completeness redirect (which is every signed in screen
 * except setup) can call this and skip the narrowing. It throws if the profile
 * turns out to be incomplete, which would mean the routing rule is broken.
 */
export async function requireCompleteSettings(): Promise<
  Extract<Settings, { isComplete: true }>
> {
  const settings = await getSettings();
  if (!settings.isComplete) {
    throw new Error(
      "This screen needs a currency and a time zone, and this account has neither. The completeness redirect in proxy.ts should have sent it to /setup first.",
    );
  }
  return settings;
}
