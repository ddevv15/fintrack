import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AuthLayout } from "@/components/ui/AuthLayout";

export const metadata = { title: "Forgot your password · FinTrack" };

/** Ask for a reset code. Public, since being locked out is the whole premise. */
export default function ForgotPasswordPage() {
  return (
    <AuthLayout title="Forgot your password">
      <p className="text-fg-muted mb-5 text-sm">
        Type the address you signed up with and we will send a six digit code.
      </p>

      <ForgotPasswordForm />

      <p className="text-fg-muted mt-6 text-center text-sm">
        Remembered it?{" "}
        <Link
          href="/sign-in"
          className="focus-ring text-fg rounded-sm underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
