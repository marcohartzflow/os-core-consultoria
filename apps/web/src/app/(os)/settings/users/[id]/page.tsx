"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Bot,
  CalendarPlus,
  ChevronRight,
  Clock,
  EraserIcon,
  History,
  LogOut,
  Mail,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserRound,
  UserX,
} from "lucide-react";
import { api, ApiError } from "@/core/api/client";
import { actionLabel } from "@/core/audit/labels";
import { fetchPage, fetchAll, toQuery } from "@/core/api/query";
import type { AuditEventView, InvitationIssued, RoleSummary, UserSummary } from "@/core/api/types";
import { useLoad } from "@/core/api/useLoad";
import { RequirePermission, useAuth } from "@/core/auth/AuthProvider";
import { AdministratorGrantConfirmation, grantsAdministrator, RolePicker } from "@/core/iam/RolePicker";
import { StatusBadge } from "@/core/iam/StatusBadge";
import { InvitationLinkDialog } from "@/core/iam/UserActions";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
import { EmptyState, ErrorState, fieldError, FormError, notifyError, notifySuccess } from "@/core/ui/feedback";
import { formatDate, formatDateTime, formatRelative, initials } from "@/core/ui/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Pending = "mfa" | "sessions" | "disable" | "anonymize" | null;

function BackLink() {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" asChild>
      <Link href="/settings/users">
        <ArrowLeft data-icon="inline-start" />
        Usuários
      </Link>
    </Button>
  );
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, refresh, retry } = useLoad(
    () =>
      Promise.all([
        api<UserSummary>(`/api/iam/users/${id}`),
        // Roles need iam.role.read; without it the page still shows the account.
        fetchAll<RoleSummary>("/api/iam/roles").catch(() => [] as RoleSummary[]),
      ]),
    id,
  );

  if (error) {
    return (
      <>
        <BackLink />
        <Card>
          <CardContent>
            {error instanceof ApiError && error.status === 404 ? (
              <EmptyState
                icon={UserX}
                title="Usuário não encontrado"
                description="A conta não existe ou o endereço está incorreto."
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/settings/users">Voltar para usuários</Link>
                  </Button>
                }
              />
            ) : (
              <ErrorState error={error} onRetry={retry} />
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <BackLink />
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  }

  const [user, roles] = data;
  return <UserDetail key={user.id} user={user} roles={roles} refresh={refresh} />;
}

function UserDetail({
  user,
  roles,
  refresh,
}: {
  user: UserSummary;
  roles: RoleSummary[];
  refresh: () => Promise<void>;
}) {
  const { me, hasPermission } = useAuth();
  const [pending, setPending] = useState<Pending>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSelf = user.id === me.id;
  const alive = !user.anonymizedAt;
  const sortedRoles = [...user.roles].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  async function resend() {
    setBusy(true);
    try {
      const issued = await api<InvitationIssued>(`/api/iam/users/${user.id}/invitations`, { method: "POST" });
      if (issued.invitationLink) setLink(issued.invitationLink);
      else notifySuccess("Convite reenviado", `Um novo link foi enviado para ${user.email}.`);
      await refresh();
    } catch (e) {
      notifyError(e, "Não foi possível reenviar o convite");
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    try {
      await api(`/api/iam/users/${user.id}/enable`, { method: "POST" });
      notifySuccess("Usuário reativado", `${user.name} pode entrar de novo.`);
      await refresh();
    } catch (e) {
      notifyError(e, "Não foi possível reativar");
    } finally {
      setBusy(false);
    }
  }

  const mayResend = alive && user.status === "INVITED" && hasPermission("iam.user.create");
  const mayToggle = alive && hasPermission("iam.user.disable");

  return (
    <>
      <BackLink />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="text-xl">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="truncate font-heading text-3xl tracking-tight">
              {user.name}
              {isSelf && <span className="ml-2 text-base text-muted-foreground">(você)</span>}
            </h1>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge user={user} />
              {user.mfaEnabled ? (
                <Badge variant="secondary">
                  <ShieldCheck />
                  Duas etapas ativa
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  <ShieldAlert />
                  Duas etapas inativa
                </Badge>
              )}
              {sortedRoles.map((role) => (
                <Badge key={role.id} variant="outline">
                  {role.name}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mayResend && (
            <Button variant="outline" disabled={busy} onClick={() => void resend()}>
              <Mail data-icon="inline-start" />
              Reenviar convite
            </Button>
          )}
          {mayToggle &&
            (user.status === "DISABLED" ? (
              <Button variant="outline" disabled={busy} onClick={() => void enable()}>
                <UserCheck data-icon="inline-start" />
                Reativar
              </Button>
            ) : (
              !isSelf && (
                <Button variant="destructive" disabled={busy} onClick={() => setPending("disable")}>
                  <UserX data-icon="inline-start" />
                  Desativar
                </Button>
              )
            ))}
        </div>
      </header>

      <Tabs defaultValue="geral" className="gap-4">
        <TabsList>
          <TabsTrigger value="geral">
            <UserRound />
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="seguranca">
            <ShieldCheck />
            Segurança
          </TabsTrigger>
          {hasPermission("audit.event.read") && (
            <TabsTrigger value="atividade">
              <Activity />
              Atividade
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="geral">
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="grid gap-4 lg:col-span-2">
              <ProfileCard user={user} onSaved={refresh} />
              <AccessCard user={user} roles={roles} onSaved={refresh} />
            </div>
            <AccountCard user={user} />
          </div>
        </TabsContent>

        <TabsContent value="seguranca">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Segurança da conta</CardTitle>
              <CardDescription>Cada ação fica registrada na auditoria com o seu nome.</CardDescription>
            </CardHeader>
            <CardContent>
              <ItemGroup className="gap-2">
                <Item variant="outline">
                  <ItemMedia variant="icon">{user.mfaEnabled ? <ShieldCheck /> : <ShieldAlert />}</ItemMedia>
                  <ItemContent>
                    <ItemTitle>Verificação em duas etapas</ItemTitle>
                    <ItemDescription>
                      {user.mfaEnabled
                        ? "Ativa. Redefinir apaga o autenticador e os códigos de recuperação; a pessoa configura de novo."
                        : "Inativa. A pessoa ativa em Minha conta."}
                    </ItemDescription>
                  </ItemContent>
                  {alive && !isSelf && user.mfaEnabled && (
                    <RequirePermission permission="iam.user.mfa.reset">
                      <ItemActions>
                        <Button variant="outline" size="sm" onClick={() => setPending("mfa")}>
                          <ShieldOff data-icon="inline-start" />
                          Redefinir
                        </Button>
                      </ItemActions>
                    </RequirePermission>
                  )}
                </Item>
                <RequirePermission permission="auth.session.terminate">
                  <Item variant="outline">
                    <ItemMedia variant="icon">
                      <LogOut />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>Sessões</ItemTitle>
                      <ItemDescription>Desconecta a pessoa de todos os dispositivos agora.</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button variant="outline" size="sm" onClick={() => setPending("sessions")}>
                        Encerrar sessões
                      </Button>
                    </ItemActions>
                  </Item>
                </RequirePermission>
                {alive && (
                  <RequirePermission permission="iam.user.disable">
                    <Item variant="outline">
                      <ItemMedia variant="icon">{user.status === "DISABLED" ? <UserCheck /> : <UserX />}</ItemMedia>
                      <ItemContent>
                        <ItemTitle>{user.status === "DISABLED" ? "Conta desativada" : "Acesso ao portal"}</ItemTitle>
                        <ItemDescription>
                          {user.status === "DISABLED"
                            ? "A pessoa não entra no portal. Reative para devolver o acesso."
                            : isSelf
                              ? "Você não pode desativar a própria conta."
                              : "Desativar bloqueia o acesso e encerra as sessões. Dá para reativar depois."}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        {user.status === "DISABLED" ? (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => void enable()}>
                            Reativar
                          </Button>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isSelf}
                            onClick={() => setPending("disable")}
                          >
                            Desativar
                          </Button>
                        )}
                      </ItemActions>
                    </Item>
                  </RequirePermission>
                )}
                {user.status === "DISABLED" && alive && (
                  <RequirePermission permission="iam.user.anonymize">
                    <Item variant="outline">
                      <ItemMedia variant="icon">
                        <EraserIcon />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>Anonimizar dados pessoais (LGPD)</ItemTitle>
                        <ItemDescription>
                          Apaga de forma irreversível e-mail, nome, credenciais e conversas com o assistente.
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Button variant="destructive" size="sm" onClick={() => setPending("anonymize")}>
                          Anonimizar
                        </Button>
                      </ItemActions>
                    </Item>
                  </RequirePermission>
                )}
                {!alive && (
                  <Item variant="muted">
                    <ItemMedia variant="icon">
                      <EraserIcon />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>Dados anonimizados</ItemTitle>
                      <ItemDescription>
                        Em {formatDateTime(user.anonymizedAt)}. A conta não pode mais ser reativada.
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                )}
              </ItemGroup>
            </CardContent>
          </Card>
        </TabsContent>

        {hasPermission("audit.event.read") && (
          <TabsContent value="atividade">
            <ActivityCard user={user} />
          </TabsContent>
        )}
      </Tabs>

      <ConfirmDialog
        open={pending === "mfa"}
        onOpenChange={(open) => !open && setPending(null)}
        destructive
        title="Redefinir verificação em duas etapas?"
        description={`O aplicativo autenticador e os códigos de recuperação de ${user.name} deixam de valer. A pessoa configura de novo no próximo acesso.`}
        confirmLabel="Redefinir"
        onConfirm={async () => {
          await api(`/api/iam/users/${user.id}/mfa/reset`, { method: "POST" });
          notifySuccess("Duas etapas redefinidas", "A pessoa configura de novo no próximo acesso.");
          await refresh();
        }}
      />
      <ConfirmDialog
        open={pending === "sessions"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Encerrar sessões?"
        description={`${user.name} sai de todos os dispositivos e precisa entrar de novo.`}
        confirmLabel="Encerrar sessões"
        onConfirm={async () => {
          await api(`/api/iam/users/${user.id}/sessions`, { method: "DELETE" });
          notifySuccess("Sessões encerradas", `${user.name} saiu de todos os dispositivos.`);
        }}
      />
      <ConfirmDialog
        open={pending === "disable"}
        onOpenChange={(open) => !open && setPending(null)}
        destructive
        title={`Desativar ${user.name}?`}
        description="A conta deixa de entrar no portal e todas as sessões abertas terminam agora. Dá para reativar depois."
        confirmLabel="Desativar"
        onConfirm={async () => {
          await api(`/api/iam/users/${user.id}/disable`, { method: "POST" });
          notifySuccess("Usuário desativado", "As sessões foram encerradas.");
          await refresh();
        }}
      />
      <ConfirmDialog
        open={pending === "anonymize"}
        onOpenChange={(open) => !open && setPending(null)}
        destructive
        title="Anonimizar dados pessoais?"
        description="E-mail, nome, credenciais e conversas com o assistente são apagados de forma irreversível. A trilha de auditoria mantém só o identificador interno. A conta não pode ser reativada depois."
        confirmLabel="Anonimizar"
        onConfirm={async () => {
          await api(`/api/iam/users/${user.id}/anonymize`, { method: "POST" });
          notifySuccess("Dados pessoais anonimizados");
          await refresh();
        }}
      />
      <InvitationLinkDialog link={link} email={user.email} onClose={() => setLink(null)} />
    </>
  );
}

function ProfileCard({ user, onSaved }: { user: UserSummary; onSaved: () => Promise<void> }) {
  const { hasPermission } = useAuth();
  const mayEdit = hasPermission("iam.user.update") && !user.anonymizedAt;
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/iam/users/${user.id}`, { method: "PATCH", body: { name } });
      notifySuccess("Nome atualizado");
      await onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const nameError = fieldError(error, "name");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados</CardTitle>
        <CardDescription>Como a pessoa aparece no portal e na auditoria.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <FormError error={nameError ? null : error} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!nameError}>
                <FieldLabel htmlFor="name">Nome</FieldLabel>
                <Input
                  id="name"
                  required
                  maxLength={200}
                  disabled={!mayEdit}
                  aria-invalid={!!nameError}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {nameError && <FieldError>{nameError}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input id="email" readOnly disabled value={user.email} />
              </Field>
            </div>
            {mayEdit && (
              <div>
                <Button type="submit" disabled={busy || name.trim() === user.name}>
                  {busy && <Spinner data-icon="inline-start" />}
                  Salvar
                </Button>
              </div>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function AccessCard({
  user,
  roles,
  onSaved,
}: {
  user: UserSummary;
  roles: RoleSummary[];
  onSaved: () => Promise<void>;
}) {
  const { hasPermission } = useAuth();
  const mayAssignRoles = hasPermission("iam.user.roles.assign") && !user.anonymizedAt;
  const held = new Set(user.roles.map((role) => role.id));
  const [selected, setSelected] = useState<Set<string>>(held);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const confirmGrant = grantsAdministrator(roles, held, selected);
  const changed = selected.size !== held.size || [...selected].some((roleId) => !held.has(roleId));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/iam/users/${user.id}/roles`, {
        method: "PUT",
        body: { roleIds: [...selected], currentPassword: confirmGrant ? password : null },
      });
      setPassword("");
      notifySuccess("Roles atualizadas", "As permissões mudam na próxima ação da pessoa, sem novo login.");
      await onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acesso</CardTitle>
        <CardDescription>
          {mayAssignRoles
            ? "Permissões mudam na próxima requisição do usuário, sem novo login."
            : "Só administradores do sistema atribuem roles."}
        </CardDescription>
        <CardAction>
          <Badge variant="secondary" className="tabular-nums">
            {user.roles.length} {user.roles.length === 1 ? "role" : "roles"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {mayAssignRoles ? (
          <form onSubmit={submit}>
            <FieldGroup>
              <FormError error={error} />
              <RolePicker roles={roles} selected={selected} onChange={setSelected} />
              {confirmGrant && <AdministratorGrantConfirmation value={password} onChange={setPassword} />}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || !changed}>
                  {busy && <Spinner data-icon="inline-start" />}
                  Salvar roles
                </Button>
                {changed && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSelected(held);
                      setError(null);
                    }}
                  >
                    Desfazer
                  </Button>
                )}
              </div>
            </FieldGroup>
          </form>
        ) : user.roles.length ? (
          <div className="flex flex-wrap gap-1.5">
            {user.roles.map((role) => (
              <Badge key={role.id} variant="outline">
                {role.name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma role: a pessoa não acessa nenhuma área.</p>
        )}
      </CardContent>
    </Card>
  );
}

function AccountCard({ user }: { user: UserSummary }) {
  const rows: [React.ReactNode, string, string, string | null | undefined][] = [
    [<CalendarPlus key="c" />, "Criada em", formatDate(user.createdAt), user.createdAt],
    [<Clock key="l" />, "Último acesso", formatRelative(user.lastLoginAt), user.lastLoginAt],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conta</CardTitle>
        <CardDescription>
          <StatusBadge user={user} />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-1">
          {rows.map(([icon, label, value, iso]) => (
            <Item key={label} size="sm" className="px-0">
              <ItemMedia variant="icon">{icon}</ItemMedia>
              <ItemContent>
                <ItemDescription>{label}</ItemDescription>
              </ItemContent>
              <ItemActions>
                {iso ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-sm font-medium">{value}</span>
                    </TooltipTrigger>
                    <TooltipContent>{formatDateTime(iso)}</TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="text-sm font-medium">{value}</span>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
      <CardFooter className="border-t text-xs text-muted-foreground">
        Id <span className="ml-1 truncate font-mono">{user.id}</span>
      </CardFooter>
    </Card>
  );
}

const EMPTY_EVENTS: AuditEventView[] = [];
/** Latest events of each query (about the account, by the person); the tab shows the newest 20. */
const ACTIVITY_SIZE = 20;

/** What was done to this account and what this person did, newest first. */
function ActivityCard({ user }: { user: UserSummary }) {
  const [events, setEvents] = useState<AuditEventView[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    const about = fetchPage<AuditEventView>(
      `/api/audit/events${toQuery({ entityId: user.id, size: ACTIVITY_SIZE, sort: "occurredAt,desc" })}`,
    );
    // actorEmail matches part of an address, so keep only this person's own events (by id).
    const by = user.anonymizedAt
      ? Promise.resolve({ content: EMPTY_EVENTS })
      : fetchPage<AuditEventView>(
          `/api/audit/events${toQuery({ actorEmail: user.email, size: ACTIVITY_SIZE, sort: "occurredAt,desc" })}`,
        );
    Promise.all([about, by]).then(
      ([a, b]) => {
        if (!current) return;
        const merged = new Map<string, AuditEventView>();
        for (const event of [...a.content, ...b.content.filter((e) => e.actorId === user.id)]) merged.set(event.id, event);
        setEvents([...merged.values()].sort((x, y) => y.occurredAt.localeCompare(x.occurredAt)).slice(0, 20));
        setError(null);
      },
      (e: unknown) => current && setError(e),
    );
    return () => {
      current = false;
    };
  }, [user.id, user.email, user.anonymizedAt, attempt]);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Atividade recente</CardTitle>
        <CardDescription>Ações feitas por esta pessoa e sobre esta conta, pela trilha de auditoria.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/settings/audit?entityId=${encodeURIComponent(user.id)}`}>
              Ver na auditoria
              <ChevronRight data-icon="inline-end" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              setError(null);
              setEvents(null);
              setAttempt((n) => n + 1);
            }}
          />
        ) : !events ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <EmptyState icon={History} title="Sem atividade" description="Nenhum evento registrado para esta conta." />
        ) : (
          <ItemGroup className="gap-1">
            {events.map((event) => (
              <Item key={event.id} size="sm">
                <ItemMedia variant="icon">{event.origin === "AI_TOOL" ? <Bot /> : <Activity />}</ItemMedia>
                <ItemContent>
                  <ItemTitle>{actionLabel(event.action)}</ItemTitle>
                  <ItemDescription>
                    <span className="font-mono">{event.action}</span> ·{" "}
                    {event.actorId === user.id ? "pela própria pessoa" : `por ${event.actorEmail ?? "sistema"}`}
                    {event.origin === "AI_TOOL" && " · pelo assistente"}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {formatRelative(event.occurredAt)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{formatDateTime(event.occurredAt)}</TooltipContent>
                  </Tooltip>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
