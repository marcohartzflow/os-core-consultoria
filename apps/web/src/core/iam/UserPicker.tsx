"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, UserX } from "lucide-react";
import { fetchPage, toQuery } from "@/core/api/query";
import type { UserSummary } from "@/core/api/types";
import { useAuth } from "@/core/auth/AuthProvider";
import { initials } from "@/core/ui/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface PickedUser {
  id: string;
  name: string;
}

const SEARCH_DELAY_MS = 250;

function Person({ name, email }: { name: string; email?: string }) {
  return (
    <>
      <Avatar className="size-6">
        <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate">{name}</span>
        {email && <span className="truncate text-xs text-muted-foreground">{email}</span>}
      </span>
    </>
  );
}

/**
 * Picks an active person by searching the API as the name or e-mail is typed (the list is never
 * loaded whole). Without iam.user.read the only choices are "Eu" and "Sem responsável"; the
 * current value is always shown, even when it is not among the results.
 */
export function UserPicker({
  id,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id?: string;
  value: PickedUser | null;
  onChange: (value: PickedUser | null) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const { me, hasPermission } = useAuth();
  const mayList = hasPermission("iam.user.read");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  // A search is on its way: set on typing, so the previous results never pass for the answer.
  const [searching, setSearching] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !mayList) return;
    let active = true;
    const timer = setTimeout(() => {
      fetchPage<UserSummary>(
        `/api/iam/users${toQuery({ q: search.trim() || undefined, state: ["ACTIVE"], size: 10, sort: "name" })}`,
      ).then(
        (page) => {
          if (!active) return;
          setResults(page.content);
          setFailed(false);
          setSearching(false);
        },
        () => {
          if (!active) return;
          setFailed(true);
          setSearching(false);
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, mayList, search, attempt]);

  function pick(next: PickedUser | null) {
    onChange(next);
    setOpen(false);
  }

  const loading = mayList && (searching || (results === null && !failed));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className="w-full justify-start gap-2 font-normal"
        >
          {value ? (
            <Person name={value.name} />
          ) : (
            <span className="flex-1 text-left text-muted-foreground">Sem responsável</span>
          )}
          <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        {/* Results come filtered from the API, so cmdk must not filter them again. */}
        <Command shouldFilter={false}>
          {mayList && (
            <CommandInput
              placeholder="Buscar por nome ou e-mail…" value={search}
              onValueChange={(next) => {
                setSearch(next);
                setSearching(true);
              }}
            />
          )}
          <CommandList>
            <CommandGroup>
              <CommandItem value="__none" onSelect={() => pick(null)}>
                <UserX className="text-muted-foreground" />
                <span className="flex-1">Sem responsável</span>
                {!value && <Check />}
              </CommandItem>
              {value && (mayList || value.id !== me.id) && !results?.some((user) => user.id === value.id) && (
                <CommandItem value={`__current-${value.id}`} onSelect={() => pick(value)}>
                  <Person name={value.name} />
                  <Check />
                </CommandItem>
              )}
              {!mayList && (
                <CommandItem value="__me" onSelect={() => pick({ id: me.id, name: me.name })}>
                  <Person name={me.name} email="Eu" />
                  {value?.id === me.id && <Check />}
                </CommandItem>
              )}
            </CommandGroup>
            {mayList && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Pessoas ativas">
                  {loading && (
                    <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground" role="status">
                      <Spinner className="size-3.5" />
                      Buscando…
                    </div>
                  )}
                  {failed && !loading && (
                    <div className="flex items-center justify-between gap-2 px-2 py-2 text-sm text-destructive">
                      Não foi possível buscar as pessoas.
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSearching(true);
                          setAttempt((n) => n + 1);
                        }}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  )}
                  {!loading && results?.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={user.id}
                      onSelect={() => pick({ id: user.id, name: user.name })}
                    >
                      <Person name={user.name} email={user.id === me.id ? `${user.email} (você)` : user.email} />
                      <Check className={cn(value?.id !== user.id && "opacity-0")} />
                    </CommandItem>
                  ))}
                  {!loading && results && results.length === 0 && (
                    <p className="px-2 py-3 text-sm text-muted-foreground">Ninguém encontrado.</p>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
