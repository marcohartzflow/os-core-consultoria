"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Download,
  FileJson,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { api, download } from "@/core/api/client";
import type { NotificationEmailRequest, SessionInfo } from "@/core/api/types";
import { useLoad } from "@/core/api/useLoad";
import { useAuth } from "@/core/auth/AuthProvider";
import { MfaSettings } from "@/core/auth/MfaSettings";
import { useStepUp } from "@/core/auth/StepUp";
import { PasswordInput } from "@/core/auth/PasswordInput";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
import { EmptyState, ErrorState, fieldError, FormError, notifyError, notifySuccess } from "@/core/ui/feedback";
import { formatDateTime, formatRelative, initials } from "@/core/ui/format";
import { SettingsSection } from "./SettingsSection";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type SettingsSectionId = "geral" | "perfil" | "seguranca" | "sessoes" | "privacidade";

export interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  icon: LucideIcon;
  content: () => React.ReactNode;
}

/** Order of the settings window's navigation (and of the "Conta" group of the search). */
export const SETTINGS_SECTIONS: SettingsNavItem[] = [
  {
    id: "geral",
    label: "Geral",
    icon: Settings2,
    content: () => <GeneralSection />,
  },
  {
    id: "perfil",
    label: "Perfil",
    icon: UserRound,
    content: () => <ProfileSection />,
  },
  {
    id: "seguranca",
    label: "Segurança",
    icon: ShieldCheck,
    content: () => <SecuritySection />,
  },
  {
    id: "sessoes",
    label: "Sessões",
    icon: Monitor,
    content: () => <SessionsSection />,
  },
  {
    id: "privacidade",
    label: "Privacidade",
    icon: FileJson,
    content: () => <PrivacySection />,
  },
];

const THEMES = [
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
];

