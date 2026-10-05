"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { ChevronDown, CirclePlus, Command, LogOut } from "lucide-react";
import { AgentToggle } from "@/core/ai/AgentToggle";
import { AgentWorkspace } from "@/core/ai/AgentWorkspace";
import type { Layout } from "react-resizable-panels";
import { AccountOnboarding } from "@/core/auth/AccountOnboarding";
import { useAuth } from "@/core/auth/AuthProvider";
import { SettingsProvider } from "@/core/settings/SettingsDialog";
import { breadcrumbFor, navigationFor, quickCreateFor } from "./navigation";
import { NavUser } from "./NavUser";
import { SearchDialog } from "./SearchDialog";
import { ThemeSwitcher } from "./ThemeSwitcher";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
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

/** Primary "Criar" button at the top of the sidebar, as in the reference; hidden when nothing is allowed. */
function QuickCreate({ hasPermission }: { hasPermission: (permission: string) => boolean }) {
  const items = quickCreateFor(hasPermission);
  if (items.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip="Criar"
                  className="bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground data-[state=open]:bg-primary/90 data-[state=open]:text-primary-foreground"
                >
                  <CirclePlus />
                  <span>Criar</span>
                  <ChevronDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-52">
                <DropdownMenuLabel>Criar</DropdownMenuLabel>
                {items.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href}>
                      <item.icon />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function Trail({ pathname, hasPermission }: { pathname: string; hasPermission: (permission: string) => boolean }) {
  const trail = breadcrumbFor(pathname, hasPermission);
  return (
    <Breadcrumb className="hidden min-w-0 @2xl/page:block">
      <BreadcrumbList className="flex-nowrap whitespace-nowrap">
        {trail.map((crumb, index) => (
          <Fragment key={crumb.label}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {index === trail.length - 1 ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : crumb.href ? (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              ) : (
                <span>{crumb.label}</span>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * Inline feedback while a menu link navigates (Next's useLinkStatus): always rendered, fading in,
 * so the row does not shift. The route's loading.tsx takes over as soon as the server answers.
 */
function NavPending() {
  const { pending } = useLinkStatus();
  return (
    <Spinner
      aria-hidden
      role={undefined}
      aria-label={undefined}
      className={cn("ml-auto opacity-0 transition-opacity", pending && "opacity-100")}
    />
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({
  sidebarOpen,
  agentLayout,
  children,
}: {
  sidebarOpen: boolean;
  agentLayout?: Layout;
  children: React.ReactNode;
}) {
  const { me, hasPermission, logout } = useAuth();
  const pathname = usePathname();
  const sections = navigationFor(hasPermission);
  const fullBleed = isActive(pathname, "/chat");

  // Second factor pending: no navigation, only the verification screen and a way out.
  if (me.mfa.enabled && !me.mfa.verified) {
    return (
      <div className="flex min-h-svh flex-col">
        <header className="flex h-12 items-center gap-2 border-b px-4 lg:px-6 [&_svg]:size-4">
          <Brand />
          <span className="ml-auto text-xs text-muted-foreground">{me.email}</span>
        </header>
        {/* Only the verification page: any other route would mount and call an API that refuses it. */}
        <div className="flex flex-1 items-center justify-center p-6">{pathname === "/mfa" ? children : null}</div>
      </div>
    );
  }

  // Account gate: the API refuses everything but these calls, so no page is rendered until the
  // person sets a new password or enrols the second factor the policy requires.
  if (me.passwordChangeRequired || (me.mfa.required && !me.mfa.enabled)) {
    return (
      <div className="flex min-h-svh flex-col">
        <header className="flex h-12 items-center gap-2 border-b px-4 lg:px-6 [&_svg]:size-4">
          <Brand />
          <span className="ml-auto text-xs text-muted-foreground">{me.email}</span>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut data-icon="inline-start" />
            Sair
          </Button>
        </header>
        <div className="flex flex-1 justify-center p-4 py-10 md:p-10">
          <AccountOnboarding />
        </div>
      </div>
    );
  }

  return (
    <SettingsProvider>
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
            <QuickCreate hasPermission={hasPermission} />
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
                            <NavPending />
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
        <AgentWorkspace
          defaultLayout={agentLayout}
          page={
        // On desktop the page is a window inside the resizable area (see AgentWorkspace) and scrolls
        // on its own; the sticky header stays at the top of that window.
        <SidebarInset
          className={cn(
            "@container/page min-w-0 overflow-x-clip md:h-full md:rounded-2xl md:shadow-sm md:ring-1 md:ring-border",
            // A full-bleed screen (the chat) fills the window and scrolls inside its own parts.
            fullBleed ? "h-svh overflow-hidden md:h-full" : "md:overflow-y-auto",
          )}
        >
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-t-[inherit] border-b bg-background/50 backdrop-blur-md">
            <div className="flex w-full items-center justify-between px-4 lg:px-6">
              <div className="flex min-w-0 items-center gap-1 lg:gap-2">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center" />
                <Trail pathname={pathname} hasPermission={hasPermission} />
              </div>
              <div className="flex items-center gap-2">
                <SearchDialog />
                <ThemeSwitcher />
                <AgentToggle />
              </div>
            </div>
          </header>
          {fullBleed ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
          ) : (
            <div className="min-w-0 flex-1 p-4 md:p-6">
              <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 md:gap-6">{children}</div>
            </div>
          )}
        </SidebarInset>
          }
        />
      </SidebarProvider>
    </SettingsProvider>
  );
}
