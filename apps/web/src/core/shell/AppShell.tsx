"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command } from "lucide-react";
import { AiPanelTrigger } from "@/core/ai/AiPanel";
import { useAuth } from "@/core/auth/AuthProvider";
import { navigationFor } from "./navigation";
import { NavUser } from "./NavUser";
import { SearchDialog } from "./SearchDialog";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

function Brand() {
  return (
    <>
      <Command />
      <span className="text-base font-semibold">OS</span>
    </>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ sidebarOpen, children }: { sidebarOpen: boolean; children: React.ReactNode }) {
  const { me, hasPermission } = useAuth();
  const pathname = usePathname();
  const sections = navigationFor(hasPermission);

  // Second factor pending: no navigation, only the verification screen and a way out.
  if (me.mfa.enabled && !me.mfa.verified) {
    return (
      <div className="flex min-h-svh flex-col">
        <header className="flex h-12 items-center gap-2 border-b px-4 lg:px-6 [&_svg]:size-4">
          <Brand />
          <span className="ml-auto text-xs text-muted-foreground">{me.email}</span>
        </header>
        <div className="flex flex-1 items-center justify-center p-6">{children}</div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={sidebarOpen} style={{ "--sidebar-width": "calc(var(--spacing) * 68)" } as React.CSSProperties}>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Início">
                <Link href="/">
                  <Brand />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {sections.map((section) => (
            <SidebarGroup key={section.title}>
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild tooltip={item.label} isActive={isActive(pathname, item.href)}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-x-clip peer-data-[variant=inset]:border">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-t-[inherit] border-b bg-background/50 backdrop-blur-md">
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center" />
              <SearchDialog />
            </div>
            <div className="flex items-center gap-2">
              <ThemeSwitcher />
              <AiPanelTrigger />
            </div>
          </div>
        </header>
        <div className="min-h-0 min-w-0 flex-1 p-4 md:p-6">
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 md:gap-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
