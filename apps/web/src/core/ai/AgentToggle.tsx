"use client";

import { Sparkles } from "lucide-react";
import { useAgentWindow } from "./agent-context";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

/** Header button that opens and closes the agent window. Hidden without ai.chat.use. */
export function AgentToggle() {
  const agent = useAgentWindow();
  if (!agent.available) return null;
  return (
    <Button
      variant={agent.open ? "secondary" : "outline"}
      size="sm"
      aria-pressed={agent.open}
      aria-label="Assistente"
      onClick={agent.toggle}
    >
      <Sparkles data-icon="inline-start" />
      <span className="hidden @lg/page:inline">Assistente</span>
      <Kbd className="hidden @3xl/page:inline-flex">⌘I</Kbd>
    </Button>
  );
}
