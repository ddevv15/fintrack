import { z } from "zod";

/**
 * Environment configuration for FinTrack, validated once with Zod.
 *
 * Spec 0001 listed four values. Spec 0003 added the fifth, UI_GALLERY, the way
 * that spec said later features should add them. Anything a later feature needs
 * gets added when that feature is built, not before: ARCJET_KEY arrived with
 * spec 0004, the four Sentry values with spec 0011.
 *
 * Spec 0001 expected those last four to be PostHog keys. Spec 0011 weighed that
 * choice, which 0001 had pencilled in without deliberating, and chose Sentry
 * instead. Everything else in 0001 stands.
 *
 * Two schemas live here, not one. `env()` validates everything and is what
 * server code calls. `publicEnv()` validates only the browser safe subset, for
 * the few modules that genuinely run on both sides, which today is the spec
 * 0011 monitoring setup.
 *
 * One file reads `process.env` directly and is allowed to: `next.config.ts`,
 * for the three build time Sentry values. Next loads that config before this
 * module's graph exists, so it cannot import from here. The values are still
 * declared and validated below for every consumer that runs inside the app.
 */
/**
 * The values that reach the browser, split out so they can be read there.
 *
 * Spec 0011 forced this split. Error monitoring runs on both sides, and the
 * browser half needs the DSN before hydration. It cannot call `env()`, because
 * that validates the whole schema and most of it is server only: APP_URL and
 * the rest are simply absent in a bundle, so `env()` in the browser throws on
 * values the browser was never meant to have.
 *
 * Splitting the schema rather than reading `process.env` in a client file keeps
 * the rule in `AGENTS.md` intact: every variable is still declared and
 * validated here, in one place, and nothing else reaches for `process.env`.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_INSFORGE_URL: z.url("must be the full InsForge project URL"),
  NEXT_PUBLIC_INSFORGE_ANON_KEY: z.string().min(1, "must not be empty"),
  // Spec 0011 AC-13: where error reports are sent. Optional for exactly the
  // reason ARCJET_KEY below is optional, and the reasoning is worth repeating
  // rather than cross referencing: the whole feature is built to fail open, so
  // no DSN means no reporting and a warning in the log. Requiring it would let
  // a monitoring misconfiguration take down a money app, which is the precise
  // failure monitoring exists to prevent.
  //
  // NEXT_PUBLIC_ because the browser half needs it in the bundle. That is safe:
  // a DSN is a write only address. It accepts events, it cannot read them back.
  NEXT_PUBLIC_SENTRY_DSN: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  // Set by Vercel, not by you, and public so the browser half can read them
  // too. Optional because they are genuinely absent on a local machine: this
  // project's onboarding copies `.env.example`, it does not run `vercel env
  // pull`. That absence is load bearing rather than incidental, and spec 0011
  // AC-9 turns on it. See `shouldReport()` in `lib/monitoring.ts`.
  NEXT_PUBLIC_VERCEL_ENV: z.string().optional(),
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: z.string().optional(),
});

const envSchema = publicEnvSchema.extend({
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
  // Spec 0011 AC-10: build time only, authorising the source map upload so a
  // stack trace names a real file instead of a position in a minified bundle.
  // Deliberately NOT NEXT_PUBLIC_, unlike the DSN: this one grants write access
  // to the Sentry project, so it must never reach a bundle.
  SENTRY_AUTH_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  // Which Sentry project the maps upload to. Optional with the token above:
  // all three are absent in a normal local checkout, and their absence just
  // means no upload, never a failed build.
  SENTRY_ORG: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  SENTRY_PROJECT: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  // The server side twins of the two NEXT_PUBLIC_VERCEL_ values above. Vercel
  // sets these unconditionally, while the public ones depend on the project
  // having system environment variables exposed, so these are the fallback that
  // keeps server reporting working either way. Both optional: neither exists on
  // a local machine, and spec 0011 AC-9 requires that absence to mean off.
  VERCEL_ENV: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
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
export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Read literally, never as a loop over process.env. Next.js only substitutes
 * NEXT_PUBLIC_* values into a bundle where it can see the property access in
 * the source, so a dynamic lookup would come back undefined in the browser.
 */
function readRawPublicEnv() {
  return {
    NEXT_PUBLIC_INSFORGE_URL: process.env.NEXT_PUBLIC_INSFORGE_URL,
    NEXT_PUBLIC_INSFORGE_ANON_KEY: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  };
}

function readRawEnv() {
  return {
    ...readRawPublicEnv(),
    APP_URL: process.env.APP_URL,
    APP_CURRENCY: process.env.APP_CURRENCY,
    APP_TIMEZONE: process.env.APP_TIMEZONE,
    ARCJET_KEY: process.env.ARCJET_KEY,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
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

let cachedPublic: PublicEnv | null = null;

/**
 * The browser safe subset, readable on either side of the wire.
 *
 * Use this only where the code genuinely runs in both places, which today is
 * the error monitoring setup from spec 0011. Server code should keep calling
 * `env()`, which validates everything and so catches a misconfigured server
 * value at boot rather than at the moment somebody needs it.
 *
 * This one does not throw on a missing value the way `env()` does, because
 * every field in the public schema is either always inlined by the build or
 * optional by design. A DSN that is absent means monitoring is off, which is a
 * supported configuration rather than a broken one.
 */
export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;

  const parsed = publicEnvSchema.safeParse(readRawPublicEnv());
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `FinTrack is missing or has invalid public environment configuration:\n${problems}\n` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }

  cachedPublic = parsed.data;
  return cachedPublic;
}
