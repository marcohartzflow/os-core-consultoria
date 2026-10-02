"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Download,
  History,
  Maximize2,
  Mic,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCw,
  Settings,
  Sparkles,
  Square,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import { api, errorMessage, isGated, mutationHeaders, problem, UserFacingError } from "@/core/api/client";
import type { ChatMessage, ConversationSummary, PendingActionView } from "@/core/api/types";
import { useAuth } from "@/core/auth/AuthProvider";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
import { notifyError, notifySuccess } from "@/core/ui/feedback";
import { AgentHistory } from "./AgentHistory";
import { AgentSettings } from "./AgentSettings";
import { useAgentWindow } from "./agent-context";
import { Markdown } from "./Markdown";
import { MODELS, useAgentPreferences } from "./preferences";
import { internalPath, readEvents } from "./stream";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Line =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming?: boolean }
  | { kind: "tool"; text: string }
  | { kind: "note"; text: string }
  | { kind: "link"; text: string; href: string };

const MAX_LENGTH = 4000;
const TEXT_SIZE = { sm: "text-xs", md: "text-sm", lg: "text-base" } as const;

function IconButton({
  label,
  onClick,
  children,
  disabled,
  className,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled} className={className}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function asMarkdown(title: string, messages: { role: string; text: string }[]) {
  return [
    `# ${title}`,
    "",
    ...messages.flatMap((m) => [`**${m.role === "user" ? "Você" : "Assistente"}:**`, "", m.text, ""]),
  ].join("\n");
}

/** The agent window: history, conversation, composer and settings. */
export function AgentPanel() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const agent = useAgentWindow();
  const [preferences, updatePreferences] = useAgentPreferences();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [pending, setPending] = useState<PendingActionView[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<ConversationSummary | "all" | null>(null);
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null);
  // Renaming is a preview: the new name lives only in this tab (the API has no rename yet).
  const [names, setNames] = useState<Record<string, string>>({});
  const [atBottom, setAtBottom] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  // A conversation created by send() has no history yet; loading it would wipe the message being sent.
  const createdBySend = useRef<string | null>(null);

  const titleOf = useCallback(
    (conversation: ConversationSummary) => names[conversation.id] ?? (conversation.title || "Nova conversa"),
    [names],
  );
  const active = conversations?.find((c) => c.id === activeId) ?? null;

  const loadConversations = useCallback(
    () =>
      api<ConversationSummary[]>("/api/ai/conversations").then(
        (list) => {
          setConversations(list);
          setActiveId((current) => current ?? list[0]?.id ?? null);
        },
        (e: unknown) => setError(errorMessage(e)),
      ),
    [],
  );

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId || activeId === createdBySend.current) return;
    let current = true;
    Promise.all([
      api<ChatMessage[]>(`/api/ai/conversations/${activeId}/messages`),
      api<PendingActionView[]>(`/api/ai/conversations/${activeId}/actions`),
    ]).then(
      ([messages, actions]) => {
        // The person may have switched conversations while this was loading.
        if (!current) return;
        setLines(messages.map((m) => ({ kind: m.role === "user" ? "user" : "assistant", text: m.text })));
        setPending(actions);
      },
      (e: unknown) => current && setError(errorMessage(e)),
    );
    return () => {
      current = false;
    };
  }, [activeId]);

  // Follow the answer while the person is at the bottom; stop following once they scroll up.
  useEffect(() => {
    if (atBottom) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines, pending, atBottom]);

  function startNew() {
    stop();
    setActiveId(null);
    setLines([]);
    setPending([]);
    setError(null);
    setView("chat");
    setTimeout(() => composer.current?.focus(), 0);
  }

  function open(conversation: ConversationSummary) {
    stop();
    setError(null);
    setLines([]);
    setPending([]);
    createdBySend.current = null;
    setActiveId(conversation.id);
    setView("chat");
  }

  function stop() {
    abort.current?.abort();
    abort.current = null;
  }

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setAtBottom(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      let conversationId = activeId;
      if (!conversationId) {
        const created = await api<ConversationSummary>("/api/ai/conversations", { method: "POST", body: {} });
        createdBySend.current = created.id;
        setConversations((list) => [created, ...(list ?? [])]);
        setActiveId(created.id);
        conversationId = created.id;
      }
      setInput("");
      setLines((l) => [...l, { kind: "user", text }]);
      const response = await fetch(`/api/ai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: await mutationHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        if (!response.ok) {
          // Same reaction as every api() call: a lost session goes to the login, a gated one re-reads /api/me.
          const failure = await problem(response);
          if (failure.unauthorized || isGated(failure)) throw failure;
        }
        throw new UserFacingError(
          response.status === 403
            ? "Sem permissão para usar o assistente"
            : response.status === 429
              ? "Aguarde a resposta anterior terminar"
              : "Não foi possível enviar a mensagem",
        );
      }
      await readEvents(response.body, (event, data) => {
        switch (event) {
          case "tool_call":
            setLines((l) => [...l, { kind: "tool", text: `Consultou ${data.tool}` }]);
            break;
          case "tool_failed":
            setLines((l) => [...l, { kind: "tool", text: `Falhou ${data.tool} (${data.reason})` }]);
            break;
          case "action_pending":
            setPending((p) => [
              ...p,
              {
                id: data.actionId,
                conversationId: conversationId!,
                tool: data.tool,
                summary: data.summary,
                arguments: typeof data.arguments === "string" ? data.arguments : "",
                status: "PENDING",
                createdAt: new Date().toISOString(),
                expiresAt: "",
                result: null,
              },
            ]);
            break;
          case "ui_action": {
            const href = data.type === "navigate" ? internalPath(data.path) : null;
            if (href) {
              setLines((l) => [...l, { kind: "link", text: data.label || href, href }]);
              if (preferences.autoNavigate) router.push(href);
            }
            break;
          }
          case "token": {
            const token = typeof data.text === "string" ? data.text : "";
            setLines((l) => {
              const last = l[l.length - 1];
              if (last?.kind === "assistant" && last.streaming) {
                return [...l.slice(0, -1), { kind: "assistant", text: last.text + token, streaming: true }];
              }
              return [...l, { kind: "assistant", text: token, streaming: true }];
            });
            break;
          }
          case "done":
            setLines((l) => {
              const last = l[l.length - 1];
              if (last?.kind === "assistant" && last.streaming) {
                return [...l.slice(0, -1), { kind: "assistant", text: data.text || last.text }];
              }
              return data.text ? [...l, { kind: "assistant", text: data.text }] : l;
            });
            break;
          case "error":
            setError(data.message);
            break;
        }
      });
      void loadConversations();
    } catch (e) {
      if (controller.signal.aborted) {
        setLines((l) => {
          const last = l[l.length - 1];
          const settled = last?.kind === "assistant" && last.streaming ? [...l.slice(0, -1), { ...last, streaming: false }] : l;
          return [...settled, { kind: "note", text: "Resposta interrompida." }];
        });
      } else {
        setError(errorMessage(e));
      }
    } finally {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
    }
  }

  async function resolve(action: PendingActionView, decision: "confirm" | "reject") {
    setError(null);
    try {
      const result = await api<PendingActionView>(`/api/ai/actions/${action.id}/${decision}`, { method: "POST" });
      setPending((p) => p.filter((a) => a.id !== action.id));
      setLines((l) => [
        ...l,
        {
          kind: "note",
          text: decision === "confirm" ? `Ação ${action.tool} confirmada e executada.` : `Ação ${action.tool} recusada.`,
        },
      ]);
      if (result.status === "FAILED") setError("A ação foi confirmada mas falhou ao executar.");
    } catch (e) {
      setPending((p) => p.filter((a) => a.id !== action.id));
      setError(errorMessage(e));
    }
  }

  async function exportConversation(conversation: ConversationSummary) {
    try {
      const messages =
        conversation.id === activeId
          ? lines.flatMap((l) => (l.kind === "user" || l.kind === "assistant" ? [{ role: l.kind, text: l.text }] : []))
          : await api<ChatMessage[]>(`/api/ai/conversations/${conversation.id}/messages`);
      download(`conversa-${conversation.id.slice(0, 8)}.md`, asMarkdown(titleOf(conversation), messages));
    } catch (e) {
      notifyError(e, "Não foi possível exportar");
    }
  }

  async function remove(target: ConversationSummary | "all") {
    const ids = target === "all" ? (conversations ?? []).map((c) => c.id) : [target.id];
    for (const id of ids) await api(`/api/ai/conversations/${id}`, { method: "DELETE" });
    setConversations((list) => (list ?? []).filter((c) => !ids.includes(c.id)));
    updatePreferences({ pinned: preferences.pinned.filter((id) => !ids.includes(id)) });
    if (activeId && ids.includes(activeId)) {
      setActiveId(null);
      setLines([]);
      setPending([]);
    }
    notifySuccess(target === "all" ? "Conversas excluídas" : "Conversa excluída");
  }

  function togglePin(conversation: ConversationSummary) {
    const pinned = preferences.pinned.includes(conversation.id)
      ? preferences.pinned.filter((id) => id !== conversation.id)
      : [conversation.id, ...preferences.pinned];
    updatePreferences({ pinned });
  }

  const lastUserText = [...lines].reverse().find((l) => l.kind === "user")?.text;
  const lastAssistantIndex = lines.map((l) => l.kind).lastIndexOf("assistant");
  const model = MODELS.find((m) => m.id === preferences.model) ?? MODELS[0];

  return (
    <div className="flex h-full min-h-0 flex-col" onKeyDown={(e) => e.key === "Escape" && busy && stop()}>
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <IconButton label={view === "history" ? "Voltar à conversa" : "Histórico"} onClick={() => setView(view === "history" ? "chat" : "history")}>
          <History />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="min-w-0 gap-1 font-medium">
              <span className="truncate">{model.name}</span>
              <ChevronDown data-icon="inline-end" className="opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="flex items-center justify-between">
              Modelo
              <Badge variant="outline">Prévia</Badge>
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={preferences.model} onValueChange={(value) => updatePreferences({ model: value })}>
              {MODELS.map((m) => (
                <DropdownMenuRadioItem key={m.id} value={m.id} className="items-start">
                  <div className="grid">
                    <span>{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.description}</span>
                  </div>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Hoje o modelo em uso é o definido pelos administradores no servidor.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center">
          <IconButton label="Nova conversa" onClick={startNew}>
            <SquarePen />
          </IconButton>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Opções da conversa" disabled={!active}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Opções da conversa</TooltipContent>
            </Tooltip>
            {active && (
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">{titleOf(active)}</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => togglePin(active)}>
                    {preferences.pinned.includes(active.id) ? <PinOff /> : <Pin />}
                    {preferences.pinned.includes(active.id) ? "Desafixar" : "Fixar"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setRenaming(active)}>
                    <Pencil />
                    Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportConversation(active)}>
                    <Download />
                    Exportar (Markdown)
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(active)}>
                  <Trash2 />
                  Excluir conversa
                </DropdownMenuItem>
              </DropdownMenuContent>
            )}
          </DropdownMenu>
          <IconButton label="Configurações" onClick={() => setSettingsOpen(true)}>
            <Settings />
          </IconButton>
          <IconButton label={agent.wide ? "Reduzir" : "Ampliar"} onClick={agent.toggleWide} className="hidden md:inline-flex">
            {agent.wide ? <Minimize2 /> : <Maximize2 />}
          </IconButton>
          <IconButton label="Fechar (⌘I)" onClick={() => agent.setOpen(false)}>
            <X />
          </IconButton>
        </div>
      </header>

      {view === "history" ? (
        <AgentHistory
          conversations={conversations}
          activeId={activeId}
          pinned={preferences.pinned}
          titleOf={titleOf}
          actions={{
            onOpen: open,
            onNew: startNew,
            onRename: setRenaming,
            onTogglePin: togglePin,
            onExport: (c) => void exportConversation(c),
            onDelete: setDeleting,
          }}
        />
      ) : (
        <>
          <div className="relative min-h-0 flex-1">
            <div
              ref={scroller}
              className={cn("h-full overflow-y-auto", TEXT_SIZE[preferences.textSize])}
              onScroll={(e) => {
                const el = e.currentTarget;
                setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
              }}
            >
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
                {lines.length === 0 && !busy && <Welcome onPick={(text) => void send(text)} hasPermission={hasPermission} />}
                {lines.map((line, index) => (
                  <MessageLine
                    key={index}
                    line={line}
                    showTools={preferences.showTools}
                    isLastAnswer={index === lastAssistantIndex && !busy}
                    onEdit={(text) => {
                      setInput(text);
                      composer.current?.focus();
                    }}
                    onRetry={lastUserText ? () => void send(lastUserText) : undefined}
                  />
                ))}
                {pending.map((action) => (
                  <Alert key={action.id} variant="destructive">
                    <TriangleAlert />
                    <AlertTitle className="flex items-center gap-2">
                      Confirme antes de executar
                      <span className="font-mono text-xs font-normal text-muted-foreground">{action.tool}</span>
                    </AlertTitle>
                    <AlertDescription>
                      <p>{action.summary}</p>
                      <ActionArguments json={action.arguments} />
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="destructive" onClick={() => void resolve(action, "confirm")}>
                          Confirmar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void resolve(action, "reject")}>
                          Recusar
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
                {busy && lines[lines.length - 1]?.kind !== "assistant" && (
                  <p className="flex items-center gap-2 text-muted-foreground" role="status">
                    <Spinner className="size-3.5" />
                    Pensando…
                  </p>
                )}
                {error && (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertTitle>Erro na resposta</AlertTitle>
                    <AlertDescription>
                      <p>{error}</p>
                      {lastUserText && (
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => void send(lastUserText)}>
                          <RotateCw data-icon="inline-start" />
                          Tentar de novo
                        </Button>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
            {!atBottom && (
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Ir para o fim"
                className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
                onClick={() => setAtBottom(true)}
              >
                <ArrowDown />
              </Button>
            )}
          </div>
          <Composer
            ref={composer}
            value={input}
            onChange={setInput}
            busy={busy}
            enterToSend={preferences.enterToSend}
            onSend={() => void send()}
            onStop={stop}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </>
      )}

      <AgentSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        conversationCount={conversations?.length ?? 0}
        onDeleteAll={() => {
          setSettingsOpen(false);
          setDeleting("all");
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(openState) => !openState && setDeleting(null)}
        destructive
        title={deleting === "all" ? "Excluir todas as conversas?" : "Excluir esta conversa?"}
        description={
          deleting === "all"
            ? "Todas as suas conversas com o assistente são apagadas de forma definitiva. A auditoria das ferramentas usadas continua."
            : "A conversa é apagada de forma definitiva. A auditoria das ferramentas usadas continua."
        }
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (deleting) await remove(deleting);
        }}
      />
      <RenameDialog
        conversation={renaming}
        currentTitle={renaming ? titleOf(renaming) : ""}
        onClose={() => setRenaming(null)}
        onSave={(title) => {
          if (renaming) setNames((n) => ({ ...n, [renaming.id]: title }));
          setRenaming(null);
        }}
      />
    </div>
  );
}

function Welcome({ onPick, hasPermission }: { onPick: (text: string) => void; hasPermission: (p: string) => boolean }) {
  const prompts = [
    hasPermission("tasks.task.read") && ["Tarefas atrasadas", "Quais tarefas estão atrasadas e com quem?"],
    hasPermission("iam.user.read") && ["Contas em risco", "Quem está com o acesso bloqueado ou sem duas etapas?"],
    hasPermission("audit.event.read") && ["Resumo do dia", "O que aconteceu hoje na auditoria?"],
    ["Minhas permissões", "Quais são as minhas permissões e o que consigo fazer com elas?"],
  ].filter((prompt): prompt is string[] => Boolean(prompt));
  return (
    <Empty className="border-0 px-2 py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Sparkles />
        </EmptyMedia>
        <EmptyTitle>Como posso ajudar?</EmptyTitle>
        <EmptyDescription>
          Pergunte sobre os dados do portal ou peça uma ação. Tudo roda com as suas permissões e fica na auditoria.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="grid max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {prompts.map(([title, prompt]) => (
          <Button
            key={title}
            variant="outline"
            className="h-auto flex-col items-start gap-0.5 rounded-2xl px-3 py-2.5 text-left whitespace-normal"
            onClick={() => onPick(prompt)}
          >
            <span className="font-medium">{title}</span>
            <span className="text-xs font-normal text-muted-foreground">{prompt}</span>
          </Button>
        ))}
      </EmptyContent>
    </Empty>
  );
}

/** The call exactly as the assistant made it, so the person confirms the values and not only the summary. */
function ActionArguments({ json }: { json: string }) {
  let entries: [string, unknown][] = [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) entries = Object.entries(parsed);
  } catch {
    if (json.trim()) return <p className="mt-2 font-mono text-xs break-all text-foreground">{json}</p>;
  }
  entries = entries.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (entries.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-mono text-muted-foreground">{key}</dt>
          <dd className="break-all whitespace-pre-wrap text-foreground">
            {typeof value === "string" ? value : JSON.stringify(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={copied ? "Copiado" : "Copiar"}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          (e: unknown) => notifyError(e, "Não foi possível copiar"),
        )
      }
    >
      {copied ? <Check /> : <Copy />}
    </IconButton>
  );
}

function MessageLine({
  line,
  showTools,
  isLastAnswer,
  onEdit,
  onRetry,
}: {
  line: Line;
  showTools: boolean;
  isLastAnswer: boolean;
  onEdit: (text: string) => void;
  onRetry?: () => void;
}) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  switch (line.kind) {
    case "user":
      return (
        <div className="group/msg flex flex-col items-end gap-1">
          <div className="max-w-[85%] rounded-3xl bg-muted px-4 py-2.5 whitespace-pre-wrap">{line.text}</div>
          <div className="flex opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100">
            <CopyButton text={line.text} />
            <IconButton label="Editar e reenviar" onClick={() => onEdit(line.text)}>
              <Pencil />
            </IconButton>
          </div>
        </div>
      );
    case "assistant":
      return (
        <div className="group/msg flex gap-3">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn(line.streaming && "after:ml-0.5 after:animate-pulse after:content-['▍']")}>
              <Markdown text={line.text} />
            </div>
            {!line.streaming && (
              <div
                className={cn(
                  "-ml-2 mt-1 flex transition-opacity",
                  isLastAnswer ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100",
                )}
              >
                <CopyButton text={line.text} />
                <IconButton
                  label="Ler em voz alta"
                  onClick={() => {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(line.text);
                    utterance.lang = "pt-BR";
                    window.speechSynthesis.speak(utterance);
                  }}
                >
                  <Volume2 />
                </IconButton>
                <IconButton
                  label="Boa resposta"
                  className={cn(feedback === "up" && "text-primary")}
                  onClick={() => {
                    setFeedback("up");
                    notifySuccess("Obrigado pelo retorno", "Prévia: a avaliação ainda não é enviada.");
                  }}
                >
                  <ThumbsUp />
                </IconButton>
                <IconButton
                  label="Resposta ruim"
                  className={cn(feedback === "down" && "text-destructive")}
                  onClick={() => {
                    setFeedback("down");
                    notifySuccess("Obrigado pelo retorno", "Prévia: a avaliação ainda não é enviada.");
                  }}
                >
                  <ThumbsDown />
                </IconButton>
                {isLastAnswer && onRetry && (
                  <IconButton label="Perguntar de novo" onClick={onRetry}>
                    <RotateCw />
                  </IconButton>
                )}
              </div>
            )}
          </div>
        </div>
      );
    case "tool":
      if (!showTools) return null;
      return (
        <div className="ml-10 flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <Wrench className="size-3" />
          {line.text}
        </div>
      );
    case "note":
      return <p className="text-center text-xs text-muted-foreground italic">{line.text}</p>;
    case "link":
      return (
        <Button variant="outline" size="sm" className="ml-10 w-fit" asChild>
          <Link href={line.href}>Abrir: {line.text}</Link>
        </Button>
      );
  }
}

function Composer({
  ref,
  value,
  onChange,
  busy,
  enterToSend,
  onSend,
  onStop,
  onOpenSettings,
}: {
  ref: React.Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  enterToSend: boolean;
  onSend: () => void;
  onStop: () => void;
  onOpenSettings: () => void;
}) {
  const empty = !value.trim();
  return (
    <form
      className="shrink-0 px-3 pt-2 pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSend();
      }}
    >
      <div className="mx-auto max-w-3xl rounded-3xl bg-muted/60 ring-1 ring-border transition-shadow focus-within:ring-ring/60">
        <Textarea
          ref={ref}
          value={value}
          maxLength={MAX_LENGTH}
          rows={1}
          placeholder="Pergunte ao assistente"
          aria-label="Mensagem para o assistente"
          className="max-h-48 min-h-12 border-0 bg-transparent px-4 pt-3.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            const submit = enterToSend ? !e.shiftKey : e.metaKey || e.ctrlKey;
            if (e.key === "Enter" && submit && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy && !empty) onSend();
            }
          }}
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" aria-label="Adicionar">
                    <Plus />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Adicionar</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" side="top" className="w-60">
              <DropdownMenuItem disabled>
                <Paperclip />
                Anexar arquivo
                <Badge variant="outline" className="ml-auto">
                  Em breve
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenSettings}>
                <Wrench />
                Ver ferramentas disponíveis
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-1">
            {value.length > MAX_LENGTH - 500 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {value.length}/{MAX_LENGTH}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Browser dictation would send the audio to a third party; kept off for confidential data. */}
                <span>
                  <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" aria-label="Ditado" disabled>
                    <Mic />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Ditado: em breve</TooltipContent>
            </Tooltip>
            {busy ? (
              <Button type="button" size="icon-sm" className="rounded-full" aria-label="Parar (Esc)" onClick={onStop}>
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" className="rounded-full" aria-label="Enviar" disabled={empty}>
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        O assistente pode errar. Confira informações importantes antes de agir.
      </p>
    </form>
  );
}

function RenameDialog({
  conversation,
  currentTitle,
  onClose,
  onSave,
}: {
  conversation: ConversationSummary | null;
  currentTitle: string;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  return (
    <Dialog open={conversation !== null} onOpenChange={(openState) => !openState && onClose()}>
      <DialogContent className="sm:max-w-md">
        {conversation && <RenameForm key={conversation.id} currentTitle={currentTitle} onClose={onClose} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ currentTitle, onClose, onSave }: { currentTitle: string; onClose: () => void; onSave: (title: string) => void }) {
  const [title, setTitle] = useState(currentTitle);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onSave(title.trim());
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>Renomear conversa</DialogTitle>
        <DialogDescription>Prévia: o novo nome vale só nesta aba por enquanto.</DialogDescription>
      </DialogHeader>
      <Input aria-label="Nome da conversa" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!title.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

