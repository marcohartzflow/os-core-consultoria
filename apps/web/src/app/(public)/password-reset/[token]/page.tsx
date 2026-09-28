"use client";

import { useRouter } from "next/navigation";
import { use } from "react";
import { SetPasswordForm } from "@/core/auth/SetPasswordForm";

export default function PasswordResetConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  return (
    <SetPasswordForm
      endpoint="/api/iam/password-reset/confirm"
      token={token}
      title="Escolha uma nova senha"
      submitLabel="Redefinir senha"
      onDone={() => router.replace("/login")}
    />
  );
}
