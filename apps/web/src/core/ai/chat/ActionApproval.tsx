"use client";

import { useState } from "react";
import { Check, ChevronDown, MessageSquare, ShieldCheck, ShieldQuestion, X } from "lucide-react";
import type { PendingActionView, ToolSetting } from "@/core/api/types";
import type { ConfirmScope, Step } from "../turns";
import { toolLabel } from "./tool-labels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Decide = (targets: PendingActionView[], decision: "confirm" | "reject", scope?: ConfirmScope) => Promise<void> | void;

const OUTCOME: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  CONFIRMED: { label: "Feito", variant: "secondary" },
  REJECTED: { label: "Não permitido", variant: "outline" },
  FAILED: { label: "Permitido, mas deu erro", variant: "destructive" },
  EXPIRED: { label: "Expirou", variant: "outline" },
};

/** Which reach a confirmation may have, by the same ceilings the server enforces. */
function reach(setting: ToolSetting | undefined) {
  const isRead = setting !== undefined && !setting.action;
  return {
    isRead,
    conversation: setting !== undefined && (isRead || setting.risk !== "HIGH"),
    always: setting?.choices.includes("ALLOW") ?? false,
    why: setting?.allowAlwaysOff
      ? "A empresa desligou esta opção"
      : setting?.risk === "HIGH"
        ? "Ação sensível: sempre pergunta"
        : "Só para ações simples",
  };
}

/** "Permitir" with its reach: this time, this conversation, or always (each off where it does not apply). */
function PermitButton({
  label,
  settings,
  busy,
  onPermit,
}: {
  label: string;
  /** One per action: the reach offered is what all of them take. */
  settings: (ToolSetting | undefined)[];
  busy: boolean;
  onPermit: (scope: ConfirmScope) => void;
}) {
  const reaches = settings.map(reach);
  const isRead = reaches.every((r) => r.isRead);
  const conversation = reaches.every((r) => r.conversation);
  const always = reaches.every((r) => r.always);
  const why = reaches.find((r) => !r.always)?.why ?? "";
  return (
    <ButtonGroup>
      <Button size="sm" disabled={busy} onClick={() => onPermit("ONCE")}>
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={busy} aria-label="Escolher por quanto tempo permitir">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => onPermit("ONCE")}>
              <Check />
              <span className="flex flex-col">
                Só desta vez
                <span className="text-xs text-muted-foreground">Na próxima, pergunta de novo</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!conversation} onSelect={() => onPermit("CONVERSATION")}>
              <MessageSquare />
              <span className="flex flex-col">
                Nesta conversa
                <span className="text-xs text-muted-foreground">
                  {conversation ? "Não pergunta mais aqui" : "Ação sensível: sempre pergunta"}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!always} onSelect={() => onPermit("ALWAYS")}>
              <ShieldCheck />
              <span className="flex flex-col">
                Sempre
                <span className="text-xs text-muted-foreground">
                  {!always ? why : isRead ? "Volta a consultar direto" : "Em qualquer conversa, por 30 dias"}
                </span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

