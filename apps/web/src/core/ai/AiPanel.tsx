"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, Plus, Send, Wrench } from "lucide-react";
import { api, errorMessage, mutationHeaders } from "@/core/api/client";
import type { ChatMessage, ConversationSummary, PendingActionView } from "@/core/api/types";
import { RequirePermission } from "@/core/auth/AuthProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Item, ItemContent } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type Line =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming?: boolean }
  | { kind: "tool"; text: string }
  | { kind: "note"; text: string }
  | { kind: "link"; text: string; href: string };

/** Slide-over chat with the portal agent. Rendered only for people holding `ai.chat.use`. */
export function AiPanelTrigger() {
  return (
    <RequirePermission permission="ai.chat.use">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <Bot />
            Assistente
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <AiPanel />
        </SheetContent>
      </Sheet>
    </RequirePermission>
  );
}

/** Only internal paths, exactly as the API validates them (UiAction.Navigate); never a full URL. */
function internalPath(path: unknown): string | null {
  return typeof path === "string" && /^\/[A-Za-z0-9._~/-]{0,2047}$/.test(path) && !path.startsWith("//")
    ? path
    : null;
}

/** Radix Select reserves the empty string, so the "no conversation yet" choice needs its own value. */
const NEW_CONVERSATION = "new";

function AiPanel() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [pending, setPending] = useState<PendingActionView[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    if (!activeId) return;
    Promise.all([
      api<ChatMessage[]>(`/api/ai/conversations/${activeId}/messages`),
      api<PendingActionView[]>(`/api/ai/conversations/${activeId}/actions`),
    ]).then(
      ([messages, actions]) => {
        setLines(messages.map((m) => ({ kind: m.role === "user" ? "user" : "assistant", text: m.text })));
        setPending(actions);
      },
      (e: unknown) => setError(errorMessage(e)),
    );
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines, pending]);

  async function newConversation() {
    setError(null);
    try {
      const created = await api<ConversationSummary>("/api/ai/conversations", { method: "POST", body: {} });
      setConversations((list) => [created, ...list]);
      setLines([]);
      setPending([]);
      setActiveId(created.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      let conversationId = activeId;
      if (!conversationId) {
        const created = await api<ConversationSummary>("/api/ai/conversations", { method: "POST", body: {} });
        setConversations((list) => [created, ...list]);
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
      });
      if (!response.ok || !response.body) {
        throw new Error(
          response.status === 403
            ? "Sem permissão para usar o assistente"
            : response.status === 429
              ? "Aguarde a resposta anterior terminar"
              : "Falha ao enviar",
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
                arguments: "",
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
              router.push(href);
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
      setError(errorMessage(e));
    } finally {
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
          text:
            decision === "confirm"
              ? `Ação ${action.tool} confirmada e executada.`
              : `Ação ${action.tool} recusada.`,
        },
      ]);
      if (result.status === "FAILED") setError("A ação foi confirmada mas falhou ao executar.");
    } catch (e) {
      setPending((p) => p.filter((a) => a.id !== action.id));
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="flex items-center gap-2">
          <Bot className="size-4" /> Assistente
        </SheetTitle>
        <SheetDescription>Opera o portal com as suas permissões. Ações sensíveis pedem confirmação.</SheetDescription>
        <div className="flex items-center gap-2 pt-1">
          <Select
            value={activeId ?? NEW_CONVERSATION}
            onValueChange={(value) => {
              setLines([]);
              setPending([]);
              setActiveId(value === NEW_CONVERSATION ? null : value);
            }}
          >
            <SelectTrigger className="flex-1" size="sm" aria-label="Conversa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW_CONVERSATION}>Nova conversa</SelectItem>
              {conversations.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title || "Sem título"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon-sm" aria-label="Nova conversa" onClick={() => void newConversation()}>
            <Plus />
          </Button>
        </div>
      </SheetHeader>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-3 py-4">
          {lines.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Pergunte algo ou peça uma ação. Exemplo: “quem está com acesso bloqueado?”
            </p>
          )}
          {lines.map((line, index) => (
            <LineView key={index} line={line} />
          ))}
          {pending.map((action) => (
            <Alert key={action.id} variant="destructive">
              <AlertTitle className="flex items-center gap-2">
                Confirmação
                <span className="font-mono text-xs font-normal text-muted-foreground">{action.tool}</span>
              </AlertTitle>
              <AlertDescription>
                <p>{action.summary}</p>
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
          {busy && <p className="text-xs text-muted-foreground">Pensando…</p>}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Escreva para o assistente"
          maxLength={4000}
          rows={2}
          className="min-h-10 resize-none"
          disabled={busy}
        />
        <Button type="submit" size="icon" aria-label="Enviar" disabled={busy || !input.trim()}>
          <Send />
        </Button>
      </form>
    </>
  );
}

function LineView({ line }: { line: Line }) {
  switch (line.kind) {
    case "user":
      return (
        <Item variant="outline" size="sm" className="ml-8 w-auto">
          <ItemContent className="whitespace-pre-wrap">{line.text}</ItemContent>
        </Item>
      );
    case "assistant":
      return (
        <Item variant="muted" size="sm" className="mr-8 w-auto">
          <ItemContent className="whitespace-pre-wrap">{line.text}</ItemContent>
        </Item>
      );
    case "tool":
      return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Wrench className="size-3" /> {line.text}
        </div>
      );
    case "note":
      return <div className="text-xs text-muted-foreground italic">{line.text}</div>;
    case "link":
      return (
        <Link href={line.href} className="text-xs underline underline-offset-2">
          {line.text}
        </Link>
      );
  }
}

/** Minimal SSE reader for a fetch() body: `event:` + `data:` blocks separated by blank lines. */
async function readEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: Record<string, string>) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const raw of block.split("\n")) {
        if (raw.startsWith("event:")) event = raw.slice(6).trim();
        else if (raw.startsWith("data:")) dataLines.push(raw.slice(5).trim());
      }
      if (dataLines.length) {
        try {
          onEvent(event, JSON.parse(dataLines.join("\n")) as Record<string, string>);
        } catch {
          // ignore malformed frame
        }
      }
      separator = buffer.indexOf("\n\n");
    }
  }
}
