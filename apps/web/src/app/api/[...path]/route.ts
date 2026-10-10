// Demonstration API: answers every /api/* call of the portal from the in-memory store in src/mock,
// with the same shapes and status codes as the Spring API. No database, no backend process.
// With API_URL set, next.config sends /api/* to the real API instead and this route is never reached.
import { NextResponse, type NextRequest } from "next/server";
import type { MeResponse } from "@maximusflow/contracts";
import type { TaskSummary } from "@/modules/tasks/types";
import { db, me, audit, type StoredConversation } from "@/mock/db";
import { pendingView, runTurn, titleFor } from "@/mock/ai";
import {
  combinadosParaTarefas,
  computeAvisos,
  computeHoras,
  computeResumo,
  isoDay,
  listEntregaveis,
  listProjetos,
  listReunioes,
  projetoView,
  reuniaoView,
} from "@/mock/consultoria";
import { COMPANY } from "@/core/brand";
import { handleEmpresa } from "@/mock/empresa-api";

export const dynamic = "force-dynamic";

const SESSION = "OS_SESSION";

type Params = { params: Promise<{ path: string[] }> };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const empty = () => new NextResponse(null, { status: 204 });
const problem = (status: number, title: string, detail: string) =>
  NextResponse.json({ status, title, detail }, { status, headers: { "Content-Type": "application/problem+json" } });

function meResponse(): MeResponse {
  const user = me();
  const role = db.roles.find((r) => r.id === user.roles[0].id)!;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    notificationEmail: null,
    passwordChangeRequired: false,
    permissions: role.permissions,
    roles: user.roles.map((r) => r.name),
    mfa: { enabled: true, required: true, verified: true },
  };
}

// ---- listings ------------------------------------------------------------------------------------

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

interface ListOptions<T> {
  search?: (item: T) => string;
  /** Query parameter name to a test of the item against the chosen values. */
  filters?: Record<string, (item: T, values: string[]) => boolean>;
  defaultSort?: (a: T, b: T) => number;
}

function filtered<T>(items: T[], q: URLSearchParams, options: ListOptions<T>) {
  let list = [...items];
  const text = norm(q.get("q")).trim();
  if (text && options.search) list = list.filter((item) => norm(options.search!(item)).includes(text));
  for (const [name, test] of Object.entries(options.filters ?? {})) {
    const values = q.getAll(name).filter(Boolean);
    if (values.length) list = list.filter((item) => test(item, values));
  }
  const sort = q.get("sort");
  if (sort) {
    const [field, direction] = sort.split(",");
    const sign = direction === "desc" ? -1 : 1;
    list.sort((a, b) => {
      const x = (a as Record<string, unknown>)[field];
      const y = (b as Record<string, unknown>)[field];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")) * sign;
    });
  } else if (options.defaultSort) list.sort(options.defaultSort);
  return list;
}

function paged<T>(items: T[], q: URLSearchParams, options: ListOptions<T> = {}) {
  const list = filtered(items, q, options);
  const size = Math.min(Math.max(Number(q.get("size")) || 20, 1), 100);
  const number = Math.max(Number(q.get("page")) || 0, 0);
  return json({
    content: list.slice(number * size, number * size + size),
    page: { size, number, totalElements: list.length, totalPages: Math.max(1, Math.ceil(list.length / size)) },
  });
}

// ---- routes --------------------------------------------------------------------------------------

