"use client";

import { Lock } from "lucide-react";
import { ChatPage } from "@/core/ai/ChatPage";
import { RequirePermission } from "@/core/auth/AuthProvider";
import { EmptyState } from "@/core/ui/feedback";

export default function Page() {
  return (
    <RequirePermission
      permission="ai.chat.use"
      fallback={
        <EmptyState
          icon={Lock}
          title="Assistente indisponível"
          description="Sua conta não tem acesso ao assistente. Peça a um administrador."
          className="m-auto"
        />
      }
    >
      <ChatPage />
    </RequirePermission>
  );
}
