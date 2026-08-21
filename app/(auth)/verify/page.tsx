import { VerifyForm } from "@/components/auth/VerifyForm";
import { AuthLayout } from "@/components/ui/AuthLayout";

export const metadata = { title: "Confirm your email · FinTrack" };

/**
 * Confirm the code that was emailed.
 *
 * Public, because the whole point is that this account cannot sign in yet.
 */
export default async function VerifyPage({
  searchParams,
}: PageProps<"/verify">) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";

  return (
    <AuthLayout title="Confirm your email">
      <p className="text-fg-muted mb-5 text-sm">
        We sent a six digit code. Type it here and you are in.
      </p>
      <VerifyForm email={email} />
    </AuthLayout>
  );
}
