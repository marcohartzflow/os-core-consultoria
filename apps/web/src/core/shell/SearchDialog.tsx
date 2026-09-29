"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { Search, UserRound } from "lucide-react";
import { useAuth } from "@/core/auth/AuthProvider";
import { navigationFor } from "./navigation";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";

/** Jump to any screen the user may open (Cmd/Ctrl+J). Lists the same entries as the sidebar. */
export function SearchDialog() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const sections = [
    ...navigationFor(hasPermission),
    { title: "Conta", items: [{ label: "Minha conta", href: "/account", icon: UserRound }] },
  ];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "j" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="link"
        onClick={() => setOpen(true)}
        className="px-0! font-normal text-muted-foreground hover:no-underline"
      >
        <Search data-icon="inline-start" />
        Buscar
        <Kbd>⌘J</Kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Buscar" description="Ir para uma tela do portal">
        <Command>
          <CommandInput placeholder="Buscar telas…" />
          <CommandList>
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            {sections.map((section, index) => (
              <Fragment key={section.title}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={section.title}>
                  {section.items.map((item) => (
                    <CommandItem
                      key={item.href}
                      value={`${section.title} ${item.label}`}
                      onSelect={() => {
                        setOpen(false);
                        router.push(item.href);
                      }}
                    >
                      <item.icon />
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
