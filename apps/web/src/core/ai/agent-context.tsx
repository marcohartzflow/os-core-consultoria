"use client";

import { createContext, useContext } from "react";

export interface AgentWindow {
  /** The agent window is visible. */
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  /** Wide mode: the window takes most of the screen. */
  wide: boolean;
  toggleWide: () => void;
  /** False for accounts without ai.chat.use: nothing of the agent is rendered. */
  available: boolean;
}

export const AgentWindowContext = createContext<AgentWindow>({
  open: false,
  toggle: () => undefined,
  setOpen: () => undefined,
  wide: false,
  toggleWide: () => undefined,
  available: false,
});

export function useAgentWindow() {
  return useContext(AgentWindowContext);
}
