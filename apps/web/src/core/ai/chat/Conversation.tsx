"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowDown,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  Copy,
  Pencil,
  RotateCw,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  X,
} from "lucide-react";
import type { ConversationSummary, ModelView, PendingActionView, ToolSetting } from "@/core/api/types";
import { notifyError, notifySuccess } from "@/core/ui/feedback";
import { MessagesSkeleton } from "@/core/ui/page-skeleton";
import { Markdown } from "../Markdown";
import { ActionApproval, AutoActions, DecidedActions } from "./ActionApproval";
import { toolLabel } from "./tool-labels";
import { isOpenAction, type AssistantTurn, type ConfirmScope, type Step, type Turn } from "../turns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TEXT_SIZE = { sm: "text-xs", md: "text-sm", lg: "text-base" } as const;
const enter = "animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:slide-in-from-bottom-0";

function Action({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={onClick}
          className={cn("text-muted-foreground", className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Action
      label={copied ? "Copiado" : "Copiar"}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          (e: unknown) => notifyError(e, "Não foi possível copiar"),
        )
      }
    >
      {copied ? <Check /> : <Copy />}
    </Action>
  );
}

export interface ConversationProps {
  turns: Turn[];
  busy: boolean;
  /** A conversation is loading: placeholders instead of the welcome. */
  opening?: boolean;
  /** Another model offered when an answer fails ("Tentar com …"), as in the block. */
  altModel: ModelView | null;
  showTools: boolean;
  textSize: keyof typeof TEXT_SIZE;
  recent: ConversationSummary[];
  suggestions: [title: string, prompt: string][];
  onOpen: (id: string) => void;
  onPick: (prompt: string) => void;
  onEdit: (text: string) => void;
  onRetry: (turnId: string, modelId?: string) => void;
  onResolve: (
    turnId: string,
    actions: PendingActionView[],
    decision: "confirm" | "reject",
    scope?: ConfirmScope,
  ) => Promise<void> | void;
  /** The person's choice for each tool: which reach a confirmation may have. */
  toolSettings: ToolSetting[] | null;
  /** Back to asking for a tool the person had allowed always. */
  onRevoke: (tool: string) => Promise<void> | void;
}

