"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AGENT_NAME } from "@/core/brand";
import { api, errorMessage, isGated, mutationHeaders, problem, UserFacingError } from "@/core/api/client";
import type { ChatMessage, ConversationSummary, ModelView, PendingActionView, ToolSetting } from "@/core/api/types";
import { announceDataChanged } from "@/core/api/useLoad";
import { dismissToast, notifyError, notifyLoading, notifySuccess } from "@/core/ui/feedback";
import { useAgentPreferences } from "./preferences";
import { readEvents, type TurnEvent } from "./stream";
import {
  applyTurnEvent,
  cutShort,
  fromHistory,
  isOpenAction,
  type AssistantTurn,
  type ConfirmScope,
  type Turn,
} from "./turns";

const newId = () => crypto.randomUUID();

/** The conversation open in this tab, so a reload goes back to it. */
const ACTIVE_KEY = "os.agent.active";

function storedActive(): string | null {
  try {
    return window.sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function storeActive(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(ACTIVE_KEY, id);
    else window.sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Blocked storage: the conversation is kept only while the page stays open.
  }
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Some browsers start the download after click() returns: revoke on the next task.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function asMarkdown(title: string, messages: { role: string; text: string }[]) {
  return [
    `# ${title}`,
    "",
    ...messages.flatMap((m) => [`**${m.role === "user" ? "Você" : AGENT_NAME}:**`, "", m.text, ""]),
  ].join("\n");
}

/** Why a turn could not start, from the response the API gave before any frame. */
function refusal(status: number) {
  switch (status) {
    case 403:
      return "Sem permissão para usar o assistente";
    case 404:
      return "Conversa não encontrada";
    case 409:
      return "Aguarde a resposta desta conversa terminar";
    case 429:
      return "Aguarde a resposta anterior terminar";
    case 400:
      return "Modelo indisponível. Escolha outro";
    default:
      return "Não foi possível enviar a mensagem";
  }
}

/**
 * The assistant's state, shared by the chat page and the side panel through a context (AI SDK
 * cookbook, "Use shared chat context"): the same conversation and the same turn in progress whichever
 * view shows it, and a turn keeps streaming while the person moves between pages. Nothing loads until
 * a view asks for it (`activate`). `navigate` says whether a screen the agent points to opens by itself
 * (the panel) or only shows as a link (the chat page, which navigating would close).
 *
 * What async work reads after an `await` (the open conversation, whether a turn runs, the turns)
 * comes from refs kept in step with the state, never from the render that started the work.
 */
function useAgentChatState({ navigate }: { navigate: boolean }) {
  const router = useRouter();
  const [preferences, updatePreferences] = useAgentPreferences();
  const [enabled, setEnabled] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [models, setModels] = useState<ModelView[] | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [turns, setTurnsState] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusyState] = useState(false);
  // A conversation picked from the list is loading: the thread shows placeholders, not the welcome.
  const [opening, setOpening] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  // The person's choice for each tool (settings › Permissões), also read by the approval cards.
  const [toolSettings, setToolSettings] = useState<ToolSetting[] | null>(null);
  const [toolSettingsError, setToolSettingsError] = useState<unknown>(null);

  const activeRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  const navigateRef = useRef(navigate);
  const autoNavigateRef = useRef(preferences.autoNavigate);
  const abort = useRef<AbortController | null>(null);
  // A conversation created by a turn has no history yet; loading it would wipe the message being sent.
  const createdByTurn = useRef<string | null>(null);
  // The conversation open in this tab before a reload, reopened once when the list arrives.
  const restore = useRef<string | null | undefined>(undefined);
  if (restore.current === undefined) restore.current = storedActive();

  useEffect(() => {
    navigateRef.current = navigate;
    autoNavigateRef.current = preferences.autoNavigate;
  }, [navigate, preferences.autoNavigate]);

  const setActiveId = useCallback((id: string | null) => {
    activeRef.current = id;
    setActiveIdState(id);
  }, []);

  const setBusy = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusyState(value);
  }, []);

  const setTurns = useCallback((change: (list: Turn[]) => Turn[]) => {
    setTurnsState((list) => {
      const next = change(list);
      turnsRef.current = next;
      return next;
    });
  }, []);

  const loadConversations = useCallback(
    () =>
      api<ConversationSummary[]>("/api/ai/conversations").then(
        (list) => {
          setConversations(list);
          // First load in this tab: reopen the conversation that was open, if it still exists and the
          // person has not moved on meanwhile. Only once: after that, "Nova conversa" stays new.
          const stored = restore.current;
          restore.current = null;
          if (stored && activeRef.current === null && !busyRef.current && list.some((c) => c.id === stored)) {
            setOpening(true);
            setActiveId(stored);
          }
        },
        (e: unknown) => setLoadError(e),
      ),
    [setActiveId],
  );

  const loadModels = useCallback(
    () => api<ModelView[]>("/api/ai/models").then(setModels, (e: unknown) => setLoadError(e)),
    [],
  );

  const loadToolSettings = useCallback(
    () =>
      api<ToolSetting[]>("/api/ai/tool-preferences").then(
        (list) => {
          setToolSettings(list);
          setToolSettingsError(null);
        },
        (e: unknown) => setToolSettingsError(e),
      ),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    void loadConversations();
    void loadModels();
    void loadToolSettings();
  }, [enabled, loadConversations, loadModels, loadToolSettings]);

  // Once the first list arrived (or the person moved on), the open conversation is what to restore.
  useEffect(() => {
    if (conversations) storeActive(activeId);
  }, [activeId, conversations]);

  useEffect(() => {
    if (!activeId || activeId === createdByTurn.current) return;
    let current = true;
    api<ChatMessage[]>(`/api/ai/conversations/${activeId}/messages`).then(
      (messages) => {
        // The person may have switched conversations while this was loading.
        if (!current) return;
        setTurns(() => messages.map((m, index) => fromHistory(activeId, m, index)));
        setOpening(false);
      },
      (e: unknown) => {
        if (!current) return;
        setOpening(false);
        notifyError(e, "Não foi possível abrir a conversa");
      },
    );
    return () => {
      current = false;
    };
  }, [activeId, setTurns]);

  const model = models?.find((m) => m.id === preferences.model) ?? models?.find((m) => m.isDefault) ?? null;

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
  }, []);

  function startNew(text = "") {
    stop();
    restore.current = null;
    setOpening(false);
    createdByTurn.current = null;
    setActiveId(null);
    setTurns(() => []);
    setDraft(text);
  }

  function open(id: string) {
    if (id === activeRef.current) return;
    stop();
    restore.current = null;
    setTurns(() => []);
    createdByTurn.current = null;
    setOpening(true);
    setActiveId(id);
  }

  function patchTurn(id: string, change: (turn: AssistantTurn) => AssistantTurn) {
    setTurns((list) => list.map((t) => (t.id === id && t.role === "assistant" ? change(t) : t)));
  }

  /**
   * One agent turn: a message from the person, or the continuation after they decided on the actions
   * of the last answer (no message of theirs). The answer streams into a new assistant turn. Frames
   * are applied once per animation frame (as the AI SDK's `experimental_throttle` does), so a long
   * answer does not re-render the thread for every token.
   */
  async function runTurn(request: { text: string; modelId?: string } | { continue: true }) {
    // Synchronous guard: two submits before the next render must not start two turns.
    if (busyRef.current) return;
    setBusy(true);
    restore.current = null;
    const chosen = ("modelId" in request && request.modelId) || model?.id;
    const controller = new AbortController();
    abort.current = controller;
    const replyId = newId();
    const reply: AssistantTurn = { id: replyId, role: "assistant", text: "", steps: [], links: [], streaming: true };
    if ("text" in request) {
      setDraft("");
      setTurns((list) => [...list, { id: newId(), role: "user", text: request.text }, reply]);
    } else {
      setTurns((list) => [...list, reply]);
    }

    let queued: TurnEvent[] = [];
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      if (queued.length === 0) return;
      const events = queued;
      queued = [];
      const now = performance.now();
      patchTurn(replyId, (turn) => events.reduce((t, event) => applyTurnEvent(t, event, now), turn));
    };
    let ended = false;

    try {
      let conversationId = activeRef.current;
      if (!conversationId) {
        const created = await api<ConversationSummary>("/api/ai/conversations", {
          method: "POST",
          body: {},
          signal: controller.signal,
        });
        // "Nova conversa" or another conversation picked while this was being created: leave them be.
        if (controller.signal.aborted) return;
        createdByTurn.current = created.id;
        setConversations((list) => [created, ...(list ?? [])]);
        setActiveId(created.id);
        conversationId = created.id;
      }
      const response = await fetch(
        `/api/ai/conversations/${conversationId}/${"text" in request ? "messages" : "continue"}`,
        {
          method: "POST",
          headers: await mutationHeaders(),
          credentials: "same-origin",
          body: JSON.stringify("text" in request ? { text: request.text, model: chosen } : { model: chosen }),
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body) {
        if (!response.ok) {
          // Same reaction as every api() call: a lost session goes to the login, a gated one re-reads /api/me.
          const failure = await problem(response);
          if (failure.unauthorized || isGated(failure)) throw failure;
        }
        throw new UserFacingError(refusal(response.status));
      }
      await readEvents(response.body, (event) => {
        if (event.event === "done" || event.event === "error") ended = true;
        if (event.event === "ui_action" && navigateRef.current && autoNavigateRef.current) {
          const target = event.type === "navigate" ? event.path : null;
          if (target) router.push(target);
        }
        if (event.event === "action_auto") announceDataChanged();
        queued.push(event);
        frame ??= requestAnimationFrame(flush);
      });
      if (frame !== null) cancelAnimationFrame(frame);
      flush();
      if (!ended) patchTurn(replyId, (turn) => cutShort(turn));
      void loadConversations();
    } catch (e) {
      if (frame !== null) cancelAnimationFrame(frame);
      flush();
      patchTurn(replyId, (turn) => (controller.signal.aborted ? cutShort(turn) : cutShort(turn, errorMessage(e))));
    } finally {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
    }
  }

  /**
   * Asks the question of the last answer again, optionally with another model. The server keeps both
   * attempts in the conversation's memory; here the old answer gives way to the new.
   */
  function retry(turnId: string, modelId?: string) {
    const list = turnsRef.current;
    if (list.findLast((t) => t.role === "assistant")?.id !== turnId || busyRef.current) return;
    const at = list.findIndex((t) => t.id === turnId);
    const question = list.slice(0, at).findLast((t) => t.role === "user");
    if (!question) return;
    if (modelId) updatePreferences({ model: modelId });
    setTurns((current) => current.filter((t) => t.id !== turnId && t.id !== question.id));
    void runTurn({ text: question.text, modelId });
  }

  /**
   * The person's decision on one or more actions of the same answer (a single card or "Permitir
   * tudo"). Each is sent in turn and the cards keep their outcome. Once nothing of that answer waits
   * any more, the assistant continues by itself, once, unless the person moved to another
   * conversation or a turn is already running.
   */
  async function resolve(
    turnId: string,
    targets: PendingActionView[],
    decision: "confirm" | "reject",
    scope: ConfirmScope = "ONCE",
  ) {
    const conversationAtStart = activeRef.current;
    const results = new Map<string, PendingActionView>();
    let failure: unknown = null;
    for (const action of targets) {
      try {
        const result = await api<PendingActionView>(`/api/ai/actions/${action.id}/${decision}`, {
          method: "POST",
          body: decision === "confirm" ? { scope } : undefined,
        });
        results.set(action.id, result);
      } catch (e) {
        failure = e;
        break;
      }
    }
    patchTurn(turnId, (turn) => ({
      ...turn,
      steps: turn.steps.map((s) =>
        s.kind === "pending" && results.has(s.action.id) ? { ...s, action: results.get(s.action.id)! } : s,
      ),
    }));
    if (failure) notifyError(failure, "Não foi possível concluir");
    const failed = [...results.values()].filter((r) => r.status === "FAILED").length;
    if (failed > 0) {
      notifyError(
        new UserFacingError(failed === 1 ? "Você permitiu, mas a ação deu erro." : `Você permitiu, mas ${failed} ações deram erro.`),
      );
    }
    if (decision === "confirm" && results.size > failed) announceDataChanged();
    if (decision === "confirm" && results.size > 0 && scope === "ALWAYS") {
      notifySuccess("Pronto, não pergunto mais", "Vale por 30 dias. Para mudar: Configurações do assistente › Permissões.");
      void loadToolSettings();
    } else if (decision === "confirm" && results.size > 0 && scope === "CONVERSATION") {
      notifySuccess("Pronto, não pergunto mais nesta conversa");
    }
    if (results.size === 0 || activeRef.current !== conversationAtStart || busyRef.current) return;
    const latest = turnsRef.current;
    const turn = latest.find((t) => t.id === turnId);
    const othersOpen =
      turn?.role === "assistant" &&
      turn.steps.some((s) => s.kind === "pending" && !results.has(s.action.id) && isOpenAction(s.action));
    const isLatestAnswer = latest.findLast((t) => t.role === "assistant")?.id === turnId;
    if (!othersOpen && isLatestAnswer) void runTurn({ continue: true });
  }

  /** The person's choice for a tool, from the settings or from "Perguntar de novo" on an action that ran alone. */
  async function chooseTool(name: string, choice: ToolSetting["choice"]) {
    try {
      const saved = await api<ToolSetting>(`/api/ai/tool-preferences/${encodeURIComponent(name)}`, {
        method: "PUT",
        body: { choice },
      });
      setToolSettings((list) => (list ?? []).map((t) => (t.name === saved.name ? saved : t)));
    } catch (e) {
      notifyError(e, "Não foi possível salvar a escolha");
      throw e;
    }
  }

  async function resetTools() {
    try {
      await api("/api/ai/tool-preferences", { method: "DELETE" });
      notifySuccess("Tudo no padrão", "Consultas são feitas direto e ações perguntam antes.");
      await loadToolSettings();
    } catch (e) {
      notifyError(e, "Não foi possível voltar ao padrão");
    }
  }

  async function rename(conversation: ConversationSummary, title: string) {
    try {
      const saved = await api<ConversationSummary>(`/api/ai/conversations/${conversation.id}`, {
        method: "PATCH",
        body: { title },
      });
      setConversations((list) => (list ?? []).map((c) => (c.id === saved.id ? saved : c)));
    } catch (e) {
      notifyError(e, "Não foi possível renomear");
    }
  }

  function togglePin(conversation: ConversationSummary) {
    updatePreferences((current) => ({
      pinned: current.pinned.includes(conversation.id)
        ? current.pinned.filter((id) => id !== conversation.id)
        : [conversation.id, ...current.pinned],
    }));
  }

  async function exportConversation(conversation: ConversationSummary) {
    const isOpen = conversation.id === activeRef.current;
    const toast = isOpen ? null : notifyLoading("Preparando a exportação…");
    try {
      const messages = isOpen
        ? turnsRef.current.map((t) => ({ role: t.role, text: t.text }))
        : await api<ChatMessage[]>(`/api/ai/conversations/${conversation.id}/messages`);
      download(`conversa-${conversation.id.slice(0, 8)}.md`, asMarkdown(conversation.title || "Nova conversa", messages));
    } catch (e) {
      notifyError(e, "Não foi possível exportar");
    } finally {
      if (toast !== null) dismissToast(toast);
    }
  }

  async function remove(target: ConversationSummary | "all") {
    const ids = target === "all" ? (conversations ?? []).map((c) => c.id) : [target.id];
    const deleted: string[] = [];
    try {
      for (const id of ids) {
        await api(`/api/ai/conversations/${id}`, { method: "DELETE" });
        deleted.push(id);
      }
      notifySuccess(target === "all" ? "Conversas excluídas" : "Conversa excluída");
    } finally {
      // What the server deleted leaves the list even when a later deletion fails (the dialog shows that error).
      setConversations((list) => (list ?? []).filter((c) => !deleted.includes(c.id)));
      updatePreferences((current) => ({ pinned: current.pinned.filter((id) => !deleted.includes(id)) }));
      if (activeRef.current && deleted.includes(activeRef.current)) startNew();
    }
  }

  return {
    /** Called by each view when it mounts: the first one loads conversations, models and tool settings. */
    activate: useCallback(() => setEnabled(true), []),
    conversations,
    active: conversations?.find((c) => c.id === activeId) ?? null,
    activeId,
    models,
    model,
    setModel: (id: string) => updatePreferences({ model: id }),
    turns,
    draft,
    setDraft,
    busy,
    opening,
    loadError,
    retryLoad: () => {
      setLoadError(null);
      void loadConversations();
      void loadModels();
    },
    toolSettings,
    toolSettingsError,
    retryToolSettings: () => {
      setToolSettingsError(null);
      setToolSettings(null);
      void loadToolSettings();
    },
    chooseTool,
    resetTools,
    pinned: preferences.pinned,
    startNew,
    open,
    send: (text?: string) => {
      const value = (text ?? draft).trim();
      if (value) void runTurn({ text: value });
    },
    stop,
    retry,
    resolve,
    rename,
    togglePin,
    exportConversation,
    remove,
  };
}

export type AgentChat = ReturnType<typeof useAgentChatState>;

const AgentChatContext = createContext<AgentChat | null>(null);

export function AgentChatProvider({ navigate, children }: { navigate: boolean; children: React.ReactNode }) {
  const chat = useAgentChatState({ navigate });
  return <AgentChatContext.Provider value={chat}>{children}</AgentChatContext.Provider>;
}

/** The shared assistant state; the view calling it starts the first load. */
export function useAgentChat(): AgentChat {
  const chat = useContext(AgentChatContext);
  if (!chat) throw new Error("useAgentChat must be used inside AgentChatProvider");
  const { activate } = chat;
  useEffect(() => activate(), [activate]);
  return chat;
}
