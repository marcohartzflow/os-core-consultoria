"use client";

import { useMemo, useState } from "react";
import { Download, MessageSquare, MoreHorizontal, Pencil, Pin, PinOff, Search, SquarePen, Trash2 } from "lucide-react";
import type { ConversationSummary } from "@/core/api/types";
import { EmptyState } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export interface HistoryActions {
  onOpen: (conversation: ConversationSummary) => void;
  onNew: () => void;
  onRename: (conversation: ConversationSummary) => void;
  onTogglePin: (conversation: ConversationSummary) => void;
  onExport: (conversation: ConversationSummary) => void;
  onDelete: (conversation: ConversationSummary) => void;
}

const DAY = 24 * 3600 * 1000;

function groupOf(updatedAt: string, now: number): string {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const time = new Date(updatedAt).getTime();
  if (time >= startOfToday) return "Hoje";
  if (time >= startOfToday - DAY) return "Ontem";
  if (time >= startOfToday - 7 * DAY) return "Últimos 7 dias";
  if (time >= startOfToday - 30 * DAY) return "Últimos 30 dias";
  return "Mais antigas";
}

/** Conversation history as ChatGPT shows it: search, pinned first, then grouped by recency. */
export function AgentHistory({
  conversations,
  activeId,
  pinned,
  titleOf,
  actions,
}: {
  conversations: ConversationSummary[] | null;
  activeId: string | null;
  pinned: string[];
  titleOf: (conversation: ConversationSummary) => string;
  actions: HistoryActions;
}) {
  const [search, setSearch] = useState("");
  // Grouping only needs the day; the moment the history opens is precise enough.
  const [now] = useState(() => Date.now());

  const groups = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    const visible = (conversations ?? []).filter(
      (conversation) => !needle || titleOf(conversation).toLocaleLowerCase("pt-BR").includes(needle),
    );
    const result = new Map<string, ConversationSummary[]>();
    for (const conversation of visible) {
      const group = pinned.includes(conversation.id) ? "Fixadas" : groupOf(conversation.updatedAt, now);
      result.set(group, [...(result.get(group) ?? []), conversation]);
    }
    const order = ["Fixadas", "Hoje", "Ontem", "Últimos 7 dias", "Últimos 30 dias", "Mais antigas"];
    return order.filter((name) => result.has(name)).map((name) => ({ name, items: result.get(name)! }));
  }, [conversations, pinned, search, titleOf, now]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 p-3">
        <Button variant="outline" className="justify-start" onClick={actions.onNew}>
          <SquarePen data-icon="inline-start" />
          Nova conversa
        </Button>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Buscar conversas"
            placeholder="Buscar conversas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations && conversations.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma conversa ainda"
            description="As conversas com o assistente ficam aqui, só para você."
            className="p-6"
          />
        ) : groups.length === 0 && search ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma conversa com esse termo.</p>
        ) : (
          groups.map((group) => (
            <div key={group.name} className="mb-3">
              <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{group.name}</p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((conversation) => {
                  const isPinned = pinned.includes(conversation.id);
                  return (
                    <li key={conversation.id} className="group/row relative">
                      <Button
                        variant="ghost"
                        className={cn(
                          "h-9 w-full justify-start pr-9 font-normal",
                          conversation.id === activeId && "bg-muted font-medium",
                        )}
                        onClick={() => actions.onOpen(conversation)}
                      >
                        {isPinned && <Pin data-icon="inline-start" className="text-muted-foreground" />}
                        <span className="truncate">{titleOf(conversation)}</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Opções de ${titleOf(conversation)}`}
                            className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onSelect={() => actions.onTogglePin(conversation)}>
                            {isPinned ? <PinOff /> : <Pin />}
                            {isPinned ? "Desafixar" : "Fixar"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => actions.onRename(conversation)}>
                            <Pencil />
                            Renomear
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => actions.onExport(conversation)}>
                            <Download />
                            Exportar (Markdown)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(conversation)}>
                            <Trash2 />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
