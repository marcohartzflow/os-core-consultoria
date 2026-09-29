"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { ChevronDown, CirclePlus, Command } from "lucide-react";
import { AgentToggle } from "@/core/ai/AgentToggle";
import { AgentWorkspace } from "@/core/ai/AgentWorkspace";
import type { Layout } from "react-resizable-panels";
import { useAuth } from "@/core/auth/AuthProvider";
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
      <SidebarInset className="@container/page min-w-0 overflow-x-clip md:h-full md:overflow-y-auto md:rounded-2xl md:shadow-sm md:ring-1 md:ring-border">
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
        <div className="min-h-0 min-w-0 flex-1 p-4 md:p-6">
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 md:gap-6">{children}</div>
        </div>
      </SidebarInset>
        }
      />
    </SidebarProvider>
  );
}
