"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { notifyWarning } from "@/core/ui/feedback";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./sections";
import { SettingsLockContext } from "./SettingsLock";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

const SettingsContext = createContext<((section?: SettingsSectionId) => void) | null>(null);

/** Opens the settings window, on the given section (Geral by default). */
export function useOpenSettings() {
  const open = useContext(SettingsContext);
  if (!open) throw new Error("useOpenSettings must be used inside SettingsProvider");
  return open;
}

/** Settings window of the signed-in person, opened from the user menu, the search or Cmd/Ctrl+,. */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Kept after closing so the section stays on screen during the closing animation.
  const [section, setSection] = useState<SettingsSectionId>("geral");
  // Set by a section while leaving it would lose something for good (see useSettingsLock).
  const [lock, setLock] = useState<string | null>(null);
  // Read by the handlers below, which stay the same functions for every consumer of the context.
  const current = useRef({ section, lock });
  useEffect(() => {
    current.current = { section, lock };
  });

  /** False (and says why) while a section holds the window. */
  const mayLeave = useCallback(() => {
    const reason = current.current.lock;
    if (!reason) return true;
    notifyWarning("Antes de sair", reason);
    return false;
  }, []);

  const openSettings = useCallback(
    (next: SettingsSectionId = "geral") => {
      if (next === current.current.section || mayLeave()) setSection(next);
      setOpen(true);
    },
    [mayLeave],
  );
  const changeOpen = useCallback(
    (next: boolean) => {
      if (next || mayLeave()) setOpen(next);
    },
    [mayLeave],
  );
  const changeSection = useCallback(
    (next: SettingsSectionId) => {
      if (next === current.current.section || mayLeave()) setSection(next);
    },
    [mayLeave],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (open) changeOpen(false);
        else openSettings();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, openSettings, changeOpen]);

  return (
    <SettingsContext.Provider value={openSettings}>
      {children}
      <SettingsLockContext.Provider value={setLock}>
        <SettingsDialog open={open} onOpenChange={changeOpen} section={section} onSectionChange={changeSection} />
      </SettingsLockContext.Provider>
    </SettingsContext.Provider>
  );
}

/**
 * The shadcn "sidebar-13" block (a sidebar in a dialog): section list on the left, the section on
 * the right. Small screens have no room for the list and pick the section in a select instead.
 */
function SettingsDialog({
  open,
  onOpenChange,
  section,
  onSectionChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
}) {
  const current = useMemo(() => SETTINGS_SECTIONS.find((item) => item.id === section), [section]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(44rem,calc(100svh-2rem))] overflow-hidden p-0 md:max-w-3xl lg:max-w-5xl">
        <DialogTitle className="sr-only">Configurações</DialogTitle>
        <DialogDescription className="sr-only">
          Aparência, perfil, segurança, sessões e dados pessoais.
        </DialogDescription>
        {/* Always expanded: the list has no collapsed form, whatever the portal's sidebar is doing. */}
        <SidebarProvider
          open
          onOpenChange={() => {}}
          className="h-full min-h-0 items-stretch"
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 56)",
            } as React.CSSProperties
          }
        >
          <Sidebar collapsible="none" className="hidden border-r md:flex">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Configurações</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {SETTINGS_SECTIONS.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton isActive={item.id === section} onClick={() => onSectionChange(item.id)}>
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-16 shrink-0 items-center gap-2 pr-14 pl-6">
              <Breadcrumb className="hidden md:block">
                <BreadcrumbList>
                  <BreadcrumbItem>Configurações</BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{current?.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <Select value={section} onValueChange={(value) => onSectionChange(value as SettingsSectionId)}>
                <SelectTrigger className="md:hidden" aria-label="Seção das configurações">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SETTINGS_SECTIONS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <item.icon />
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </header>
            {/* Keyed so each section starts at the top with fresh state. */}
            <div key={section} className="flex flex-1 flex-col overflow-y-auto px-6 pb-6">
              {current?.content()}
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
