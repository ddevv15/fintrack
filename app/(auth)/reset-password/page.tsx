import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { AuthLayout } from "@/components/ui/AuthLayout";

export const metadata = { title: "Set a new password · FinTrack" };

/**
 * Type the emailed code and choose a new password.
 *
 * The address arrives in the query string only to save typing it twice. The
 * code is what authorises the change, so a tampered address here just means the
 * code will not match.
 */
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";

  return (
    <AuthLayout title="Set a new password">
      <p className="text-fg-muted mb-5 text-sm">
        If that address has an account, a code is in its inbox now.
      </p>

      <ResetPasswordForm email={email} />

      <p className="text-fg-muted mt-6 text-center text-sm">
        Code expired?{" "}
        <Link
          href="/forgot-password"
          className="focus-ring text-fg rounded-sm underline"
        >
          Ask for a fresh one
        </Link>
      </p>
    </AuthLayout>
  );
}
