"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { isCurrencyCode } from "@/lib/currency";
import type { FormState } from "@/lib/forms";
import { createInsforgeServer } from "@/lib/insforge-server";

/**
 * Changing the three things on your profile: your name, your currency, and your
 * time zone.
 *
 * Every check here has a matching one in the database, and the database is the
 * real guard. These exist so a screen can explain a refusal in words rather
 * than surfacing a constraint violation, which is a different job from
 * enforcing it.
 */

function fieldError(name: string, message: string): FormState {
  return {
    status: "error",
    message: "Check the fields below.",
    fieldErrors: { [name]: message },
  };
}

const currencyField = z
  .string()
  .refine(isCurrencyCode, "Choose one of the supported currencies.");

/**
 * A real IANA zone name, checked the only way a runtime can check one.
 *
 * Intl throws on a name it does not know, which is both the test and the
 * reason this cannot be a list: the set of zone names is the runtime's, and
 * hardcoding a copy here would go stale the first time a country changes its
 * mind about daylight saving.
 */
const timezoneField = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "That is not a time zone name your browser knows.");

const setupSchema = z.object({
  currency: currencyField,
  timezone: timezoneField,
});

/**
 * The one time screen: choose a currency and a time zone.
 *
 * This is where a Google sign up lands, because Google sends neither value, and
 * where a password sign up never lands, because its form collected both. Both
 * columns are written in one update, so the profile is never half complete.
 */
export async function completeSetup(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = setupSchema.safeParse({
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fieldError(String(issue.path[0] ?? "currency"), issue.message);
  }

  const insforge = await createInsforgeServer();
  const { error } = await insforge.database
    .from("profiles")
    .update(parsed.data)
    .eq("user_id", user.id);

  if (error) {
    return {
      status: "error",
      message: `Could not save that: ${error.message}`,
    };
  }

  redirect("/");
}

const updateProfileSchema = z.object({
  displayName: z.string().max(100, "Keep it under 100 characters."),
  timezone: timezoneField,
  currency: currencyField.optional(),
});

/**
 * Change your name, your time zone, and, while you still can, your currency.
 *
 * Currency is only accepted when the form offered it, which the screen decides
 * by counting your transactions. That count is a courtesy: the `BEFORE UPDATE`
 * trigger on `profiles` is what actually refuses a locked currency, and this
 * catches its error and says why in plain words rather than showing a
 * constraint name (AC-16).
 */
export async function updateProfile(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const submittedCurrency = formData.get("currency");
  const parsed = updateProfileSchema.safeParse({
    displayName: String(formData.get("displayName") ?? "").trim(),
    timezone: formData.get("timezone"),
    currency: submittedCurrency ? String(submittedCurrency) : undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fieldError(String(issue.path[0] ?? "displayName"), issue.message);
  }

  const insforge = await createInsforgeServer();
  const { error } = await insforge.database
    .from("profiles")
    .update({
      display_name: parsed.data.displayName || null,
      timezone: parsed.data.timezone,
      ...(parsed.data.currency ? { currency: parsed.data.currency } : {}),
    })
    .eq("user_id", user.id);

  if (error) {
    if (/currency cannot change/i.test(error.message ?? "")) {
      return fieldError(
        "currency",
        "Your currency is fixed now that this account has entries. Changing it would silently rewrite what past months mean.",
      );
    }
    return {
      status: "error",
      message: `Could not save that: ${error.message}`,
    };
  }

  // Every signed in screen reads getSettings(), so a changed currency or zone
  // has to invalidate all of them, not just this one.
  revalidatePath("/", "layout");
  return { status: "ok" };
}
