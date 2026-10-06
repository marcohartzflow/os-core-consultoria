"use client";

import { useRouter } from "next/navigation";
import { use } from "react";
import { SetPasswordForm } from "@/core/auth/SetPasswordForm";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  return (
    <SetPasswordForm
      endpoint="/api/iam/invitations/accept"
      token={token}
      title="Bem-vindo"
      description="Defina sua senha para ativar a conta."
      submitLabel="Ativar conta"
      onDone={() => router.replace("/login")}
    />
  );
}
