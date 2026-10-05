"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * How the assistant panel behaves for this person, kept in this browser only (a convenience, not
 * a setting of the account). Fields marked "preview" are shown in the settings but not sent to
 * the server yet.
 */
export interface AgentPreferences {
  enterToSend: boolean;
  showTools: boolean;
  autoNavigate: boolean;
  textSize: "sm" | "md" | "lg";
  /** Id of the model picked; empty or no longer offered means the server's default. */
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
  model: "",
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

/**
 * Forgets the preferences kept in this browser (on logout). The API also answers the logout with
 * Clear-Site-Data, but a proxy may strip that header.
 */
export function clearAgentPreferences() {
  cache = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Blocked storage: nothing was kept.
  }
  listeners.forEach((listener) => listener());
}

/** A change of the preferences: the fields to set, or a function of the preferences as they are now. */
export type PreferencesPatch = Partial<AgentPreferences> | ((current: AgentPreferences) => Partial<AgentPreferences>);

export function useAgentPreferences(): [AgentPreferences, (patch: PreferencesPatch) => void] {
  const preferences = useSyncExternalStore(subscribe, read, () => DEFAULT_PREFERENCES);
  const update = useCallback((patch: PreferencesPatch) => {
    const current = read();
    write({ ...current, ...(typeof patch === "function" ? patch(current) : patch) });
  }, []);
  return [preferences, update];
}
