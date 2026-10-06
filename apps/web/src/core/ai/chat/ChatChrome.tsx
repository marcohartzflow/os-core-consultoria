"use client";

import { Download, MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import type { ConversationSummary } from "@/core/api/types";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
import { AgentSettings } from "../AgentSettings";
import type { AgentChat } from "../useAgentChat";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Menu of the open conversation, in the header of the chat page and of the panel. */
export function ConversationOptions({ chat, onDelete }: { chat: AgentChat; onDelete: (c: ConversationSummary) => void }) {
  const active = chat.active;
  if (!active) return null;
  const isPinned = chat.pinned.includes(active.id);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Opções da conversa">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Opções da conversa</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="truncate">{active.title || "Nova conversa"}</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => chat.togglePin(active)}>
            {isPinned ? <PinOff /> : <Pin />}
            {isPinned ? "Desafixar" : "Fixar"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void chat.exportConversation(active)}>
            <Download />
            Exportar (Markdown)
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(active)}>
          <Trash2 />
          Excluir conversa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Settings of the assistant and the delete confirmation, shared by the chat page and the panel. */
export function ChatDialogs({
  chat,
  settingsOpen,
  onSettingsOpenChange,
  deleting,
  onDeletingChange,
}: {
  chat: AgentChat;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  deleting: ConversationSummary | "all" | null;
  onDeletingChange: (target: ConversationSummary | "all" | null) => void;
}) {
  return (
    <>
      <AgentSettings
        open={settingsOpen}
        onOpenChange={onSettingsOpenChange}
        conversationCount={chat.conversations?.length ?? null}
        onDeleteAll={() => {
          onSettingsOpenChange(false);
          onDeletingChange("all");
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && onDeletingChange(null)}
        destructive
        title={deleting === "all" ? "Excluir todas as conversas?" : "Excluir esta conversa?"}
        description={
          deleting === "all"
            ? "Todas as suas conversas com o assistente são apagadas de forma definitiva. A auditoria das ferramentas usadas continua."
            : "A conversa é apagada de forma definitiva. A auditoria das ferramentas usadas continua."
        }
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (deleting) await chat.remove(deleting);
        }}
      />
    </>
  );
}
