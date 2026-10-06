"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const CYCLE = ["light", "dark", "system"] as const;
const LABELS: Record<string, string> = { light: "claro", dark: "escuro", system: "do sistema" };

const subscribe = () => () => {};

/** Cycles light, dark and system. The icon shows the current choice once the client knows it. */
export function ThemeSwitcher() {
  const { theme = "system", setTheme } = useTheme();
  // The server cannot know the stored theme; render the neutral icon until hydrated.
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const current = hydrated ? theme : "system";
  const next = CYCLE[(CYCLE.indexOf(current as (typeof CYCLE)[number]) + 1) % CYCLE.length];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`Tema ${LABELS[current] ?? current}. Mudar para tema ${LABELS[next]}`}
    >
      <Icon />
    </Button>
  );
}
