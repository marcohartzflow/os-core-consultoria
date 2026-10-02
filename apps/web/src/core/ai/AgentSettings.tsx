"use client";

import { useEffect, useState } from "react";
import { Brain, Database, Keyboard, Settings2, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { api } from "@/core/api/client";
import type { ToolView } from "@/core/api/types";
import { useAgentPreferences } from "./preferences";
import { useOpenSettings } from "@/core/settings/SettingsDialog";
import { ErrorState } from "@/core/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

/** Marks settings the interface keeps but the server does not use yet. */
function Preview() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Prévia
    </Badge>
  );
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  preview,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  preview?: boolean;
}) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id} className="gap-2">
          {label}
          {preview && <Preview />}
        </FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}

function ToolsList() {
  const [tools, setTools] = useState<ToolView[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    api<ToolView[]>("/api/ai/tools").then(
      (list) => current && setTools(list),
      (e: unknown) => current && setError(e),
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          setError(null);
          setTools(null);
          setAttempt((n) => n + 1);
        }}
        className="p-6"
      />
    );
  }
  if (!tools) return <Skeleton className="h-40 w-full" />;
  return (
    <ItemGroup className="gap-2">
      {tools.map((tool) => (
        <Item key={tool.name} variant="outline" size="sm">
          <ItemContent className="min-w-0">
            <ItemTitle className="font-mono text-xs">{tool.name}</ItemTitle>
            <ItemDescription className="line-clamp-2">{tool.description}</ItemDescription>
          </ItemContent>
          <ItemActions>
            {tool.destructive ? <Badge variant="destructive">Pede confirmação</Badge> : <Badge variant="secondary">Leitura</Badge>}
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["⌘", "I"], "Abrir ou fechar o assistente"],
  [["⌘", "J"], "Buscar telas do portal"],
  [["Enter"], "Enviar a mensagem"],
  [["Shift", "Enter"], "Nova linha"],
  [["Esc"], "Parar a resposta"],
];

/**
 * Settings of the assistant panel, in the layout of ChatGPT's settings. General options act at
 * once in this browser; those marked "Prévia" are kept for a later server-side version.
 */
export function AgentSettings({
  open,
  onOpenChange,
  conversationCount,
  onDeleteAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationCount: number;
  onDeleteAll: () => void;
}) {
  const [preferences, update] = useAgentPreferences();
  const openSettings = useOpenSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-6">
          <DialogTitle>Configurações do assistente</DialogTitle>
          <DialogDescription>Valem neste navegador. O assistente age sempre com as suas permissões.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="general" orientation="vertical" className="min-h-0 flex-row gap-0">
          <TabsList className="h-auto w-48 shrink-0 items-stretch self-start rounded-none bg-transparent p-3 *:data-[slot=tabs-trigger]:justify-start">
            <TabsTrigger value="general">
              <Settings2 />
              Geral
            </TabsTrigger>
            <TabsTrigger value="personalization">
              <Sparkles />
              Personalização
            </TabsTrigger>
            <TabsTrigger value="memory">
              <Brain />
              Memória
            </TabsTrigger>
            <TabsTrigger value="tools">
              <Wrench />
              Ferramentas
            </TabsTrigger>
            <TabsTrigger value="data">
              <Database />
              Dados e privacidade
            </TabsTrigger>
            <TabsTrigger value="shortcuts">
              <Keyboard />
              Atalhos
            </TabsTrigger>
          </TabsList>
          <div className="max-h-[60vh] min-w-0 flex-1 overflow-y-auto border-l p-6">
            <TabsContent value="general">
              <FieldGroup>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="agent-text-size">Tamanho do texto</FieldLabel>
                    <FieldDescription>Das mensagens da conversa.</FieldDescription>
                  </FieldContent>
                  <Select
                    value={preferences.textSize}
                    onValueChange={(value) => update({ textSize: value as typeof preferences.textSize })}
                  >
                    <SelectTrigger id="agent-text-size" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sm">Pequeno</SelectItem>
                      <SelectItem value="md">Normal</SelectItem>
                      <SelectItem value="lg">Grande</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <SwitchRow
                  id="agent-enter"
                  label="Enviar com Enter"
                  description="Desligado, Enter quebra a linha e o envio é pelo botão ou por ⌘ Enter."
                  checked={preferences.enterToSend}
                  onChange={(enterToSend) => update({ enterToSend })}
                />
                <SwitchRow
                  id="agent-tools"
                  label="Mostrar ferramentas usadas"
                  description="Exibe na conversa cada consulta que o assistente fez ao portal."
                  checked={preferences.showTools}
                  onChange={(showTools) => update({ showTools })}
                />
                <SwitchRow
                  id="agent-navigate"
                  label="Abrir telas automaticamente"
                  description="Quando o assistente indica uma tela, ela abre ao lado. Desligado, só aparece o link."
                  checked={preferences.autoNavigate}
                  onChange={(autoNavigate) => update({ autoNavigate })}
                />
              </FieldGroup>
            </TabsContent>

            <TabsContent value="personalization">
              <FieldGroup>
                <FieldSet>
                  <FieldLabel className="gap-2">
                    Tom das respostas <Preview />
                  </FieldLabel>
                  <RadioGroup value={preferences.tone} onValueChange={(tone) => update({ tone: tone as typeof preferences.tone })}>
                    {[
                      ["equilibrado", "Equilibrado", "Direto, com o contexto necessário"],
                      ["conciso", "Conciso", "Respostas curtas, só o essencial"],
                      ["detalhado", "Detalhado", "Explica o raciocínio e os próximos passos"],
                      ["formal", "Formal", "Linguagem de documento corporativo"],
                    ].map(([value, label, description]) => (
                      <Field key={value} orientation="horizontal">
                        <RadioGroupItem value={value} id={`tone-${value}`} />
                        <FieldContent>
                          <FieldLabel htmlFor={`tone-${value}`}>{label}</FieldLabel>
                          <FieldDescription>{description}</FieldDescription>
                        </FieldContent>
                      </Field>
                    ))}
                  </RadioGroup>
                </FieldSet>
                <Field>
                  <FieldLabel htmlFor="agent-instructions" className="gap-2">
                    Instruções personalizadas <Preview />
                  </FieldLabel>
                  <Textarea
                    id="agent-instructions"
                    maxLength={1500}
                    placeholder="Ex.: sou do financeiro; prefiro valores em reais e datas no formato dia/mês."
                    value={preferences.instructions}
                    onChange={(e) => update({ instructions: e.target.value })}
                  />
                  <FieldDescription>
                    Ainda não são enviadas ao assistente. Não escreva senhas nem dados de terceiros aqui.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="memory">
              <FieldGroup>
                <SwitchRow
                  id="agent-memory"
                  label="Lembrar entre conversas"
                  description="O assistente guardaria preferências e fatos que você pedir para lembrar."
                  checked={preferences.memory}
                  onChange={(memory) => update({ memory })}
                  preview
                />
                <Item variant="muted">
                  <ItemContent>
                    <ItemTitle>Nenhuma memória salva</ItemTitle>
                    <ItemDescription>Hoje cada conversa começa do zero; nada fica guardado fora dela.</ItemDescription>
                  </ItemContent>
                </Item>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="tools">
              <FieldGroup>
                <FieldDescription>
                  O que o assistente pode fazer por você. A lista vem das suas permissões: quem ajusta é um
                  administrador, em Roles e permissões. Ações que alteram dados pedem sua confirmação antes.
                </FieldDescription>
                <ToolsList />
              </FieldGroup>
            </TabsContent>

            <TabsContent value="data">
              <FieldGroup>
                <Item variant="outline">
                  <ItemContent>
                    <ItemTitle>
                      <ShieldCheck className="size-4" />
                      Onde ficam as conversas
                    </ItemTitle>
                    <ItemDescription>
                      No servidor da empresa, visíveis só para você. Cada ferramenta usada fica registrada na auditoria.
                    </ItemDescription>
                  </ItemContent>
                </Item>
                <Item variant="outline">
                  <ItemContent>
                    <ItemTitle>Exportar meus dados</ItemTitle>
                    <ItemDescription>Inclui as conversas, junto com o resto dos seus dados (LGPD).</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onOpenChange(false);
                        openSettings("privacidade");
                      }}
                    >
                      Abrir
                    </Button>
                  </ItemActions>
                </Item>
                <Item variant="outline">
                  <ItemContent>
                    <ItemTitle>Excluir todas as conversas</ItemTitle>
                    <ItemDescription>
                      {conversationCount === 0
                        ? "Nenhuma conversa para excluir."
                        : `Apaga as ${conversationCount} conversas de forma definitiva.`}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button variant="destructive" size="sm" disabled={conversationCount === 0} onClick={onDeleteAll}>
                      Excluir tudo
                    </Button>
                  </ItemActions>
                </Item>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="shortcuts">
              <ItemGroup className="gap-1">
                {SHORTCUTS.map(([keys, label]) => (
                  <Item key={label} size="sm">
                    <ItemContent>
                      <ItemTitle className="font-normal">{label}</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <KbdGroup>
                        {keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </KbdGroup>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
