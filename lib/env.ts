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
  APP_CURRENCY: z
    .string()
    .regex(/^[A-Z]{3}$/, "must be a three letter ISO 4217 code, such as USD"),
  APP_TIMEZONE: z
    .string()
    .min(1)
    .refine(
      isRealTimeZone,
      "must be an IANA time zone name, such as America/New_York",
    ),
  // Spec 0003 AC-17: the component gallery renders only when this is set, and
  // this is the one place in the codebase that reads it. Unset means false,
  // which is what production runs. A value that is not one of these four is a
  // typo, and a typo that silently disables a route is worse than a loud stop.
  UI_GALLERY: z
    .enum(["1", "0", "true", "false"], {
      message: "must be 1, 0, true, or false, or be left unset",
    })
    .optional()
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
    APP_CURRENCY: process.env.APP_CURRENCY,
    APP_TIMEZONE: process.env.APP_TIMEZONE,
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
