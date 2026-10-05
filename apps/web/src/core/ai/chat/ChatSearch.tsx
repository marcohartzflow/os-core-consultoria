"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import type { ConversationSummary } from "@/core/api/types";
import { relativeTime } from "./Conversation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Search of the chat-03 block (⌘K on the chat page): conversations by title, and "Nova conversa"
 * with what was typed. Message text is not searched: it stays on the server until a conversation opens.
 */
export function ChatSearch({
  open,
  onOpenChange,
  conversations,
  onOpen,
  onNew,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null while the conversations are loading. */
  conversations: ConversationSummary[] | null;
  onOpen: (id: string) => void;
  onNew: (draft: string) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const close = (action: () => void) => {
    action();
    onOpenChange(false);
    setQuery("");
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
      title="Buscar conversas"
      description="Busque uma conversa pelo nome ou comece outra"
    >
      <Command>
        <CommandInput placeholder="Buscar conversas…" value={query} onValueChange={setQuery} />
        <CommandList>
          {conversations && <CommandEmpty>Nenhuma conversa com “{query}”.</CommandEmpty>}
          {!conversations && (
            <div className="flex flex-col gap-2 p-2" aria-busy="true" aria-label="Carregando conversas">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}
          <CommandGroup heading="Conversas">
            {(conversations ?? []).map((c) => (
              <CommandItem key={c.id} value={`${c.title} ${c.id}`} onSelect={() => close(() => onOpen(c.id))}>
                <MessageSquare />
                <span className="truncate">{c.title || "Nova conversa"}</span>
                <CommandShortcut className="tracking-normal">{relativeTime(c.updatedAt)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Ações" forceMount>
            <CommandItem forceMount value={`nova conversa ${query}`} onSelect={() => close(() => onNew(query.trim()))}>
              <Plus />
              <span className="truncate">{query.trim() ? `Nova conversa sobre “${query.trim()}”` : "Nova conversa"}</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
