"use client";

import { ArrowUp, Paperclip, Plus, Square, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 4000;

/**
 * Composer of the chat-03 block on InputGroup (textarea with a block-end toolbar): add menu on the
 * left, send or stop on the right. Attachments wait for server support; web search and dictation
 * from the block are left out (the agent works on the portal's data, and browser dictation would
 * send the audio to a third party).
 */
export function Composer({
  ref,
  value,
  onChange,
  busy,
  enterToSend,
  onSend,
  onStop,
  onOpenTools,
  className,
}: {
  ref?: React.Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  enterToSend: boolean;
  onSend: () => void;
  onStop: () => void;
  onOpenTools: () => void;
  className?: string;
}) {
  const canSend = value.trim().length > 0 && !busy;
  return (
    <form
      className={cn("mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pt-2 pb-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      <InputGroup>
        <InputGroupTextarea
          ref={ref}
          value={value}
          maxLength={MAX_LENGTH}
          rows={1}
          placeholder="Pergunte qualquer coisa"
          aria-label="Mensagem para o assistente"
          className="max-h-48 min-h-12 field-sizing-content px-4 pt-3.5"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Esc stops the answer being written, as in the block; only from the composer, so closing a
            // menu or dialog with Esc never stops it.
            if (e.key === "Escape" && busy) {
              e.preventDefault();
              onStop();
              return;
            }
            const submit = enterToSend ? !e.shiftKey : e.metaKey || e.ctrlKey;
            if (e.key === "Enter" && submit && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <InputGroupButton variant="outline" size="icon-sm" className="rounded-full" aria-label="Adicionar">
                <Plus />
              </InputGroupButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuItem disabled>
                  <Paperclip />
                  Anexar arquivo
                  <Badge variant="outline" className="ml-auto">
                    Em breve
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onOpenTools}>
                  <Wrench />
                  Ver o que o assistente pode fazer
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-2">
            {value.length > MAX_LENGTH - 500 && (
              <span className="text-xs tabular-nums">
                {value.length}/{MAX_LENGTH}
              </span>
            )}
            {busy ? (
              <InputGroupButton
                variant="default"
                size="icon-sm"
                className="rounded-full"
                aria-label="Parar (Esc)"
                onClick={onStop}
              >
                <Square className="fill-current" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                className="rounded-full"
                aria-label="Enviar"
                disabled={!canSend}
              >
                <ArrowUp />
              </InputGroupButton>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
      <p className="text-center text-xs text-muted-foreground">
        O assistente pode errar. Confira informações importantes antes de agir.
      </p>
    </form>
  );
}
