"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { api, errorMessage } from "@/core/api/client";
import type { AuditEventView, Paged } from "@/core/api/types";
import { RequirePermission } from "@/core/auth/AuthProvider";
import { formatDateTime } from "@/core/ui/format";
import { PageHeader } from "@/core/ui/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Filter {
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  from: string;
  to: string;
}

const EMPTY: Filter = { actorEmail: "", action: "", entityType: "", entityId: "", from: "", to: "" };

/** Local date-time input value to the ISO instant the API expects; empty stays empty. */
function toInstant(local: string): string {
  return local ? new Date(local).toISOString() : "";
}

function query(filter: Filter, page: number): string {
  const params = new URLSearchParams();
  if (filter.actorEmail) params.set("actorEmail", filter.actorEmail);
  if (filter.action) params.set("action", filter.action);
  if (filter.entityType) params.set("entityType", filter.entityType);
  if (filter.entityId) params.set("entityId", filter.entityId);
  if (filter.from) params.set("from", toInstant(filter.from));
  if (filter.to) params.set("to", toInstant(filter.to));
  if (page > 0) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export default function AuditPage() {
  const [draft, setDraft] = useState<Filter>(EMPTY);
  const [filter, setFilter] = useState<Filter>(EMPTY);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Paged<AuditEventView> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<Paged<AuditEventView>>(`/api/audit/events${query(filter, page)}`).then(setResult, (e: unknown) =>
        setError(errorMessage(e)),
      ),
    [filter, page],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof Filter>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Quem fez o quê e quando, no portal e pelo assistente. Registro append-only."
        actions={
          <RequirePermission permission="audit.event.export">
            <Button variant="outline" asChild>
              <a href={`/api/audit/events.csv${query(filter, 0)}`} download>
                <Download />
                Exportar CSV
              </a>
            </Button>
          </RequirePermission>
        }
      />
      <form
        className="mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setFilter(draft);
        }}
      >
        <FieldGroup className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field>
            <FieldLabel htmlFor="f-actor">Quem</FieldLabel>
            <Input id="f-actor" placeholder="e-mail" value={draft.actorEmail} onChange={(e) => set("actorEmail", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-action">Ação</FieldLabel>
            <Input id="f-action" placeholder="iam.user" value={draft.action} onChange={(e) => set("action", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-type">Entidade</FieldLabel>
            <Input id="f-type" placeholder="user" value={draft.entityType} onChange={(e) => set("entityType", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-id">Id</FieldLabel>
            <Input id="f-id" value={draft.entityId} onChange={(e) => set("entityId", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-from">De</FieldLabel>
            <Input id="f-from" type="datetime-local" value={draft.from} onChange={(e) => set("from", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-to">Até</FieldLabel>
            <Input id="f-to" type="datetime-local" value={draft.to} onChange={(e) => set("to", e.target.value)} />
          </Field>
        </FieldGroup>
        <div className="mt-3 flex gap-2">
          <Button type="submit" size="sm">
            <Search />
            Filtrar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY);
              setFilter(EMPTY);
              setPage(0);
            }}
          >
            Limpar
          </Button>
        </div>
      </form>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!result ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.content.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(event.occurredAt)}</TableCell>
                  <TableCell>{event.actorEmail ?? <span className="text-muted-foreground">sistema</span>}</TableCell>
                  <TableCell>
                    <Badge variant={event.origin === "AI_TOOL" ? "default" : "outline"}>{event.origin}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {event.details ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto px-1 py-0 font-mono text-xs"
                        aria-expanded={open === event.id}
                        onClick={() => setOpen(open === event.id ? null : event.id)}
                      >
                        {event.action}
                      </Button>
                    ) : (
                      event.action
                    )}
                    {open === event.id && event.details && (
                      <pre className="mt-2 max-w-xl overflow-x-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                        {JSON.stringify(event.details, null, 2)}
                      </pre>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {event.entityType ? `${event.entityType} ${event.entityId ?? ""}` : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{event.ip ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {result.page.totalElements} registros, página {result.page.number + 1} de {Math.max(result.page.totalPages, 1)}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= result.page.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
