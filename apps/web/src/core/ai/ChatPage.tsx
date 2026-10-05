"use client";

import { useRef, useState } from "react";
import { PanelLeft, Search, Settings, SquarePen } from "lucide-react";
import type { ConversationSummary } from "@/core/api/types";
import { useAuth } from "@/core/auth/AuthProvider";
import { ErrorState } from "@/core/ui/feedback";
import { ChatSearch } from "./chat/ChatSearch";
import { ChatDialogs, ConversationOptions } from "./chat/ChatChrome";
import { Composer } from "./chat/Composer";
import { Conversation } from "./chat/Conversation";
import { ConversationList } from "./chat/ConversationList";
import { ModelPicker } from "./chat/ModelPicker";
import { suggestionsFor } from "./chat/suggestions";
import { useAgentPreferences } from "./preferences";
import { useAgentChat } from "./useAgentChat";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * The assistant as a full page, after the chat-03 block of blocks.so: conversations on the left,
 * model picker on top, the thread and the composer. Same conversations and rules as the side panel.
 */
export function ChatPage() {
  const { hasPermission } = useAuth();
  const [preferences] = useAgentPreferences();
  const chat = useAgentChat();
  const isMobile = useIsMobile();
  const [listOpen, setListOpen] = useState(true);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<ConversationSummary | "all" | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const focusComposer = () => setTimeout(() => composer.current?.focus(), 0);
  const startNew = (text = "") => {
    chat.startNew(text);
    setMobileListOpen(false);
    focusComposer();
  };
  const open = (id: string) => {
    chat.open(id);
    setMobileListOpen(false);
  };
  const altModel = chat.models?.find((m) => m.id !== chat.model?.id) ?? null;

  const list = (
    <>
      <SidebarHeader className="gap-2">
        <Button onClick={() => startNew()}>
          <SquarePen data-icon="inline-start" />
          Nova conversa
        </Button>
        <Button variant="outline" className="justify-start text-muted-foreground" onClick={() => setSearchOpen(true)}>
          <Search data-icon="inline-start" />
          Buscar conversas
          <Kbd className="ml-auto">⌘K</Kbd>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <ConversationList
          conversations={chat.conversations}
          activeId={chat.activeId}
          pinned={chat.pinned}
          actions={{
            onOpen: open,
            onRename: (c, title) => void chat.rename(c, title),
            onTogglePin: chat.togglePin,
            onExport: (c) => void chat.exportConversation(c),
            onDelete: setDeleting,
          }}
        />
      </SidebarContent>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1">
      {isMobile ? (
        <Sheet open={mobileListOpen} onOpenChange={setMobileListOpen}>
          <SheetContent side="left" className="w-(--sidebar-width) gap-0 bg-sidebar p-0 text-sidebar-foreground">
            <SheetTitle className="sr-only">Conversas</SheetTitle>
            <SheetDescription className="sr-only">Suas conversas com o assistente</SheetDescription>
            {list}
          </SheetContent>
        </Sheet>
      ) : (
        listOpen && (
          <Sidebar collapsible="none" className="border-r" aria-label="Conversas">
            {list}
          </Sidebar>
        )
      )}

      <section aria-label="Assistente" className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={isMobile || !listOpen ? "Mostrar conversas" : "Ocultar conversas"}
                onClick={() => (isMobile ? setMobileListOpen(true) : setListOpen(!listOpen))}
              >
                <PanelLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isMobile || !listOpen ? "Mostrar conversas" : "Ocultar conversas"}</TooltipContent>
          </Tooltip>
          <ModelPicker models={chat.models} model={chat.model} onChange={chat.setModel} disabled={chat.busy} />
          <div className="ml-auto flex items-center gap-1">
            <ConversationOptions chat={chat} onDelete={setDeleting} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Configurações do assistente" onClick={() => setSettingsOpen(true)}>
                  <Settings />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Configurações do assistente</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {chat.loadError ? (
          <ErrorState error={chat.loadError} onRetry={chat.retryLoad} className="m-auto" />
        ) : (
          <Conversation
            turns={chat.turns}
            busy={chat.busy}
            opening={chat.opening}
            altModel={altModel}
            showTools={preferences.showTools}
            textSize={preferences.textSize}
            recent={(chat.conversations ?? []).slice(0, 3)}
            suggestions={suggestionsFor(hasPermission)}
            onOpen={open}
            onPick={(text) => chat.send(text)}
            onEdit={(text) => {
              chat.setDraft(text);
              focusComposer();
            }}
            onRetry={chat.retry}
            onResolve={chat.resolve}
            toolSettings={chat.toolSettings}
            onRevoke={(tool) => chat.chooseTool(tool, "ASK")}
          />
        )}
        <Composer
          ref={composer}
          value={chat.draft}
          onChange={chat.setDraft}
          busy={chat.busy}
          enterToSend={preferences.enterToSend}
          onSend={() => chat.send()}
          onStop={chat.stop}
          onOpenTools={() => setSettingsOpen(true)}
        />
      </section>

      <ChatSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        conversations={chat.conversations}
        onOpen={open}
        onNew={startNew}
      />
      <ChatDialogs
        chat={chat}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        deleting={deleting}
        onDeletingChange={setDeleting}
      />
    </div>
  );
}
