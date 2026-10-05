"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layout, PanelSize } from "react-resizable-panels";
import { usePanelRef } from "react-resizable-panels";
import { AGENT_NAME } from "@/core/brand";
import { useAuth } from "@/core/auth/AuthProvider";
import { AgentPanel } from "./AgentPanel";
import { AgentChatProvider } from "./useAgentChat";
import { AGENT_LAYOUT_COOKIE } from "./layout-cookie";
import { AgentWindowContext, type AgentWindow } from "./agent-context";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const DEFAULT_SIZE = 33;
const WIDE_SIZE = 60;

function saveLayout(layout: Layout) {
  document.cookie = `${AGENT_LAYOUT_COOKIE}=${encodeURIComponent(JSON.stringify(layout))}; path=/; max-age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

/**
 * The portal area to the right of the menu: the page window and, next to it, the agent window
 * (about a third of the screen, resizable, collapsible with Cmd/Ctrl+I), both drawn as inset
 * windows. On phones the agent opens as a full-screen sheet instead.
 */
export function AgentWorkspace({ page, defaultLayout }: { page: React.ReactNode; defaultLayout?: Layout }) {
  const { hasPermission } = useAuth();
  // The chat page is the assistant itself: no second window next to it.
  const onChatPage = usePathname().startsWith("/chat");
  const available = hasPermission("ai.chat.use") && !onChatPage;
  const isMobile = useIsMobile();
  const panel = usePanelRef();
  const initiallyOpen = (defaultLayout?.agent ?? 0) > 0;
  const [open, setOpenState] = useState(initiallyOpen);
  // The panel mounts on first use and then stays mounted, so closing keeps the conversation.
  const [mounted, setMounted] = useState(initiallyOpen);
  const [wide, setWide] = useState(false);
  const lastSize = useRef(initiallyOpen ? defaultLayout!.agent : DEFAULT_SIZE);

  const setOpen = useCallback(
    (next: boolean) => {
      if (next) setMounted(true);
      if (isMobile) {
        setOpenState(next);
        return;
      }
      if (next) panel.current?.resize(`${wide ? WIDE_SIZE : lastSize.current}%`);
      else panel.current?.collapse();
    },
    [isMobile, panel, wide],
  );

  const onResize = useCallback(
    (size: PanelSize) => {
      const isOpen = size.asPercentage > 0;
      setOpenState(isOpen);
      if (isOpen) setMounted(true);
      if (isOpen && !wide) lastSize.current = size.asPercentage;
    },
    [wide],
  );

  const toggleWide = useCallback(() => {
    const next = !wide;
    setWide(next);
    setMounted(true);
    if (isMobile) {
      setOpenState(true);
      return;
    }
    panel.current?.resize(`${next ? WIDE_SIZE : lastSize.current}%`);
  }, [isMobile, panel, wide]);

  const value = useMemo<AgentWindow>(
    () => ({ open, setOpen, toggle: () => setOpen(!open), wide, toggleWide, available }),
    [open, setOpen, wide, toggleWide, available],
  );

  useEffect(() => {
    if (!available) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "i" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        value.toggle();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [available, value]);

  // Same window as below, without the agent next to it.
  const pageWindow = (children: React.ReactNode) => (
    // The group sets height: 100% inline, so the screen height lives on this wrapper (a sibling of
    // the sidebar, which also lets the inset spacing follow the sidebar's state).
    <div className="h-svh min-w-0 flex-1 md:peer-data-[variant=inset]:py-2 md:peer-data-[variant=inset]:pr-2 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:pl-2">
      {children}
    </div>
  );

  // One assistant state for the panel and the chat page: the conversation and a turn in progress
  // carry over between them. Screens the agent points to open by themselves only from the panel.
  const withChat = (children: React.ReactNode) =>
    hasPermission("ai.chat.use") ? (
      <AgentChatProvider navigate={!onChatPage}>{children}</AgentChatProvider>
    ) : (
      children
    );

  if (onChatPage) {
    return withChat(<AgentWindowContext.Provider value={value}>{pageWindow(page)}</AgentWindowContext.Provider>);
  }

  if (!available) {
    return <AgentWindowContext.Provider value={value}>{page}</AgentWindowContext.Provider>;
  }

  if (isMobile) {
    return withChat(
      <AgentWindowContext.Provider value={value}>
        {page}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-full">
            <SheetTitle className="sr-only">{AGENT_NAME}</SheetTitle>
            <SheetDescription className="sr-only">Converse com o assistente do portal</SheetDescription>
            {mounted && <AgentPanel />}
          </SheetContent>
        </Sheet>
      </AgentWindowContext.Provider>,
    );
  }

  return withChat(
    <AgentWindowContext.Provider value={value}>
      {pageWindow(
        <ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout} onLayoutChanged={saveLayout}>
          <ResizablePanel id="page" minSize="40%">
            {page}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            disabled={!open}
            aria-label="Redimensionar o assistente"
            className={cn(
              "w-2 bg-transparent after:w-2 focus-visible:ring-0 [&>div]:h-10 [&>div]:opacity-0 [&>div]:transition-opacity hover:[&>div]:opacity-100 focus-visible:[&>div]:bg-ring focus-visible:[&>div]:opacity-100",
              !open && "pointer-events-none w-0",
            )}
          />
          <ResizablePanel
            id="agent"
            panelRef={panel}
            collapsible
            collapsedSize={0}
            defaultSize={initiallyOpen ? `${defaultLayout!.agent}%` : 0}
            minSize={360}
            maxSize="60%"
            onResize={onResize}
          >
            <aside
              aria-label={AGENT_NAME}
              className={cn(
                "flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-background shadow-sm ring-1 ring-border",
                !open && "invisible",
              )}
            >
              {mounted && <AgentPanel />}
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>,
      )}
    </AgentWindowContext.Provider>,
  );
}
