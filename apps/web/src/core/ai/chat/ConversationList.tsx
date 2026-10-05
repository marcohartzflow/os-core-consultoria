"use client";

import { useMemo, useRef, useState } from "react";
import { Download, MessageSquare, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import type { ConversationSummary } from "@/core/api/types";
import { EmptyState } from "@/core/ui/feedback";
import { relativeTime } from "./Conversation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";

export interface ConversationActions {
  onOpen: (id: string) => void;
  onRename: (conversation: ConversationSummary, title: string) => void;
  onTogglePin: (conversation: ConversationSummary) => void;
  onExport: (conversation: ConversationSummary) => void;
  onDelete: (conversation: ConversationSummary) => void;
}

const DAY = 24 * 3600 * 1000;
const ORDER = ["Fixadas", "Hoje", "Ontem", "Últimos 7 dias", "Últimos 30 dias", "Mais antigas"];

function groupOf(updatedAt: string, now: number): string {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const time = new Date(updatedAt).getTime();
  if (time >= startOfToday) return "Hoje";
  if (time >= startOfToday - DAY) return "Ontem";
  if (time >= startOfToday - 7 * DAY) return "Últimos 7 dias";
  if (time >= startOfToday - 30 * DAY) return "Últimos 30 dias";
  return "Mais antigas";
}

/**
 * Conversations grouped as the chat-03 block shows them (pinned first, then by recency), with the
 * row menu: pin, rename in place, export, delete. Built on the sidebar menu components, so it works
 * inside the chat page's sidebar and in the panel's history view alike.
 */
export function ConversationList({
  conversations,
  activeId,
  pinned,
  actions,
}: {
  conversations: ConversationSummary[] | null;
  activeId: string | null;
  pinned: string[];
  actions: ConversationActions;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  // Enter or Esc ends the edit; the blur that follows must not save it again (or save after Esc).
  const editing = useRef(false);
  // Grouping only needs the day; the moment the list mounts is precise enough.
  const [now] = useState(() => Date.now());

  const groups = useMemo(() => {
    const result = new Map<string, ConversationSummary[]>();
    for (const conversation of conversations ?? []) {
      const group = pinned.includes(conversation.id) ? "Fixadas" : groupOf(conversation.updatedAt, now);
      result.set(group, [...(result.get(group) ?? []), conversation]);
    }
    return ORDER.filter((g) => result.has(g)).map((g) => ({ name: g, items: result.get(g)! }));
  }, [conversations, pinned, now]);

  if (!conversations) {
    return (
      <SidebarMenu className="p-2">
        {Array.from({ length: 6 }, (_, i) => (
          <SidebarMenuItem key={i}>
            <SidebarMenuSkeleton />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    );
  }
  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Nenhuma conversa ainda"
        description="As conversas com o assistente ficam aqui, só para você."
        className="p-6"
      />
    );
  }

  const startRename = (conversation: ConversationSummary, current: string) => {
    editing.current = true;
    setName(current);
    setRenaming(conversation.id);
  };
  const finish = (conversation: ConversationSummary, save: boolean) => {
    if (!editing.current) return;
    editing.current = false;
    const title = name.trim();
    if (save && title && title !== conversation.title) actions.onRename(conversation, title);
    setRenaming(null);
  };

  return groups.map((group) => (
    <SidebarGroup key={group.name}>
      <SidebarGroupLabel>{group.name}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((conversation) => {
            const title = conversation.title || "Nova conversa";
            const isPinned = pinned.includes(conversation.id);
            return (
              <SidebarMenuItem key={conversation.id}>
                {renaming === conversation.id ? (
                  <SidebarInput
                    aria-label="Nome da conversa"
                    autoFocus
                    maxLength={200}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => finish(conversation, true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") finish(conversation, true);
                      if (e.key === "Escape") finish(conversation, false);
                    }}
                  />
                ) : (
                  <>
                    <SidebarMenuButton
                      isActive={conversation.id === activeId}
                      onClick={() => actions.onOpen(conversation.id)}
                    >
                      <span>{title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge className="text-muted-foreground tabular-nums group-hover/menu-item:opacity-0 group-focus-within/menu-item:opacity-0 group-has-data-[state=open]/menu-item:opacity-0">
                      {isPinned ? <Pin className="size-3" /> : relativeTime(conversation.updatedAt, now)}
                    </SidebarMenuBadge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover aria-label={`Opções de ${title}`}>
                          <MoreHorizontal />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48" onCloseAutoFocus={(e) => e.preventDefault()}>
                        <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => actions.onTogglePin(conversation)}>
                            {isPinned ? <PinOff /> : <Pin />}
                            {isPinned ? "Desafixar" : "Fixar"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => startRename(conversation, title)}
                          >
                            <Pencil />
                            Renomear
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => actions.onExport(conversation)}>
                            <Download />
                            Exportar (Markdown)
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(conversation)}>
                          <Trash2 />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
