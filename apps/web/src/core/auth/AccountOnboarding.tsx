"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { CircleCheck, Fingerprint, KeyRound, LifeBuoy, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { PasskeySettings } from "./PasskeySettings";
import { RecoveryCodes } from "./RecoveryCodes";
import { useStepUp } from "./StepUp";
import { TotpEnrollment } from "./TotpEnrollment";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface StepData {
  key: "password" | "factor" | "codes";
  title: string;
  description: string;
  icon: LucideIcon;
  done: boolean;
}

/**
 * First access of an account the policy holds back (password set by someone else, second factor
 * required): a checklist after the onboarding-02 block of blocks.so. Each step reflects the account
 * as the API reports it (`/api/me`), not local clicks, and only the steps this account needs appear.
 * The recovery codes are a step of their own: the session is re-read only after they are saved,
 * because the new session opens the portal and would take the codes off the screen.
 */
export function AccountOnboarding() {
  const { me, refresh } = useAuth();
  // Which steps this account needed when the screen opened; a step stays listed once done.
  const [needs] = useState(() => ({
    password: me.passwordChangeRequired,
    factor: me.mfa.required && !me.mfa.enabled,
  }));
  const [codes, setCodes] = useState<string[] | null>(null);
  const { withStepUp, stepUpDialog } = useStepUp();

  const factorDone = me.mfa.enabled || codes !== null;
  const steps: StepData[] = [
    ...(needs.password
      ? [
          {
            key: "password" as const,
            title: "Defina a sua senha",
            description: "A senha atual foi definida por outra pessoa. Escolha uma que só você conheça.",
            icon: KeyRound,
            done: !me.passwordChangeRequired,
          },
        ]
      : []),
    ...(needs.factor
      ? [
          {
            key: "factor" as const,
            title: "Ative a verificação em duas etapas",
            description: "Além da senha, um aplicativo autenticador ou uma chave de acesso a cada novo acesso.",
            icon: ShieldCheck,
            done: factorDone,
          },
          {
            key: "codes" as const,
            title: "Guarde os códigos de recuperação",
            description: "Cada código entra uma vez, sem o celular ou a chave de acesso. Eles não aparecem de novo.",
            icon: LifeBuoy,
            done: false,
          },
        ]
      : []),
  ];
  const current = steps.findIndex((step) => !step.done);
  const completed = steps.filter((step) => step.done).length;

  async function enrolled(recoveryCodes: string[]) {
    // Not the account's first factor (no codes): nothing to save, the session can open the portal.
    if (recoveryCodes.length) setCodes(recoveryCodes);
    else await refresh();
  }

  function content(step: StepData) {
    switch (step.key) {
      case "password":
        return <ChangePasswordForm submitLabel="Salvar senha" />;
      case "factor":
        return (
          <Tabs defaultValue="app">
            <TabsList>
              <TabsTrigger value="app">
                <Smartphone />
                Aplicativo autenticador
              </TabsTrigger>
              <TabsTrigger value="passkey">
                <Fingerprint />
                Chave de acesso
              </TabsTrigger>
            </TabsList>
            <TabsContent value="app" className="pt-3">
              <TotpEnrollment withStepUp={withStepUp} onEnrolled={enrolled} />
            </TabsContent>
            <TabsContent value="passkey" className="pt-3">
              <PasskeySettings onRecoveryCodes={setCodes} onChanged={async () => undefined} withStepUp={withStepUp} />
            </TabsContent>
          </Tabs>
        );
      case "codes":
        return codes && <RecoveryCodes codes={codes} onDone={() => void refresh()} />;
    }
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-lg font-semibold">Prepare a sua conta</h1>
          <p className="text-sm text-muted-foreground">Conclua estes passos para entrar no portal.</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{completed}</span> de {steps.length} concluídos
          </p>
          <Progress value={(completed / steps.length) * 100} aria-label="Progresso da configuração" />
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => {
          const active = index === current;
          return (
            <li key={step.key}>
              <Item
                variant={active ? "muted" : "outline"}
                className="items-start"
                aria-current={active ? "step" : undefined}
              >
                <ItemMedia>
                  {step.done ? (
                    <CircleCheck className="size-6 text-primary" aria-label="Concluído" />
                  ) : (
                    <Badge
                      variant={active ? "default" : "secondary"}
                      className="size-6 justify-center rounded-full p-0 tabular-nums"
                    >
                      {index + 1}
                    </Badge>
                  )}
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className={cn(step.done && "text-muted-foreground line-through", !active && !step.done && "text-muted-foreground")}>
                    {step.title}
                  </ItemTitle>
                  <ItemDescription>{step.description}</ItemDescription>
                  {active && <div className="mt-3">{content(step)}</div>}
                </ItemContent>
                <ItemActions>
                  <step.icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                </ItemActions>
              </Item>
            </li>
          );
        })}
      </ol>
      {stepUpDialog}
    </div>
  );
}
