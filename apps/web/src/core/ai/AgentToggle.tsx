"use client";

import { AGENT_NAME, AgentMark } from "@/core/brand";
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
      aria-label={AGENT_NAME}
      onClick={agent.toggle}
    >
      <AgentMark data-icon="inline-start" />
      <span className="hidden @lg/page:inline">{AGENT_NAME}</span>
      <Kbd className="hidden @3xl/page:inline-flex">⌘I</Kbd>
    </Button>
  );
}
