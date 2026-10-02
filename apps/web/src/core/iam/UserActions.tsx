"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, LogOut, Mail, MoreHorizontal, ShieldOff, UserCheck, UserRound, UserX } from "lucide-react";
import { api } from "@/core/api/client";
import type { InvitationIssued, UserSummary } from "@/core/api/types";
import { useAuth } from "@/core/auth/AuthProvider";
import { useStepUp } from "@/core/auth/StepUp";
import { ConfirmDialog } from "@/core/ui/confirm-dialog";
import { notifyError, notifySuccess } from "@/core/ui/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/** Shows an invitation link once, when e-mail delivery is not configured and the admin must hand it over. */
export function InvitationLinkDialog({ link, email, onClose }: { link: string | null; email: string; onClose: () => void }) {
  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de convite</DialogTitle>
          <DialogDescription>
            O envio de e-mail não está configurado. Entregue este link a {email} por um canal seguro. Ele vale por 48
            horas e não será exibido de novo.
          </DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupInput readOnly value={link ?? ""} className="font-mono text-xs" aria-label="Link de convite" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Copiar link"
              onClick={() =>
                void navigator.clipboard.writeText(link ?? "").then(
                  () => notifySuccess("Link copiado"),
                  (e: unknown) => notifyError(e, "Não foi possível copiar"),
                )
              }
            >
              <Copy />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <DialogFooter>
          <Button onClick={onClose}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Pending = "sessions" | "mfa" | "disable" | null;

/**
 * Row menu with what the current user may do to an account. Mirrors the account card of the user
 * page; the API checks every permission again.
 */
export function UserActions({ user, onChanged }: { user: UserSummary; onChanged: () => Promise<unknown> | void }) {
  const { me, hasPermission } = useAuth();
  const [pending, setPending] = useState<Pending>(null);
  const { withStepUp, stepUpDialog } = useStepUp();
  const [link, setLink] = useState<string | null>(null);
  const isSelf = user.id === me.id;
  const alive = !user.anonymizedAt;

  const mayResend = alive && user.status === "INVITED" && hasPermission("iam.user.create");
  // Own sessions are ended from Configurações › Sessões, which keeps the current one.
  const mayEndSessions = alive && !isSelf && hasPermission("auth.session.terminate");
  const mayResetMfa = alive && !isSelf && user.mfaEnabled && hasPermission("iam.user.mfa.reset");
  const mayDisable = alive && !isSelf && user.status !== "DISABLED" && hasPermission("iam.user.disable");
  const mayEnable = alive && user.status === "DISABLED" && hasPermission("iam.user.disable");

  async function resend() {
    try {
      const issued = await api<InvitationIssued>(`/api/iam/users/${user.id}/invitations`, { method: "POST" });
      if (issued.invitationLink) setLink(issued.invitationLink);
      else notifySuccess("Convite reenviado", `Um novo link foi enviado para ${user.email}.`);
      await onChanged();
    } catch (e) {
      notifyError(e, "Não foi possível reenviar o convite");
    }
  }

  async function enable() {
    try {
      await api(`/api/iam/users/${user.id}/enable`, { method: "POST" });
      notifySuccess("Usuário reativado", `${user.name} pode entrar de novo.`);
      await onChanged();
    } catch (e) {
      notifyError(e, "Não foi possível reativar");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={`Ações para ${user.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuLabel className="truncate">{user.name}</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={`/settings/users/${user.id}`}>
                <UserRound />
                Ver detalhes
              </Link>
            </DropdownMenuItem>
            {mayResend && (
              <DropdownMenuItem onSelect={() => void resend()}>
                <Mail />
                Reenviar convite
              </DropdownMenuItem>
            )}
            {mayEndSessions && (
              <DropdownMenuItem onSelect={() => setPending("sessions")}>
                <LogOut />
                Encerrar sessões
              </DropdownMenuItem>
            )}
            {mayResetMfa && (
              <DropdownMenuItem onSelect={() => setPending("mfa")}>
                <ShieldOff />
                Redefinir duas etapas
              </DropdownMenuItem>
            )}
            {mayEnable && (
              <DropdownMenuItem onSelect={() => void enable()}>
                <UserCheck />
                Reativar
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {mayDisable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setPending("disable")}>
                <UserX />
                Desativar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={pending === "sessions"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Encerrar sessões?"
        description={`${user.name} sai de todos os dispositivos e precisa entrar de novo.`}
        confirmLabel="Encerrar sessões"
        onConfirm={async () => {
          await api(`/api/iam/users/${user.id}/sessions`, { method: "DELETE" });
          notifySuccess("Sessões encerradas", `${user.name} saiu de todos os dispositivos.`);
          await onChanged();
        }}
      />
      <ConfirmDialog
        open={pending === "mfa"}
        onOpenChange={(open) => !open && setPending(null)}
        destructive
        title="Redefinir verificação em duas etapas?"
        description={`A senha, o aplicativo autenticador e os códigos de recuperação de ${user.name} deixam de valer e todas as sessões terminam. A pessoa recebe por e-mail um link para criar uma nova senha e configura as duas etapas de novo.`}
        confirmLabel="Redefinir"
        onConfirm={async () => {
          await withStepUp(() => api(`/api/iam/users/${user.id}/mfa/reset`, { method: "POST" }));
          notifySuccess("Duas etapas redefinidas", `Enviamos para ${user.email} um link para criar uma nova senha.`);
          await onChanged();
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
          await onChanged();
        }}
      />
      <InvitationLinkDialog link={link} email={user.email} onClose={() => setLink(null)} />
      {stepUpDialog}
    </>
  );
}
