"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Expand, History, Maximize2, Minimize2, Search, Settings, SquarePen, X } from "lucide-react";
import type { ConversationSummary } from "@/core/api/types";
import { useAuth } from "@/core/auth/AuthProvider";
import { ErrorState } from "@/core/ui/feedback";
import { useAgentWindow } from "./agent-context";
import { ChatDialogs, ConversationOptions } from "./chat/ChatChrome";
import { Composer } from "./chat/Composer";
import { Conversation } from "./chat/Conversation";
import { ConversationList } from "./chat/ConversationList";
import { ModelPicker } from "./chat/ModelPicker";
import { suggestionsFor } from "./chat/suggestions";
import { useAgentPreferences } from "./preferences";
import { useAgentChat } from "./useAgentChat";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} className={className}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The agent window next to any page: the chat page's thread, composer and model picker in a narrow frame. */
export function AgentPanel() {
  const { hasPermission } = useAuth();
  const agent = useAgentWindow();
  const [preferences] = useAgentPreferences();
  const chat = useAgentChat();
  const [view, setView] = useState<"chat" | "history">("chat");
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<ConversationSummary | "all" | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const focusComposer = () => setTimeout(() => composer.current?.focus(), 0);
  const startNew = () => {
    chat.startNew();
    setView("chat");
    focusComposer();
  };
  const open = (id: string) => {
    chat.open(id);
    setView("chat");
  };
  const needle = search.trim().toLocaleLowerCase("pt-BR");
  const altModel = chat.models?.find((m) => m.id !== chat.model?.id) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <IconButton label={view === "history" ? "Voltar à conversa" : "Histórico"} onClick={() => setView(view === "history" ? "chat" : "history")}>
          <History />
        </IconButton>
        <ModelPicker models={chat.models} model={chat.model} onChange={chat.setModel} disabled={chat.busy} />
        <div className="ml-auto flex items-center">
          <IconButton label="Nova conversa" onClick={startNew}>
            <SquarePen />
          </IconButton>
          <ConversationOptions chat={chat} onDelete={setDeleting} />
          <IconButton label="Configurações" onClick={() => setSettingsOpen(true)}>
            <Settings />
          </IconButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Abrir em tela cheia" asChild>
                <Link href="/chat">
                  <Expand />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Abrir em tela cheia</TooltipContent>
          </Tooltip>
          <IconButton label={agent.wide ? "Reduzir" : "Ampliar"} onClick={agent.toggleWide} className="hidden md:inline-flex">
            {agent.wide ? <Minimize2 /> : <Maximize2 />}
          </IconButton>
          <IconButton label="Fechar (⌘I)" onClick={() => agent.setOpen(false)}>
            <X />
          </IconButton>
        </div>
      </header>

      {view === "history" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-2 p-3">
            <Button variant="outline" className="justify-start" onClick={startNew}>
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
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
            {needle && chat.conversations?.every((c) => !c.title.toLocaleLowerCase("pt-BR").includes(needle)) ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma conversa com esse termo.</p>
            ) : (
              <ConversationList
                conversations={
                  chat.conversations?.filter((c) => !needle || c.title.toLocaleLowerCase("pt-BR").includes(needle)) ?? null
                }
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
            )}
          </div>
        </div>
      ) : (
        <>
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
            className="px-3 pb-3"
          />
        </>
      )}

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