function GeneralSection() {
  const { theme = "system", setTheme } = useTheme();
  return (
    <SettingsSection title="Aparência">
      <FieldGroup>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle id="settings-theme">Tema</FieldTitle>
            <FieldDescription>Vale neste navegador.</FieldDescription>
          </FieldContent>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            aria-labelledby="settings-theme"
            value={theme}
            // Radix sends "" when the active item is clicked again; keep the current theme.
            onValueChange={(value) => value && setTheme(value)}
          >
            {THEMES.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem key={value} value={value} aria-label={label}>
                <Icon />
                <span className="hidden sm:inline">{label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </FieldGroup>
    </SettingsSection>
  );
}

function ProfileSection() {
  const { me } = useAuth();
  return (
    <SettingsSection
      title="Perfil"
      description="Nome e e-mail são alterados por um administrador."
      action={
        me.mfa.enabled ? (
          <Badge variant="secondary">
            <ShieldCheck />
            Duas etapas ativa
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Duas etapas inativa
          </Badge>
        )
      }
    >
      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarFallback className="text-lg">{initials(me.name)}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 gap-1">
          <span className="truncate font-heading text-lg font-medium">{me.name}</span>
          <span className="truncate text-sm text-muted-foreground">{me.email}</span>
        </div>
      </div>
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
    </SettingsSection>
  );
}

/**
 * Password and second factor. Also the whole screen of the account gate: while a new password is
 * required the second factor stays hidden, because the API refuses its calls until then.
 */
export function SecuritySection() {
  const { me } = useAuth();
  return (
    <div className="flex flex-col gap-6">
      <PasswordSection />
      {!me.passwordChangeRequired && (
        <>
          <Separator />
          <NotificationEmailSection />
          <Separator />
          <MfaSettings />
        </>
      )}
    </div>
  );
}

function PasswordSection() {
  const { refresh } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const { withStepUp, stepUpDialog } = useStepUp();

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
      await withStepUp(() =>
        api("/api/me/password", {
          method: "POST",
          body: { currentPassword: current, newPassword: next },
        }),
      );
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
    <SettingsSection title="Senha" description="Ao alterar, todas as outras sessões são encerradas.">
      <form onSubmit={submit} className="max-w-md">
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
      {stepUpDialog}
    </SettingsSection>
  );
}

/**
 * The second address for security notices (NIST SP 800-63B-4 asks for at least two). Saving or
 * removing it asks for the password and, with a second factor, a recent one (step-up), like the
 * password. Reset links never go there: only notices.
 */
function NotificationEmailSection() {
  const { me, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const { withStepUp, stepUpDialog } = useStepUp();

  async function save(notificationEmail: string | null) {
    setBusy(true);
    setError(null);
    try {
      const body: NotificationEmailRequest = { currentPassword: password, notificationEmail };
      await withStepUp(() => api("/api/me/notification-email", { method: "PUT", body }));
      setEmail("");
      setPassword("");
      notifySuccess(
        notificationEmail ? "E-mail secundário salvo" : "E-mail secundário removido",
        "Os dois endereços receberam um aviso da mudança.",
      );
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const emailError = fieldError(error, "notificationEmail");
  const passwordError = fieldError(error, "currentPassword");

  return (
    <SettingsSection
      title="E-mail para avisos de segurança"
      description="Troca de senha, mudança no segundo fator e uso de código de recuperação são avisados no seu e-mail de acesso e também neste. Links para redefinir a senha só vão para o e-mail de acesso."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save(email.trim());
        }}
        className="max-w-md"
      >
        <FieldGroup>
          <FormError error={emailError || passwordError ? null : error} />
          <Field>
            <FieldTitle>E-mail secundário atual</FieldTitle>
            <FieldDescription>{me.notificationEmail ?? "Nenhum. Os avisos vão só para " + me.email + "."}</FieldDescription>
          </Field>
          <Field data-invalid={!!emailError}>
            <FieldLabel htmlFor="notification-email">{me.notificationEmail ? "Novo e-mail secundário" : "E-mail secundário"}</FieldLabel>
            <Input
              id="notification-email"
              type="email"
              autoComplete="email"
              maxLength={320}
              required
              aria-invalid={!!emailError}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailError ? (
              <FieldError>{emailError}</FieldError>
            ) : (
              <FieldDescription>Um endereço diferente do e-mail de acesso, de preferência pessoal.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={!!passwordError}>
            <FieldLabel htmlFor="notification-password">Senha atual</FieldLabel>
            <PasswordInput
              id="notification-password"
              autoComplete="current-password"
              required
              aria-invalid={!!passwordError}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {passwordError && <FieldError>{passwordError}</FieldError>}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Salvando…" : "Salvar"}
            </Button>
            {me.notificationEmail && (
              <Button type="button" variant="outline" disabled={busy || !password} onClick={() => void save(null)}>
                Remover e-mail secundário
              </Button>
            )}
          </div>
        </FieldGroup>
      </form>
      {stepUpDialog}
    </SettingsSection>
  );
}

function SessionsSection() {
  const { data: sessions, error, refresh, retry } = useLoad((signal) => api<SessionInfo[]>("/api/me/sessions", { signal }));
  const { withStepUp, stepUpDialog } = useStepUp();
  // What to end stays set while the dialog closes, so its text does not change during the animation.
  const [ending, setEnding] = useState<SessionInfo | "others" | null>(null);
  const [confirming, setConfirming] = useState(false);
  function ask(target: SessionInfo | "others") {
    setEnding(target);
    setConfirming(true);
  }
  const others = sessions?.filter((s) => !s.current).length ?? 0;
  const ordered = sessions ? [...sessions].sort((a, b) => Number(b.current) - Number(a.current)) : null;

  return (
    <SettingsSection
      title="Sessões ativas"
      description="Dispositivos conectados com a sua conta agora."
      action={
        others > 0 && (
          <Button variant="outline" size="sm" onClick={() => ask("others")}>
            <LogOut data-icon="inline-start" />
            Encerrar as outras
          </Button>
        )
      }
    >
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
                  <Button variant="ghost" size="sm" onClick={() => ask(session)}>
                    Encerrar
                  </Button>
                </ItemActions>
              )}
            </Item>
          ))}
        </ItemGroup>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={ending === "others" ? "Encerrar as outras sessões?" : "Encerrar esta sessão?"}
        description={
          ending === "others"
            ? "Todos os outros dispositivos saem da sua conta. Este continua conectado."
            : "O dispositivo sai da sua conta e precisa entrar de novo."
        }
        confirmLabel="Encerrar"
        onConfirm={async () => {
          if (ending === null) return;
          const path = ending === "others" ? "/api/me/sessions" : `/api/me/sessions/${encodeURIComponent(ending.id)}`;
          await withStepUp(() => api(path, { method: "DELETE" }));
          notifySuccess(ending === "others" ? "Outras sessões encerradas" : "Sessão encerrada");
          await refresh();
        }}
      />
      {stepUpDialog}
    </SettingsSection>
  );
}

function PrivacySection() {
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true);
    try {
      await download("/api/me/data", "application/json", "meus-dados.json");
    } catch (e) {
      notifyError(e, "Não foi possível baixar os dados");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection
      title="Seus dados pessoais"
      description="A LGPD (art. 18) garante acesso aos dados que a empresa guarda sobre você."
    >
      <ItemGroup className="gap-2">
        <Item variant="outline">
          <ItemMedia variant="icon">
            <FileJson />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Baixar meus dados</ItemTitle>
            <ItemDescription>
              Tudo que o portal guarda sobre você, em um arquivo JSON: conta, roles, sessões, conversas com o assistente
              e registros de auditoria em que você aparece.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" disabled={busy} onClick={() => void exportData()}>
              {busy ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              Baixar JSON
            </Button>
          </ItemActions>
        </Item>
      </ItemGroup>
      <p className="text-sm text-muted-foreground">
        Para corrigir ou apagar dados, fale com um administrador. A anonimização é feita por ele e fica registrada na
        auditoria.
      </p>
    </SettingsSection>
  );
}
