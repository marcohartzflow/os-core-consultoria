"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * How the assistant panel behaves for this person, kept in this browser only (a convenience, not
 * a setting of the account). Fields marked "preview" are shown in the settings but not sent to
 * the server yet; the model and its instructions are defined by the administrators.
 */
export interface AgentPreferences {
  enterToSend: boolean;
  showTools: boolean;
  autoNavigate: boolean;
  textSize: "sm" | "md" | "lg";
  /** preview */
  model: string;
  /** preview */
  tone: "equilibrado" | "conciso" | "detalhado" | "formal";
  /** preview */
  instructions: string;
  /** preview */
  memory: boolean;
  /** Conversation ids pinned to the top of the history. Ids only: titles may hold confidential text. */
  pinned: string[];
}

export const DEFAULT_PREFERENCES: AgentPreferences = {
  enterToSend: true,
  showTools: true,
  autoNavigate: true,
  textSize: "md",
  model: "claude-opus-5",
  tone: "equilibrado",
  instructions: "",
  memory: false,
  pinned: [],
};

const KEY = "os.agent.preferences";
const listeners = new Set<() => void>();
let cache: AgentPreferences | null = null;

function read(): AgentPreferences {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = { ...DEFAULT_PREFERENCES, ...(raw ? (JSON.parse(raw) as Partial<AgentPreferences>) : {}) };
  } catch {
    cache = DEFAULT_PREFERENCES;
  }
  return cache;
}

function write(next: AgentPreferences) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: the change lasts until the page reloads.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAgentPreferences(): [AgentPreferences, (patch: Partial<AgentPreferences>) => void] {
  const preferences = useSyncExternalStore(subscribe, read, () => DEFAULT_PREFERENCES);
  const update = useCallback((patch: Partial<AgentPreferences>) => write({ ...read(), ...patch }), []);
  return [preferences, update];
}

/** Models listed in the picker (preview: the server uses the model its configuration names). */
export const MODELS = [
  { id: "claude-opus-5", name: "Claude Opus 5", description: "Mais capaz, para tarefas complexas" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", description: "Equilíbrio entre qualidade e velocidade" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", description: "Respostas rápidas do dia a dia" },
];
