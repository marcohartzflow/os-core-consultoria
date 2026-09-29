"use client";

import { useState } from "react";
import { Download, FileJson, KeyRound, LogOut, Monitor, ShieldCheck, TriangleAlert, UserRound } from "lucide-react";
import { api } from "@/core/api/client";
import type { SessionInfo } from "@/core/api/types";
import { useLoad } from "@/core/api/useLoad";
import { useAuth } from "@/core/auth/AuthProvider";
import { MfaCard } from "@/core/auth/MfaCard";
import { PasswordInput } from "@/core/auth/PasswordInput";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
import { EmptyState, ErrorState, fieldError, FormError, notifySuccess } from "@/core/ui/feedback";
import { formatDateTime, formatRelative, initials } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AccountPage() {
  const { me } = useAuth();
  // While a gate is active the API refuses everything but the gate's own calls; do not make them.
  const enrolling = me.mfa.required && !me.mfa.enabled;
  const gated = me.passwordChangeRequired || enrolling;

  return (
    <>
      <PageHeader title="Minha conta" description="Seus dados, sua senha, seus acessos e seus direitos sobre os dados." />
      {me.passwordChangeRequired && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Defina uma nova senha para continuar</AlertTitle>
          <AlertDescription>
            A senha atual foi definida por outra pessoa. O restante do portal fica bloqueado até você escolher a sua.
          </AlertDescription>
        </Alert>
      )}
      {!me.passwordChangeRequired && enrolling && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Configure a verificação em duas etapas para continuar</AlertTitle>
          <AlertDescription>
            A sua conta exige um aplicativo autenticador. O restante do portal fica bloqueado até a configuração.
          </AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue={gated ? "seguranca" : "perfil"} className="gap-4">
        <TabsList>
          <TabsTrigger value="perfil" disabled={gated}>
            <UserRound />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="seguranca">
            <ShieldCheck />
            Segurança
          </TabsTrigger>
          <TabsTrigger value="sessoes" disabled={gated}>
            <Monitor />
            Sessões
          </TabsTrigger>
          <TabsTrigger value="privacidade" disabled={gated}>
            <FileJson />
            Privacidade
          </TabsTrigger>
        </TabsList>
        <TabsContent value="perfil">
          <ProfileCard />
        </TabsContent>
        <TabsContent value="seguranca">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <ChangePasswordCard />
            {!me.passwordChangeRequired && <MfaCard />}
          </div>
        </TabsContent>
        <TabsContent value="sessoes">{!gated && <SessionsCard />}</TabsContent>
        <TabsContent value="privacidade">
          <PrivacyCard />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProfileCard() {
  const { me } = useAuth();
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarFallback className="text-lg">{initials(me.name)}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 gap-1">
            <CardTitle className="truncate text-xl">{me.name}</CardTitle>
            <CardDescription className="truncate">{me.email}</CardDescription>
          </div>
        </div>
        <CardAction>
          {me.mfa.enabled ? (
            <Badge variant="secondary">
              <ShieldCheck />
              Duas etapas ativa
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Duas etapas inativa
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          <Item variant="outline" size="sm">
            <ItemMedia variant="icon">
              <UserRound />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Roles</ItemTitle>
              <ItemDescription>Definem o que você pode fazer, no portal e pelo assistente.</ItemDescription>
            </ItemContent>
            <ItemActions className="flex-wrap justify-end">
              {me.roles.length ? (
                me.roles.map((role) => (
                  <Badge key={role} variant="outline">
                    {role}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Nenhuma</span>
              )}
            </ItemActions>
          </Item>
          <Item variant="outline" size="sm">
            <ItemMedia variant="icon">
              <KeyRound />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Permissões</ItemTitle>
              <ItemDescription>Ações liberadas pelas suas roles.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant="secondary" className="tabular-nums">
                {me.permissions.length}
              </Badge>
            </ItemActions>
          </Item>
        </ItemGroup>
      </CardContent>
      <CardFooter className="border-t text-sm text-muted-foreground">
        Nome e e-mail são alterados por um administrador.
      </CardFooter>
    </Card>
  );
}

function ChangePasswordCard() {
  const { refresh } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      notifySuccess("Senha alterada", "Suas outras sessões foram encerradas.");
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const currentError = fieldError(error, "currentPassword");
  const nextError = fieldError(error, "newPassword");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Senha</CardTitle>
        <CardDescription>Ao alterar, todas as outras sessões são encerradas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <FormError error={currentError || nextError ? null : error} />
            <Field data-invalid={!!currentError}>
              <FieldLabel htmlFor="current">Senha atual</FieldLabel>
              <PasswordInput
                id="current"
                autoComplete="current-password"
                required
                aria-invalid={!!currentError}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
              {currentError && <FieldError>{currentError}</FieldError>}
            </Field>
            <Field data-invalid={!!nextError}>
              <FieldLabel htmlFor="next">Nova senha</FieldLabel>
              <PasswordInput
                id="next"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                aria-invalid={!!nextError}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              {nextError ? (
                <FieldError>{nextError}</FieldError>
              ) : (
                <FieldDescription>Mínimo de 12 caracteres. Senhas vazadas são recusadas.</FieldDescription>
              )}
            </Field>
            <Field data-invalid={mismatch}>
              <FieldLabel htmlFor="confirm">Confirmar nova senha</FieldLabel>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                required
                aria-invalid={mismatch}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setMismatch(false);
                }}
              />
              {mismatch && <FieldError>As senhas não conferem.</FieldError>}
            </Field>
            <div>
              <Button type="submit" disabled={busy}>
                {busy && <Spinner data-icon="inline-start" />}
                {busy ? "Salvando…" : "Alterar senha"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const { data: sessions, error, refresh, retry } = useLoad(() => api<SessionInfo[]>("/api/me/sessions"));
  const [ending, setEnding] = useState<SessionInfo | "others" | null>(null);
  const others = sessions?.filter((s) => !s.current).length ?? 0;
  const ordered = sessions ? [...sessions].sort((a, b) => Number(b.current) - Number(a.current)) : null;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Sessões ativas</CardTitle>
        <CardDescription>Dispositivos conectados com a sua conta agora.</CardDescription>
        {others > 0 && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setEnding("others")}>
              <LogOut data-icon="inline-start" />
              Encerrar as outras
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={retry} />
        ) : !ordered ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : ordered.length === 0 ? (
          <EmptyState icon={Monitor} title="Nenhuma sessão" description="Nenhum dispositivo conectado." />
        ) : (
          <ItemGroup className="gap-2">
            {ordered.map((session) => (
              <Item key={session.id} variant={session.current ? "muted" : "outline"} size="sm">
                <ItemMedia variant="icon">
                  <Monitor />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {session.current ? "Este dispositivo" : "Outro dispositivo"}
                    {session.current && <Badge variant="secondary">Sessão atual</Badge>}
                  </ItemTitle>
                  <ItemDescription>
                    Entrou em {formatDateTime(session.createdAt)} · ativa {formatRelative(session.lastAccessedAt)}
                  </ItemDescription>
                </ItemContent>
                {!session.current && (
                  <ItemActions>
                    <Button variant="ghost" size="sm" onClick={() => setEnding(session)}>
                      Encerrar
                    </Button>
                  </ItemActions>
                )}
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(open) => !open && setEnding(null)}
        title={ending === "others" ? "Encerrar as outras sessões?" : "Encerrar esta sessão?"}
        description={
          ending === "others"
            ? "Todos os outros dispositivos saem da sua conta. Este continua conectado."
            : "O dispositivo sai da sua conta e precisa entrar de novo."
        }
        confirmLabel="Encerrar"
        onConfirm={async () => {
          await api(ending === "others" || ending === null ? "/api/me/sessions" : `/api/me/sessions/${ending.id}`, {
            method: "DELETE",
          });
          notifySuccess(ending === "others" ? "Outras sessões encerradas" : "Sessão encerrada");
          await refresh();
        }}
      />
    </Card>
  );
}

function PrivacyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Seus dados pessoais</CardTitle>
        <CardDescription>
          A LGPD (art. 18) garante acesso aos dados que a empresa guarda sobre você.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          <Item variant="outline">
            <ItemMedia variant="icon">
              <FileJson />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Baixar meus dados</ItemTitle>
              <ItemDescription>
                Tudo que o portal guarda sobre você, em um arquivo JSON: conta, roles, sessões, conversas com o
                assistente e registros de auditoria em que você aparece.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" asChild>
                <a href="/api/me/data" download>
                  <Download data-icon="inline-start" />
                  Baixar JSON
                </a>
              </Button>
            </ItemActions>
          </Item>
        </ItemGroup>
      </CardContent>
      <CardFooter className="border-t text-sm text-muted-foreground">
        Para corrigir ou apagar dados, fale com um administrador. A anonimização é feita por ele e fica registrada na
        auditoria.
      </CardFooter>
    </Card>
  );
}
