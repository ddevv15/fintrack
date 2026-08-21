import { z } from "zod";

/**
 * Environment configuration for FinTrack, validated once with Zod.
 *
 * Spec 0001 listed four values. Spec 0003 added the fifth, UI_GALLERY, the way
 * that spec said later features should add them. Anything a later feature needs
 * (ARCJET_KEY, PostHog keys) gets added when that feature is built, not before.
 */
const envSchema = z.object({
  NEXT_PUBLIC_INSFORGE_URL: z.url("must be the full InsForge project URL"),
  NEXT_PUBLIC_INSFORGE_ANON_KEY: z.string().min(1, "must not be empty"),
  // Where this app answers, used to build the one absolute URL the app needs:
  // the `redirectTo` Google sends you back to. It cannot be derived from the
  // request, because the value has to match what the InsForge dashboard allows,
  // and a redirect target taken from a header is a redirect target an attacker
  // can set. Spec 0004 added it.
  // The protocol constraint is not decoration. `z.url()` alone accepts
  // "localhost:3000", because the URL parser reads that as the protocol
  // "localhost:" with the path "3000". It would validate here and then build a
  // nonsense redirect that Google refuses, which is a confusing failure a long
  // way from its cause.
  APP_URL: z.url({
    protocol: /^https?$/,
    error:
      "must be the full origin this app runs on, protocol and all, such as http://localhost:3000",
  }),
  // Spec 0004 demoted these two, and the demotion is easy to undo by accident,
  // so it is written here rather than only in the spec.
  //
  // APP_CURRENCY is NO LONGER the app's currency. It is only the currency the
  // sign up form preselects. A signed in person's currency is profiles.currency
  // and reaches code through getSettings() in lib/settings.ts.
  APP_CURRENCY: z
    .string()
    .regex(/^[A-Z]{3}$/, "must be a three letter ISO 4217 code, such as USD"),
  // APP_TIMEZONE is NO LONGER the app's timezone. It is only the fallback
  // suggestion on the sign up form when the browser offers none. No signed in
  // code path may read it: today() and currentMonthRange() take the zone as a
  // required argument precisely so this cannot creep back in.
  APP_TIMEZONE: z
    .string()
    .min(1)
    .refine(
      isRealTimeZone,
      "must be an IANA time zone name, such as America/New_York",
    ),
  // Spec 0004 AC-8: the Arcjet site key, for attempt limiting on sign in, sign
  // up, and password reset. Optional on purpose, and this is the one place that
  // decision is visible: the whole feature is built to fail open, so no key
  // means no limiting and a warning in the log, exactly as an Arcjet outage
  // does. Requiring it would mean a missing key takes the whole app down, which
  // is the opposite of what fail open is for. See lib/attempt-limit.ts.
  ARCJET_KEY: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  // Spec 0003 AC-17: the component gallery renders only when this is set, and
  // this is the one place in the codebase that reads it. Unset means false,
  // which is what production runs. A value that is not one of these four is a
  // typo, and a typo that silently disables a route is worse than a loud stop.
  UI_GALLERY: z
    .string()
    .optional()
    // A variable set to nothing arrives as "" rather than undefined: a bare
    // `UI_GALLERY=` line in a .env file, or an empty value in a hosting
    // dashboard. Both plainly mean "not set", so they are normalised to that
    // before the check below. Without this, one blank line fails the whole
    // schema and env() throws on every route, not just the gallery.
    .transform((value) => (value === "" ? undefined : value))
    .pipe(
      z
        .enum(["1", "0", "true", "false"], {
          message: "must be 1, 0, true, or false, or be left unset",
        })
        .optional(),
    )
    .transform((value) => value === "1" || value === "true"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Read literally, never as a loop over process.env. Next.js only substitutes
 * NEXT_PUBLIC_* values into a bundle where it can see the property access in
 * the source, so a dynamic lookup would come back undefined in the browser.
 */
function readRawEnv() {
  return {
    NEXT_PUBLIC_INSFORGE_URL: process.env.NEXT_PUBLIC_INSFORGE_URL,
    NEXT_PUBLIC_INSFORGE_ANON_KEY: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    APP_URL: process.env.APP_URL,
    APP_CURRENCY: process.env.APP_CURRENCY,
    APP_TIMEZONE: process.env.APP_TIMEZONE,
    ARCJET_KEY: process.env.ARCJET_KEY,
    UI_GALLERY: process.env.UI_GALLERY,
  };
}

function isRealTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

let cached: Env | null = null;

/**
 * Validate on first use, then reuse the result.
 *
 * This throws rather than falling back to a default, which matches rule 11 in
 * spec 0001: a money app says plainly that it is misconfigured instead of
 * showing you a confident but wrong number.
 */
export function env(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(readRawEnv());
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `FinTrack is missing or has invalid environment configuration:\n${problems}\n` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }

  cached = parsed.data;
  return cached;
}