/** The call exactly as the assistant made it, so the person can check the values and not only the summary. */
function ActionArguments({ json }: { json: string }) {
  let entries: [string, unknown][] = [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) entries = Object.entries(parsed);
  } catch {
    if (json.trim()) return <p className="font-mono text-xs break-all text-foreground">{json}</p>;
  }
  entries = entries.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-mono text-muted-foreground">{key}</dt>
          <dd className="break-all whitespace-pre-wrap text-foreground">
            {typeof value === "string" ? value : JSON.stringify(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The values of the call, folded: the summary says what; the details say on what. */
function Details({ action }: { action: PendingActionView }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground">
          Ver detalhes
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1.5">
        <ActionArguments json={action.arguments} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** What a call acted on, for a one-line list: the first of its title, name or e-mail, if any. */
function subjectOf(json: string | undefined): string | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const values = parsed as Record<string, unknown>;
    const subject = ["title", "name", "email"].map((key) => values[key]).find((v) => typeof v === "string" && v.trim());
    return typeof subject === "string" ? subject : null;
  } catch {
    return null;
  }
}

/**
 * What the assistant wants to do and waits for (AI SDK cookbook, "Human in the loop"). One action is
 * one card; several from the same answer are one card with the list, decided all at once ("Permitir
 * tudo") or one by one.
 */
export function ActionApproval({
  actions,
  settings,
  disabled,
  onDecide,
}: {
  actions: PendingActionView[];
  settings: ToolSetting[] | null;
  disabled: boolean;
  onDecide: Decide;
}) {
  const [deciding, setDeciding] = useState<string | null>(null);
  const settingOf = (action: PendingActionView) => settings?.find((t) => t.name === action.tool);
  const busy = disabled || deciding !== null;
  const decide = (key: string, targets: PendingActionView[], decision: "confirm" | "reject", scope?: ConfirmScope) => {
    setDeciding(key);
    void Promise.resolve(onDecide(targets, decision, scope)).finally(() => setDeciding(null));
  };
  const allReads = actions.every((a) => settingOf(a) !== undefined && !settingOf(a)!.action);

  if (actions.length === 1) {
    const [action] = actions;
    return (
      <Alert>
        <ShieldQuestion />
        <AlertTitle>{allReads ? "O assistente quer consultar isto" : "O assistente quer fazer isto"}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <p className="font-medium text-foreground">{action.summary}</p>
          <p className="text-xs">{subjectOf(action.arguments) ?? toolLabel(action.tool)}</p>
          <Details action={action} />
          <div className="mt-1 flex flex-wrap gap-2">
            <PermitButton
              label="Permitir"
              settings={[settingOf(action)]}
              busy={busy}
              onPermit={(scope) => decide("all", [action], "confirm", scope)}
            />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("all", [action], "reject")}>
              Não permitir
            </Button>
            {deciding && <Spinner className="self-center" />}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <ShieldQuestion />
      <AlertTitle>
        {allReads ? `O assistente quer fazer ${actions.length} consultas` : `O assistente quer fazer ${actions.length} coisas`}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <ItemGroup className="gap-0">
          {actions.map((action, index) => (
            <div key={action.id}>
              {index > 0 && <ItemSeparator />}
              <Item size="sm" className="items-start px-0">
                <ItemContent className="min-w-0">
                  <ItemTitle className="text-foreground">{action.summary}</ItemTitle>
                  <ItemDescription className="truncate">{subjectOf(action.arguments) ?? toolLabel(action.tool)}</ItemDescription>
                  <Details action={action} />
                </ItemContent>
                <ItemActions>
                  {deciding === action.id ? (
                    <Spinner />
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Permitir só esta"
                            disabled={busy}
                            onClick={() => decide(action.id, [action], "confirm")}
                          >
                            <Check />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Permitir só esta</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Não permitir esta"
                            disabled={busy}
                            onClick={() => decide(action.id, [action], "reject")}
                          >
                            <X />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Não permitir esta</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
        <div className="flex flex-wrap gap-2">
          <PermitButton
            label="Permitir tudo"
            settings={actions.map(settingOf)}
            busy={busy}
            onPermit={(scope) => decide("all", actions, "confirm", scope)}
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("all", actions, "reject")}>
            Não permitir nada
          </Button>
          {deciding === "all" && <Spinner className="self-center" />}
        </div>
      </AlertDescription>
    </Alert>
  );
}

/** Actions already decided, as a compact list with their outcome (also after a reload). */
export function DecidedActions({ actions }: { actions: PendingActionView[] }) {
  return (
    <ItemGroup className="gap-2">
      {actions.map((action) => {
        const outcome = OUTCOME[action.status === "PENDING" ? "EXPIRED" : action.status] ?? OUTCOME.EXPIRED;
        return (
          <div key={action.id}>
            <Item size="sm" variant="outline">
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full truncate font-normal">{action.summary}</ItemTitle>
                <ItemDescription className="truncate">{subjectOf(action.arguments) ?? toolLabel(action.tool)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant={outcome.variant}>{outcome.label}</Badge>
              </ItemActions>
            </Item>
          </div>
        );
      })}
    </ItemGroup>
  );
}

/**
 * Actions that ran without asking because the person allowed them, one line per tool and reach
 * ("Cria uma tarefa · 3 vezes"), with what each acted on and, while "always" holds, a way back to asking.
 */
export function AutoActions({
  steps,
  settings,
  onRevoke,
}: {
  steps: Extract<Step, { kind: "auto" }>[];
  settings: ToolSetting[] | null;
  onRevoke: (tool: string) => Promise<void> | void;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);
  // Not Map.groupBy: Next.js's default browser targets predate it and it is not polyfilled.
  const groups = new Map<string, typeof steps>();
  for (const step of steps) {
    const key = `${step.tool}:${step.scope}`;
    groups.set(key, [...(groups.get(key) ?? []), step]);
  }
  return (
    <ItemGroup className="gap-2">
      {[...groups].map(([key, group]) => {
        const { tool, scope, summary } = group[0];
        const stillAllowed = settings?.find((t) => t.name === tool)?.choice === "ALLOW";
        const subjects = group.map((step) => subjectOf(step.arguments)).filter((v): v is string => v !== null);
        return (
          <Item key={key} size="sm" variant="outline">
            <ItemContent className="min-w-0">
              <ItemTitle className="w-full truncate font-normal">
                {summary ?? toolLabel(tool)}
                {group.length > 1 && <span className="text-muted-foreground"> · {group.length} vezes</span>}
              </ItemTitle>
              {subjects.length > 0 && <ItemDescription className="truncate">{subjects.join(", ")}</ItemDescription>}
              <ItemDescription className="text-xs">
                Feito direto · você permitiu {scope === "ALWAYS" ? "sempre" : "nesta conversa"}
              </ItemDescription>
            </ItemContent>
            {scope === "ALWAYS" && stillAllowed && (
              <ItemActions>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={revoking !== null}
                  onClick={() => {
                    setRevoking(tool);
                    void Promise.resolve(onRevoke(tool)).finally(() => setRevoking(null));
                  }}
                >
                  {revoking === tool && <Spinner data-icon="inline-start" />}
                  Perguntar de novo
                </Button>
              </ItemActions>
            )}
          </Item>
        );
      })}
    </ItemGroup>
  );
}

