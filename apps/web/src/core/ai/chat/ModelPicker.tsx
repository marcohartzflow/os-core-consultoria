"use client";

import { Check, ChevronDown } from "lucide-react";
import type { ModelView } from "@/core/api/types";
import { ProviderLogo } from "./logos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";

/** Model picker of the chat-03 block: provider mark, name, what it is good for and its context window. */
export function ModelPicker({
  models,
  model,
  onChange,
  disabled,
}: {
  models: ModelView[] | null;
  model: ModelView | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  if (!models) return <Skeleton className="h-8 w-36" />;
  if (!model) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="min-w-0" disabled={disabled} aria-label={`Modelo: ${model.name}`}>
          <ProviderLogo provider={model.provider} data-icon="inline-start" />
          <span className="truncate">{model.name}</span>
          <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          {models.map((m) => (
            <DropdownMenuItem key={m.id} onSelect={() => onChange(m.id)} className="items-start">
              <ProviderLogo provider={m.provider} className="mt-0.5" />
              <span className="flex min-w-0 grow flex-col">
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-muted-foreground">{m.description}</span>
              </span>
              {m.id === model.id && <Check className="mt-0.5" />}
              <Kbd className="mt-0.5">{m.context}</Kbd>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