/** The thread of the chat-03 block: welcome with recent conversations, then turns that follow the stream. */
export function Conversation(props: ConversationProps) {
  const { turns, busy } = props;
  if (props.opening) {
    return (
      <div className={cn("min-h-0 flex-1 overflow-hidden", TEXT_SIZE[props.textSize])}>
        <MessagesSkeleton />
      </div>
    );
  }
  if (turns.length === 0 && !busy) return <Welcome {...props} />;
  const lastAssistant = turns.findLast((t) => t.role === "assistant")?.id;

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport aria-label="Conversa">
          <MessageScrollerContent className={cn("mx-auto w-full max-w-3xl gap-6 px-4 pt-6 pb-4", TEXT_SIZE[props.textSize])}>
            {turns.map((turn) => (
              <MessageScrollerItem key={turn.id} messageId={turn.id} scrollAnchor={turn.role === "user"}>
                {turn.role === "user" ? (
                  <UserTurn text={turn.text} onEdit={props.onEdit} />
                ) : turn.role === "assistant" ? (
                  <AssistantReply
                    turn={turn}
                    isLast={turn.id === lastAssistant && !busy}
                    showTools={props.showTools}
                    altModel={props.altModel}
                    busy={busy}
                    onRetry={props.onRetry}
                    onResolve={(targets, decision, scope) => props.onResolve(turn.id, targets, decision, scope)}
                    toolSettings={props.toolSettings}
                    onRevoke={props.onRevoke}
                  />
                ) : null}
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton variant="outline" size="sm" className="rounded-full shadow-xs">
          <ArrowDown data-icon="inline-start" />
          Ir para o fim
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function Welcome({ recent, suggestions, onOpen, onPick }: ConversationProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8">
      <div className={cn(enter, "flex w-full max-w-3xl flex-col gap-8")}>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Como posso ajudar?</h1>
          <p className="text-muted-foreground">
            Pergunte sobre os dados do portal ou peça uma ação. Tudo roda com as suas permissões e fica na auditoria.
          </p>
        </div>
        {suggestions.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestions.map(([title, prompt]) => (
              <Item key={title} variant="outline" size="sm" asChild>
                <button type="button" className="text-left hover:bg-muted" onClick={() => onPick(prompt)}>
                  <ItemContent>
                    <ItemTitle>{title}</ItemTitle>
                    <ItemDescription>{prompt}</ItemDescription>
                  </ItemContent>
                </button>
              </Item>
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">Continuar</p>
            <ItemGroup className="gap-1">
              {recent.map((c) => (
                <Item key={c.id} size="sm" asChild>
                  <button type="button" className="text-left hover:bg-muted" onClick={() => onOpen(c.id)}>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="w-full truncate">{c.title || "Nova conversa"}</ItemTitle>
                    </ItemContent>
                    <ItemActions className="text-xs text-muted-foreground tabular-nums">{relativeTime(c.updatedAt)}</ItemActions>
                  </button>
                </Item>
              ))}
            </ItemGroup>
          </div>
        )}
      </div>
    </div>
  );
}

function UserTurn({ text, onEdit }: { text: string; onEdit: (text: string) => void }) {
  return (
    <Message align="end" className="items-center">
      <Bubble variant="muted" align="end">
        <BubbleContent className="whitespace-pre-wrap">{text}</BubbleContent>
      </Bubble>
      <div className="flex shrink-0 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
        <Action label="Editar e reenviar" onClick={() => onEdit(text)}>
          <Pencil />
        </Action>
        <CopyAction text={text} />
      </div>
    </Message>
  );
}

function stepLabel(step: Step) {
  switch (step.kind) {
    case "auto":
      return `Fez direto: ${step.summary ?? toolLabel(step.tool)}`;
    case "tool":
      return step.running ? `${toolLabel(step.tool)}…` : toolLabel(step.tool);
    case "pending":
      return `Perguntou antes: ${step.action.summary}`;
    case "failed":
      return `Não deu certo: ${toolLabel(step.tool)}${step.reason ? ` (${step.reason})` : ""}`;
  }
}

/** Icon of a step in the timeline: running, done, failed, or the state of the action it proposed. */
function StepIcon({ step }: { step: Step }) {
  if (step.kind === "tool") return step.running ? <Spinner className="size-3" /> : <Check className="size-3" />;
  if (step.kind === "failed") return <X className="size-3 text-destructive" />;
  if (step.kind === "auto") return <Check className="size-3" />;
  if (isOpenAction(step.action)) return <Clock className="size-3" />;
  return step.action.status === "CONFIRMED" ? <Check className="size-3" /> : <X className="size-3" />;
}

/**
 * The line above an answer, as in the block: "Pensando…" while the model reasons or waits, the
 * tool it is using, then how long it thought and how many tools it used.
 */
function turnStatus(turn: AssistantTurn, steps: Step[], waiting: boolean) {
  const running = steps.findLast((s) => s.kind === "tool" && s.running);
  if (running) return stepLabel(running);
  if (waiting) return "Pensando…";
  const parts: string[] = [];
  if (turn.thoughtMs !== undefined) parts.push(`Pensou por ${Math.max(1, Math.round(turn.thoughtMs / 1000))}s`);
  if (steps.length > 0) parts.push(`${steps.length} ${steps.length === 1 ? "etapa" : "etapas"}`);
  const label = parts.join(" · ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function AssistantReply({
  turn,
  isLast,
  showTools,
  altModel,
  busy,
  onRetry,
  onResolve,
  toolSettings,
  onRevoke,
}: {
  turn: AssistantTurn;
  isLast: boolean;
  showTools: boolean;
  altModel: ModelView | null;
  busy: boolean;
  onRetry: (turnId: string, modelId?: string) => void;
  onResolve: (
    targets: PendingActionView[],
    decision: "confirm" | "reject",
    scope?: ConfirmScope,
  ) => Promise<void> | void;
  toolSettings: ToolSetting[] | null;
  onRevoke: (tool: string) => Promise<void> | void;
}) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const waiting = turn.streaming && !turn.text;
  const steps = showTools ? turn.steps : [];
  // Actions always show (they need the person), whatever the "show tools" preference.
  const actions = turn.steps.flatMap((s) => (s.kind === "pending" ? [s.action] : []));
  const autos = turn.steps.flatMap((s) => (s.kind === "auto" ? [s] : []));
  const waitingActions = actions.filter((a) => isOpenAction(a));
  const decided = actions.filter((a) => !isOpenAction(a));
  // The timeline is open while the turn works and folds when the answer is complete.
  const [open, setOpen] = useState<boolean | null>(null);
  const failed = !turn.streaming && (turn.interrupted || turn.error) && !turn.text;

  return (
    <Message className={cn(turn.streaming && enter)}>
      <MessageContent>
        {(waiting || steps.length > 0 || turn.thoughtMs !== undefined) && (
          <Collapsible open={open ?? turn.streaming} onOpenChange={setOpen} className="flex flex-col gap-2">
            <CollapsibleTrigger
              disabled={steps.length === 0}
              className={cn(
                "group/steps flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                waiting && "shimmer",
              )}
            >
              <ChevronRight
                className={cn(
                  "size-3.5 transition-transform group-data-[state=open]/steps:rotate-90",
                  steps.length === 0 && "hidden",
                )}
              />
              {turnStatus(turn, steps, waiting)}
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-1 border-l-2 pl-3.5 text-sm text-muted-foreground">
              {steps.map((step, index) => (
                <span key={index} className={cn("flex items-center gap-1.5", step.kind === "failed" && "text-destructive")}>
                  <StepIcon step={step} />
                  {stepLabel(step)}
                </span>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {turn.text && (
          <div className={cn(turn.streaming && "after:ml-0.5 after:animate-pulse after:content-['▍']")}>
            <Markdown text={turn.text} streaming={turn.streaming} />
          </div>
        )}

        {autos.length > 0 && <AutoActions steps={autos} settings={toolSettings} onRevoke={onRevoke} />}
        {decided.length > 0 && <DecidedActions actions={decided} />}
        {waitingActions.length > 0 && (
          <ActionApproval actions={waitingActions} settings={toolSettings} disabled={busy} onDecide={onResolve} />
        )}

        {turn.links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {turn.links.map((link) => (
              <Button key={link.href} variant="outline" size="sm" asChild>
                <Link href={link.href}>Abrir: {link.label}</Link>
              </Button>
            ))}
          </div>
        )}

        {failed ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{turn.interrupted ? "A resposta foi interrompida" : "Não foi possível responder"}</AlertTitle>
            <AlertDescription>
              <p>
                {turn.interrupted
                  ? "O assistente parou antes de terminar. Sua mensagem não se perdeu: tente de novo com o mesmo modelo ou com outro."
                  : turn.error}
              </p>
              {isLast && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onRetry(turn.id)}>
                    <RotateCw data-icon="inline-start" />
                    Tentar de novo
                  </Button>
                  {altModel && (
                    <Button size="sm" variant="outline" onClick={() => onRetry(turn.id, altModel.id)}>
                      Tentar com {altModel.name}
                    </Button>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        ) : (
          !turn.streaming && (
            <>
              {(turn.error || turn.interrupted) && (
                <p className="text-xs text-muted-foreground">
                  {turn.interrupted ? "Resposta interrompida." : turn.error}
                </p>
              )}
              <div
                className={cn(
                  "-ml-1.5 flex transition-opacity",
                  isLast ? "opacity-100" : "opacity-0 group-hover/message:opacity-100 focus-within:opacity-100",
                )}
              >
                <CopyAction text={turn.text} />
                <Action
                  label="Ler em voz alta"
                  onClick={() => {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(turn.text);
                    utterance.lang = "pt-BR";
                    window.speechSynthesis.speak(utterance);
                  }}
                >
                  <Volume2 />
                </Action>
                <Action
                  label="Boa resposta"
                  className={cn(feedback === "up" && "text-primary")}
                  onClick={() => {
                    setFeedback("up");
                    notifySuccess("Obrigado pelo retorno", "Prévia: a avaliação ainda não é enviada.");
                  }}
                >
                  <ThumbsUp />
                </Action>
                <Action
                  label="Resposta ruim"
                  className={cn(feedback === "down" && "text-destructive")}
                  onClick={() => {
                    setFeedback("down");
                    notifySuccess("Obrigado pelo retorno", "Prévia: a avaliação ainda não é enviada.");
                  }}
                >
                  <ThumbsDown />
                </Action>
                {isLast && (
                  <Action label="Gerar de novo" onClick={() => onRetry(turn.id)}>
                    <RotateCw />
                  </Action>
                )}
                {turn.tokens !== undefined && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="ml-auto px-1.5 text-xs text-muted-foreground tabular-nums">
                        {turn.tokens.toLocaleString("pt-BR")} tokens
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Tokens desta resposta, com as consultas que ela fez</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </>
          )
        )}
      </MessageContent>
    </Message>
  );
}

/** "agora", "5 min", "3 h", "2 d" or the date, as the block shows next to each conversation. */
export function relativeTime(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))} d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
