"use client";

import { useState } from "react";
import { Ban, ChevronDown, ChevronRight, CircleCheck, Hand, Wrench } from "lucide-react";
import type { ToolSetting } from "@/core/api/types";
import { EmptyState, ErrorState } from "@/core/ui/feedback";
import { formatDate } from "@/core/ui/format";
import { useAgentChat } from "../useAgentChat";
import { toolLabel } from "./tool-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Choice = ToolSetting["choice"];

const label = (tool: ToolSetting) => toolLabel(tool.name);

const OPTIONS: { choice: Choice; title: string; icon: typeof CircleCheck }[] = [
  { choice: "ALLOW", title: "Permitir", icon: CircleCheck },
  { choice: "ASK", title: "Perguntar antes", icon: Hand },
  { choice: "BLOCK", title: "Bloquear", icon: Ban },
];

/**
 * Why an option is off for this tool; null when it can be picked. Asking and blocking are always
 * possible: only "always allow" has a ceiling.
 */
function whyNot(tool: ToolSetting, choice: Choice): string | null {
  if (tool.choices.includes(choice)) return null;
  if (tool.allowAlwaysOff) return "A empresa desligou esta opção.";
  if (tool.risk === "HIGH") return "Ação sensível: o assistente sempre pergunta antes.";
  return "Apaga ou grava dados: só dá para permitir dentro de uma conversa, no próprio pedido.";
}

function ToolRow({ tool, onChoose }: { tool: ToolSetting; onChoose: (choice: Choice) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const allowedUntil = tool.action && tool.choice === "ALLOW" && tool.expiresAt ? formatDate(tool.expiresAt) : null;
  return (
    <Item size="sm" className="px-0">
      <ItemContent className="min-w-0">
        <ItemTitle className="font-normal">{label(tool)}</ItemTitle>
        {allowedUntil && <ItemDescription className="text-xs">Permitido até {allowedUntil}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        {saving && <Spinner className="size-3.5 text-muted-foreground" />}
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={tool.choice}
          disabled={saving}
          aria-label={`Quando o assistente pode usar: ${label(tool)}`}
          onValueChange={(value) => {
            if (!value || value === tool.choice) return;
            setSaving(true);
            onChoose(value as Choice)
              .catch(() => undefined)
              .finally(() => setSaving(false));
          }}
        >
          {OPTIONS.map(({ choice, title, icon: Icon }) => {
            const blocked = whyNot(tool, choice);
            return (
              <Tooltip key={choice}>
                <TooltipTrigger asChild>
                  {/* A disabled button gets no pointer events: the span keeps the explanation reachable. */}
                  <span>
                    <ToggleGroupItem value={choice} aria-label={title} disabled={blocked !== null}>
                      <Icon />
                    </ToggleGroupItem>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{blocked ?? title}</TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
      </ItemActions>
    </Item>
  );
}

/**
 * A group of tools as in Claude's tool permissions: folds, counts, and sets every tool of the group
 * at once (each tool takes the choice only where it is allowed for it).
 */
function ToolSection({
  title,
  hint,
  tools,
  onChoose,
}: {
  title: string;
  hint: string;
  tools: ToolSetting[];
  onChoose: (tool: ToolSetting, choice: Choice) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [applying, setApplying] = useState(false);
  const shared = tools.every((t) => t.choice === tools[0].choice) ? tools[0].choice : null;
  const current = OPTIONS.find((o) => o.choice === shared);
  const groupChoices = OPTIONS.filter((o) => tools.some((t) => t.choices.includes(o.choice)));

  async function applyToAll(choice: Choice) {
    setApplying(true);
    try {
      for (const tool of tools) {
        if (tool.choice !== choice && tool.choices.includes(choice)) await onChoose(tool, choice);
      }
    } catch {
      // chooseTool already told the person which tool failed; the rest keep their choice.
    } finally {
      setApplying(false);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2 py-1">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 gap-2 font-medium">
            {open ? <ChevronDown /> : <ChevronRight />}
            {title}
            <Badge variant="secondary" className="tabular-nums">
              {tools.length}
            </Badge>
            <span className="font-normal text-muted-foreground">{hint}</span>
          </Button>
        </CollapsibleTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={applying}>
              {applying ? <Spinner data-icon="inline-start" /> : current && <current.icon data-icon="inline-start" />}
              {current?.title ?? "Varia"}
              <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {groupChoices.map(({ choice, title: optionTitle, icon: Icon }) => (
              <DropdownMenuItem key={choice} onSelect={() => void applyToAll(choice)}>
                <Icon />
                {optionTitle}
              </DropdownMenuItem>
            ))}
            {groupChoices.some((o) => tools.some((t) => !t.choices.includes(o.choice))) && (
              <>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  Vale só para os itens que aceitam a opção.
                </p>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CollapsibleContent>
        <ItemGroup className="gap-0 pl-6">
          {tools.map((tool, index) => (
            <div key={tool.name}>
              {index > 0 && <ItemSeparator />}
              <ToolRow tool={tool} onChoose={(choice) => onChoose(tool, choice)} />
            </div>
          ))}
        </ItemGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The assistant's tool permissions, after Claude's: for each tool the person may use, always allow,
 * ask for approval, or block. The list comes from the person's own permissions, so a choice here only
 * ever restricts; what an action cannot take stays visible but off, with the reason on hover. The
 * server keeps the same ceilings.
 */
export function ToolPermissions() {
  const chat = useAgentChat();
  const [resetting, setResetting] = useState(false);
  const tools = chat.toolSettings;

  if (chat.toolSettingsError) {
    return <ErrorState error={chat.toolSettingsError} onRetry={chat.retryToolSettings} className="p-6" />;
  }
  if (!tools) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando permissões">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (tools.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="Nada para configurar"
        description="Suas permissões no portal não dão acesso a consultas nem a ações do assistente."
        className="p-6"
      />
    );
  }

  const reads = tools.filter((t) => !t.action);
  const actions = tools.filter((t) => t.action);
  const customized = tools.some((t) => t.choice === "BLOCK" || (t.action && t.choice === "ALLOW"));
  const choose = (tool: ToolSetting, choice: Choice) => chat.chooseTool(tool.name, choice);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">O que o assistente pode fazer</h4>
          <p className="text-sm text-muted-foreground">
            Escolha, para cada item, se o assistente faz direto, pergunta antes ou não faz. Ele nunca vai além do que você
            mesmo pode fazer no portal.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={!customized || resetting}
          onClick={() => {
            setResetting(true);
            void chat.resetTools().finally(() => setResetting(false));
          }}
        >
          {resetting && <Spinner data-icon="inline-start" />}
          Voltar ao padrão
        </Button>
      </div>
      {reads.length > 0 && <ToolSection title="Consultas" hint="Só leem, não mudam nada" tools={reads} onChoose={choose} />}
      {actions.length > 0 && (
        <ToolSection title="Ações" hint="Criam, mudam ou apagam dados" tools={actions} onChoose={choose} />
      )}
    </div>
  );
}