async function handle(request: NextRequest, { params }: Params) {
  const path = (await params).path;
  const route = path.join("/");
  const method = request.method;
  const q = request.nextUrl.searchParams;
  const body = method === "GET" || method === "DELETE" ? null : await request.json().catch(() => null);

  // Sign-in screens work without a session.
  if (route === "auth/csrf") {
    const response = empty();
    response.cookies.set("XSRF-TOKEN", "demo", { path: "/", sameSite: "lax" });
    return response;
  }
  if (route === "auth/login" && method === "POST") {
    const response = json(meResponse());
    response.cookies.set(SESSION, "demo", { path: "/", httpOnly: true, sameSite: "lax" });
    audit("auth.login.success", null, null);
    return response;
  }
  if (route === "auth/logout") {
    const response = empty();
    response.cookies.delete(SESSION);
    return response;
  }
  if (route.startsWith("iam/password-reset") || route === "iam/invitations/accept") return empty();

  if (!request.cookies.has(SESSION)) return problem(401, "Sessão expirada", "Entre de novo para continuar.");

  // ---- me
  if (route === "me" && method === "GET") return json(meResponse());
  if (route === "me/mfa") return json({ enabled: true, required: true, totp: true, passkeys: 1, recoveryCodesLeft: 8 });
  if (route === "me/sessions" && method === "GET") {
    return json([
      { id: "s1", current: true, createdAt: new Date(Date.now() - 3_600_000).toISOString(), lastAccessedAt: new Date().toISOString() },
    ]);
  }
  if (route === "me/passkeys" && method === "GET") {
    return json([{ id: "pk1", label: `MacBook de ${COMPANY.owner.first}`, createdAt: "2026-08-12T13:20:00Z", lastUsedAt: new Date().toISOString() }]);
  }

  // ---- iam
  if (route === "iam/users" && method === "GET") {
    return paged(db.users, q, {
      search: (u) => `${u.name} ${u.email}`,
      filters: {
        state: (u, v) => v.includes(u.status) || (v.includes("LOCKED") && u.locked),
        roleId: (u, v) => u.roles.some((r) => v.includes(r.id)),
        mfa: (u, v) => String(u.mfaEnabled) === v[0],
      },
      defaultSort: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
    });
  }
  if (route === "iam/users" && method === "POST") {
    const user = {
      id: crypto.randomUUID(),
      name: String(body?.name ?? "Novo usuário"),
      email: String(body?.email ?? ""),
      roles: [],
      status: "INVITED" as const,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      mfaEnabled: false,
      locked: false,
      anonymizedAt: null,
    };
    db.users.push(user);
    return json({ user, link: null, emailed: true }, 201);
  }
  if (route === "iam/users/administrators") return json({ active: 1, minimum: 1, belowMinimum: false });
  if (path[0] === "iam" && path[1] === "users" && path[2]) {
    const user = db.users.find((u) => u.id === path[2]);
    if (!user) return problem(404, "Não encontrado", "Usuário não encontrado.");
    if (path[3] === "disable") user.status = "DISABLED";
    if (path[3] === "enable") user.status = "ACTIVE";
    if (path[3] === "invitations") return json({ link: null, emailed: true });
    if (method === "PATCH" && body?.name) user.name = body.name;
    return path[3] && method !== "GET" ? empty() : json(user);
  }
  if (route === "iam/roles" && method === "GET") {
    return paged(db.roles, q, {
      search: (r) => `${r.name} ${r.description ?? ""}`,
      filters: { system: (r, v) => String(r.system) === v[0] },
      defaultSort: (a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name, "pt-BR"),
    });
  }
  if (route === "iam/permissions") return json(db.permissions);

  // ---- tasks
  if (route === "tasks" && method === "GET") {
    return paged(db.tasks, q, {
      search: (t) => `${t.title} ${t.description ?? ""}`,
      filters: {
        status: (t, v) => v.includes(t.status),
        assigneeId: (t, v) => (t.assignee ? v.includes(t.assignee.id) : false),
        unassigned: (t) => t.assignee === null,
        dueBefore: (t, v) => t.dueDate !== null && t.dueDate < v[0],
      },
      defaultSort: (a, b) =>
        a.status.localeCompare(b.status) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
    });
  }
  if (route === "tasks" && method === "POST") {
    const task = taskFrom(body, null);
    db.tasks.unshift(task);
    audit("tasks.task.created", "task", task.id);
    return json(task, 201);
  }
  if (path[0] === "tasks" && path[1]) {
    const index = db.tasks.findIndex((t) => t.id === path[1]);
    if (index < 0) return problem(404, "Não encontrado", "Tarefa não encontrada.");
    const task = db.tasks[index];
    const now = new Date().toISOString();
    if (method === "DELETE") {
      db.tasks.splice(index, 1);
      return empty();
    }
    if (path[2] === "complete") Object.assign(task, { status: "DONE", completedAt: now, updatedAt: now });
    else if (path[2] === "reopen") Object.assign(task, { status: "OPEN", completedAt: null, updatedAt: now });
    else if (method === "PUT") db.tasks[index] = taskFrom(body, task);
    return json(db.tasks[index]);
  }

  // ---- audit
  if (route === "audit/events" && method === "GET") {
    const list = filtered(db.audit, q, {
      search: (e) => `${e.action} ${e.actorEmail ?? ""}`,
      filters: {
        origin: (e, v) => v.includes(e.origin),
        actorId: (e, v) => v.includes(e.actorId ?? ""),
        entityId: (e, v) => v.includes(e.entityId ?? ""),
        action: (e, v) => v.some((a) => e.action.startsWith(a)),
      },
    });
    const size = Math.min(Number(q.get("size")) || 20, 100);
    return json({ content: list.slice(0, size), next: null, previous: null, total: list.length, totalExact: true });
  }
  if (route === "audit/activity") {
    const days = Math.min(Number(q.get("days")) || 90, 365);
    return json(
      Array.from({ length: days }, (_, i) => {
        const back = days - 1 - i;
        const date = new Date(Date.now() - back * 86_400_000);
        const weekday = date.getDay();
        const work = weekday === 0 || weekday === 6 ? 0.2 : 1;
        const wave = 1 + 0.25 * Math.sin(i / 5) + i / days / 2;
        return {
          day: date.toISOString().slice(0, 10),
          loginSuccess: Math.round(9 * work * wave),
          loginFailure: i % 11 === 0 ? 1 : 0,
          rest: Math.round(140 * work * wave),
          aiTool: Math.round(38 * work * wave * (0.5 + i / days)),
          system: 4,
        };
      }),
    );
  }

  // ---- assistant
  if (route === "ai/models") {
    return json([
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "anthropic", description: "Rápido para perguntas do dia a dia", context: "1M", isDefault: false },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic", description: "O mais capaz, para cruzar reuniões, tarefas, horas e contratos dos projetos", context: "1M", isDefault: true },
    ]);
  }
  if (route === "ai/tool-preferences" && method === "GET") return json(db.tools);
  if (path[0] === "ai" && path[1] === "tool-preferences" && path[2]) {
    const tool = db.tools.find((t) => t.name === decodeURIComponent(path[2]));
    if (!tool) return problem(404, "Não encontrado", "Ferramenta não encontrada.");
    if (body?.choice) tool.choice = body.choice;
    return json(tool);
  }
  if (route === "ai/conversations" && method === "GET") {
    return json(
      [...db.conversations]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(summaryOf),
    );
  }
  if (route === "ai/conversations" && method === "POST") {
    const now = new Date().toISOString();
    const conversation: StoredConversation = { id: crypto.randomUUID(), title: "Nova conversa", createdAt: now, updatedAt: now, messages: [] };
    db.conversations.push(conversation);
    return json(summaryOf(conversation), 201);
  }
  if (path[0] === "ai" && path[1] === "conversations" && path[2]) {
    const conversation = db.conversations.find((c) => c.id === path[2]);
    if (!conversation) return problem(404, "Não encontrado", "Conversa não encontrada.");
    if (method === "DELETE") {
      db.conversations.splice(db.conversations.indexOf(conversation), 1);
      return empty();
    }
    if (method === "PATCH") {
      if (body?.title) conversation.title = body.title;
      return json(summaryOf(conversation));
    }
    if (path[3] === "messages" && method === "GET") return json(conversation.messages);
    if ((path[3] === "messages" || path[3] === "continue") && method === "POST") {
      const text = path[3] === "messages" ? String(body?.text ?? "") : null;
      if (text !== null) {
        conversation.messages.push({ role: "user", text, steps: [] });
        if (conversation.title === "Nova conversa") conversation.title = titleFor(text);
      }
      conversation.updatedAt = new Date().toISOString();
      return stream(runTurn(conversation, text, typeof body?.model === "string" ? body.model : null));
    }
  }
  if (path[0] === "ai" && path[1] === "actions" && path[2]) {
    const action = db.actions.find((a) => a.id === path[2]);
    if (!action) return problem(404, "Não encontrado", "Ação não encontrada.");
    if (action.status === "PENDING") {
      if (path[3] === "confirm") {
        action.result = action.apply();
        action.status = "CONFIRMED";
      } else action.status = "REJECTED";
    }
    return json(pendingView(action));
  }

  // ---- company screens (Comercial, Financeiro, Automações, Integrações)
  const empresa = handleEmpresa(path, method, body);
  if (empresa) return empresa;

  // ---- consultancy module
  if (route === "consultoria/resumo") return json(computeResumo(db));
  if (route === "consultoria/avisos") return json(computeAvisos(db));
  if (route === "consultoria/horas") return json(computeHoras(db));
  if (route === "consultoria/projetos") {
    return paged(listProjetos(db), q, {
      search: (p) => `${p.nome} ${p.cliente} ${p.apelido} ${p.segmento} ${p.responsavel} ${p.socio} ${p.equipe.join(" ")}`,
      filters: {
        frente: (p, v) => v.includes(p.frente),
        fase: (p, v) => v.includes(p.fase),
        responsavel: (p, v) => v.includes(p.responsavel),
        aviso: (p, v) => p.avisos.some((a) => v.includes(a)),
      },
      // What needs a decision first: most warnings, then the nearest end.
      defaultSort: (a, b) => b.avisos.length - a.avisos.length || a.fim.localeCompare(b.fim),
    });
  }
  if (path[0] === "consultoria" && path[1] === "projetos" && path[2]) {
    const projeto = db.projetos.find((p) => p.id === path[2]);
    if (!projeto) return problem(404, "Não encontrado", "Projeto não encontrado.");
    if (path[3] === "tarefa" && method === "POST") {
      // The "Criar tarefa" of the project sheet: the suggested action goes to the project manager.
      const owner = db.users.find((u) => u.name === projeto.responsavel);
      const now = new Date().toISOString();
      const task: TaskSummary = {
        id: crypto.randomUUID(),
        title: `Ação sugerida pela IA · ${projeto.apelido}`,
        description: projeto.acaoSugerida,
        assignee: owner ? { id: owner.id, name: owner.name } : null,
        dueDate: isoDay(2),
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      db.tasks.unshift(task);
      audit("tasks.task.created", "task", task.id);
      return json(task, 201);
    }
    audit("consultoria.projeto.viewed", "projeto", projeto.id);
    return json({
      projeto: projetoView(db, projeto),
      reunioes: listReunioes(db).filter((r) => r.projetoId === projeto.id),
      entregaveis: listEntregaveis(db).filter((e) => e.projetoId === projeto.id),
    });
  }
  if (route === "consultoria/reunioes") {
    return paged(listReunioes(db), q, {
      search: (r) => `${r.titulo} ${r.cliente} ${r.apelido} ${r.projeto} ${r.resumo} ${r.participantes.map((p) => p.nome).join(" ")} ${r.combinados.map((c) => c.texto).join(" ")}`,
      filters: {
        frente: (r, v) => v.includes(r.frente),
        origem: (r, v) => v.includes(r.origem),
        cliente: (r, v) => v.includes(r.apelido),
        pendencia: (r, v) => v.includes("SEM_RESPONSAVEL") && r.semResponsavel > 0,
      },
    });
  }
  if (path[0] === "consultoria" && path[1] === "reunioes" && path[2]) {
    const reuniao = db.reunioes.find((r) => r.id === path[2]);
    if (!reuniao) return problem(404, "Não encontrado", "Reunião não encontrada.");
    audit("consultoria.reuniao.viewed", "reuniao", reuniao.id);
    return json(reuniaoView(db, reuniao));
  }
  if (route === "consultoria/combinados/tarefas" && method === "POST") {
    // Orphan items become tasks for the suggested owner: all of them, or the ids sent.
    const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).map(String) : null;
    const created = combinadosParaTarefas(db, ids, (name) => {
      const user = db.users.find((u) => u.name === name);
      return user ? { id: user.id, name: user.name } : null;
    });
    for (const task of created) audit("consultoria.combinado.tarefa", "task", task.id);
    return json(created, 201);
  }
  if (route === "consultoria/entregaveis") {
    return paged(listEntregaveis(db), q, {
      search: (e) => `${e.nome} ${e.projeto} ${e.cliente} ${e.apelido} ${e.responsavel}`,
      filters: {
        status: (e, v) => v.includes(e.status),
        frente: (e, v) => v.includes(e.frente),
        responsavel: (e, v) => v.includes(e.responsavel),
      },
      // Late first, then the nearest due date; delivered ones at the end, newest first.
      defaultSort: (a, b) => {
        const rank = (s: string) => (s === "ATRASADO" ? 0 : s === "ENTREGUE" || s === "APROVACAO_CLIENTE" ? 2 : 1);
        return rank(a.status) - rank(b.status) || (rank(a.status) === 2 ? b.prazo.localeCompare(a.prazo) : a.prazo.localeCompare(b.prazo));
      },
    });
  }

  // Anything else the screens may call while not part of the demonstration.
  if (method !== "GET") return empty();
  return problem(404, "Não encontrado", "Recurso indisponível na demonstração.");
}

const summaryOf = ({ id, title, createdAt, updatedAt }: StoredConversation) => ({ id, title, createdAt, updatedAt });

function taskFrom(body: Record<string, unknown> | null, previous: TaskSummary | null): TaskSummary {
  const now = new Date().toISOString();
  const assignee = db.users.find((u) => u.id === body?.assigneeId) ?? null;
  return {
    id: previous?.id ?? crypto.randomUUID(),
    title: String(body?.title ?? previous?.title ?? ""),
    description: (body?.description as string | null) ?? null,
    dueDate: (body?.dueDate as string | null) ?? null,
    assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
    status: previous?.status ?? "OPEN",
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    completedAt: previous?.completedAt ?? null,
  };
}

function stream(frames: AsyncGenerator<{ event: string; data: Record<string, unknown> }>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await frames.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`event: ${value.event}\ndata: ${JSON.stringify(value.data)}\n\n`));
    },
    async cancel() {
      await frames.return(undefined);
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}


export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
