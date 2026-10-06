"use client";

import { Lock } from "lucide-react";
import { AGENT_NAME } from "@/core/brand";
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
          title={`${AGENT_NAME} indisponível`}
          description="Sua conta não tem acesso ao assistente. Peça a um administrador."
          className="m-auto"
        />
      }
    >
      <ChatPage />
    </RequirePermission>
  );
}
