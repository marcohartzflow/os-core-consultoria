// In-memory store of the demonstration: replaces the Spring API and its database. Lives on
// globalThis so a hot reload in development keeps what was changed during the presentation.
import type {
  AuditEventView,
  ChatMessage,
  ConversationSummary,
  PermissionDefinition,
  RoleSummary,
  ToolSetting,
  UserSummary,
} from "@/core/api/types";
import type { TaskSummary } from "@/modules/tasks/types";
import { COMPANY, OWNER_NAME } from "@/core/brand";
import { EQUIPE } from "@/modules/consultoria/team";
import { diaUtil, isoTime, seedConsultoria, tarefasDosCombinados } from "./consultoria";
import { EMPRESA_PERMISSIONS } from "./empresa-api";

export const ME_ID = "0190f000-0000-7000-8000-000000000001";

const uid = (n: number) => `0190f000-0000-7000-8000-${String(n).padStart(12, "0")}`;

/** "camila.rezende@<domain>": seeded e-mails always follow the company's domain. */
const emailOf = (name: string) =>
  `${name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(" ")
    .join(".")}@${COMPANY.domain}`;

const PERMISSIONS: PermissionDefinition[] = [
  ["ai", "ai.chat.use", "Usar o assistente"],
  ["audit", "audit.event.read", "Consultar a auditoria"],
  ["audit", "audit.event.export", "Exportar a auditoria"],
  ["auth", "auth.session.terminate", "Encerrar sessões de outras pessoas"],
  ["iam", "iam.permission.read", "Ver o catálogo de permissões"],
  ["iam", "iam.role.read", "Ver roles"],
  ["iam", "iam.role.create", "Criar roles", true],
  ["iam", "iam.role.update", "Editar roles", true],
  ["iam", "iam.role.delete", "Excluir roles", true],
  ["iam", "iam.user.read", "Ver usuários"],
  ["iam", "iam.user.create", "Convidar usuários"],
  ["iam", "iam.user.update", "Renomear usuários"],
  ["iam", "iam.user.disable", "Desativar e reativar usuários"],
  ["iam", "iam.user.roles.assign", "Atribuir roles", true],
  ["iam", "iam.user.mfa.reset", "Redefinir o segundo fator", true],
  ["iam", "iam.user.anonymize", "Anonimizar conta desativada", true],
  ["tasks", "tasks.task.read", "Ver tarefas"],
  ["tasks", "tasks.task.create", "Criar tarefas"],
  ["tasks", "tasks.task.update", "Editar e concluir tarefas"],
  ["tasks", "tasks.task.delete", "Excluir tarefas"],
  ["consultoria", "consultoria.projeto.read", "Ver os projetos, os clientes e os entregáveis"],
  ["consultoria", "consultoria.reuniao.read", "Ver as reuniões e o que foi combinado em cada uma"],
  ["consultoria", "consultoria.horas.read", "Ver horas lançadas, orçado, custo e margem dos projetos"],
  ["consultoria", "consultoria.aviso.read", "Ver os avisos da IA sobre combinados e renovações"],
  ...EMPRESA_PERMISSIONS,
].map(([module, key, description, reserved]) => ({
  module: module as string,
  key: key as string,
  description: description as string,
  reserved: Boolean(reserved),
}));

const ALL = PERMISSIONS.map((p) => p.key);
const TASKS = ["tasks.task.read", "tasks.task.create", "tasks.task.update", "ai.chat.use"];

const LER = ["consultoria.projeto.read", "consultoria.reuniao.read"];

function seedRoles(): RoleSummary[] {
  return [
    { id: uid(101), name: "Administrador do sistema", description: "Acesso total ao portal.", permissions: ALL, system: true, userCount: 1 },
    {
      id: uid(102),
      name: "Sócios e gerentes de projeto",
      description: "Todos os projetos, reuniões, horas, margem e os avisos da IA.",
      permissions: [...LER, "consultoria.horas.read", "consultoria.aviso.read", "audit.event.read", ...TASKS],
      system: false,
      userCount: 5,
    },
    {
      id: uid(103),
      name: "Consultores",
      description: "Projetos, reuniões e entregáveis em que trabalham, e lançamento de horas.",
      permissions: [...LER, ...TASKS],
      system: false,
      userCount: 5,
    },
    {
      id: uid(104),
      name: "Analistas",
      description: "Projetos, reuniões, entregáveis e tarefas.",
      permissions: [...LER, ...TASKS],
      system: false,
      userCount: 3,
    },
    {
      id: uid(105),
      name: "Administrativo e financeiro",
      description: "Contratos, faturamento e horas lançadas.",
      permissions: ["consultoria.projeto.read", "consultoria.horas.read", "tasks.task.read", "tasks.task.update", "audit.event.read"],
      system: false,
      userCount: 1,
    },
  ];
}

function seedUsers(roles: RoleSummary[]): UserSummary[] {
  const r = (i: number) => ({ id: roles[i].id, name: roles[i].name });
  const u = (
    n: number,
    name: string,
    roleRefs: { id: string; name: string }[],
    status: UserSummary["status"],
    lastLogin: number | null,
    mfa = true,
    locked = false,
  ): UserSummary => ({
    id: uid(n),
    name,
    email: emailOf(name),
    roles: roleRefs,
    status,
    lastLoginAt: lastLogin === null ? null : isoTime(-lastLogin, 8 + (n % 9)),
    createdAt: isoTime(-180 + n * 9),
    mfaEnabled: mfa,
    locked,
    anonymizedAt: null,
  });
  const owner = COMPANY.owner;
  const ownerUser = u(1, OWNER_NAME, [r(0)], "ACTIVE", 0);
  ownerUser.email = `${owner.first.toLowerCase()}@${COMPANY.domain}`;
  // Partners and managers see everything of the projects; consultants and analysts their work.
  const roleOf = { Sócio: 1, Gerente: 1, Sênior: 2, Consultor: 2, Analista: 3 } as const;
  return [
    ownerUser,
    ...EQUIPE.map((p, i) => u(i + 2, p.nome, [r(roleOf[p.nivel])], "ACTIVE", i % 4, i !== 11)),
    u(15, "Sandra Lopes", [r(4)], "ACTIVE", 1, false),
    u(16, "Felipe Andrade", [r(2)], "INVITED", null, false),
    u(17, "Rodrigo Saldanha", [r(2)], "DISABLED", 64, false),
  ];
}

function seedTasks(users: UserSummary[]): TaskSummary[] {
  const who = (name: string) => {
    const user = users.find((u) => u.name === name)!;
    return { id: user.id, name: user.name };
  };
  const ownerName = users[0].name;
  const t = (
    n: number,
    title: string,
    description: string | null,
    assignee: string | null,
    due: number | null,
    done = false,
  ): TaskSummary => ({
    id: uid(500 + n),
    title,
    description,
    assignee: assignee === null ? null : who(assignee),
    dueDate: due === null ? null : diaUtil(due),
    status: done ? "DONE" : "OPEN",
    createdAt: isoTime(-10 + (n % 7)),
    updatedAt: isoTime(-(n % 5), 9 + (n % 8)),
    completedAt: done ? isoTime(-1) : null,
  });
  return [
    t(1, "Aprovar o relatório final ao conselho · Guaporé", "Revisão do sócio antes do envio ao Dr. Leandro.", ownerName, 5),
    t(2, "Reunião de sócios: carteira de renovações do trimestre", "Projetos que terminam até dezembro e o que cada um pode virar.", ownerName, 4),
    t(3, "Revisar as propostas abertas no Comercial", "Três propostas aguardando retorno do cliente.", ownerName, 3),
    t(4, "Faturar a parcela 5 de 6 · Ponte Alta", null, "Sandra Lopes", 2),
    t(5, "Cobrar a parcela 3 · Maré Alta", "Venceu e o cliente não pagou; mandar o boleto de novo.", "Sandra Lopes", -1),
    t(6, "Entregar a descrição dos cargos atuais · Saber Mais", "Questionários das 5 unidades já voltaram.", "João Pedro Alves", -1),
    t(7, "Fechar o manual operacional dos 4 hotéis · Maré Alta", null, "Rafael Cunha", -2),
    t(8, "Lançar as horas da semana passada", "O lembrete de horas apontou 22h de 40h.", "Gustavo Lemos", 0),
    t(9, "Atualizar a agenda de condicionantes de outubro · Base Forte", null, "Larissa Peixoto", 3),
    t(10, "Revisar o diagnóstico de cargos · Saber Mais", null, "Helena Duarte", 6),
    t(11, "Kickoff do projeto novo da Lunardi", "Contrato assinado; agendar a reunião de abertura.", "Helena Duarte", 2),
    t(12, "Renovar o seguro de responsabilidade profissional", null, "Sandra Lopes", null, true),
  ];
}

function seedAudit(users: UserSummary[]): AuditEventView[] {
  const actions: [string, AuditEventView["origin"], string | null][] = [
    ["auth.login.success", "REST", null],
    ["auth.login.success", "REST", null],
    ["auth.login.success", "REST", null],
    ["ai.tool.executed", "AI_TOOL", "consultoria_avisos"],
    ["ai.turn.started", "AI_TOOL", null],
    ["tasks.task.created", "REST", "task"],
    ["tasks.task.completed", "REST", "task"],
    ["consultoria.projeto.viewed", "REST", "projeto"],
    ["consultoria.reuniao.transcrita", "SYSTEM", "reuniao"],
    ["consultoria.aviso.raised", "SYSTEM", "aviso"],
    ["auth.login.failure", "REST", null],
    ["ai.tool.executed", "AI_TOOL", "consultoria_reunioes"],
  ];
  const events: AuditEventView[] = [];
  const active = users.filter((u) => u.status === "ACTIVE");
  for (let i = 0; i < 260; i++) {
    const user = active[(i * 5) % active.length];
    const [action, origin, entityType] = actions[(i * 7) % actions.length];
    const hoursAgo = i * 2.7 + (i % 3);
    events.push({
      id: `0190f000-0000-7000-9000-${String(i + 1).padStart(12, "0")}`,
      action,
      origin,
      actorId: user.id,
      actorEmail: user.email,
      entityType,
      entityId: entityType ? `${entityType}-${(i % 40) + 1}` : null,
      correlationId: null,
      details: null,
      ip: `177.${70 + (i % 9)}.${(i * 13) % 255}.${(i * 29) % 255}`,
      occurredAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    });
  }
  return events;
}

const TOOLS: Omit<ToolSetting, "choice" | "expiresAt" | "lastUsedAt">[] = [
  { name: "consultoria_projetos", description: "Consulta os projetos: cliente, frente, fase, entregas, prazo, horas, margem e continuidade.", action: false, risk: "LOW", allowAlwaysOff: false, choices: ["ALLOW", "BLOCK"] },
  { name: "consultoria_reunioes", description: "Lê as reuniões transcritas (Meet e Zoom): resumo, participantes e o que foi combinado em cada uma, com responsável e tarefa.", action: false, risk: "LOW", allowAlwaysOff: false, choices: ["ALLOW", "BLOCK"] },
  { name: "consultoria_horas", description: "Compara horas lançadas com o orçado por projeto e por pessoa, com a projeção ao fim.", action: false, risk: "LOW", allowAlwaysOff: false, choices: ["ALLOW", "BLOCK"] },
  { name: "consultoria_entregaveis", description: "Lista os entregáveis de cada projeto, com prazo, responsável e status.", action: false, risk: "LOW", allowAlwaysOff: false, choices: ["ALLOW", "BLOCK"] },
  { name: "consultoria_avisos", description: "Lê os avisos da IA: combinados de reunião sem responsável e projetos terminando sem proposta de continuidade.", action: false, risk: "LOW", allowAlwaysOff: false, choices: ["ALLOW", "BLOCK"] },
  { name: "tasks_list", description: "Lista tarefas da equipe.", action: false, risk: "LOW", allowAlwaysOff: false, choices: ["ALLOW", "BLOCK"] },
  { name: "tasks_create", description: "Cria uma tarefa e atribui a alguém.", action: true, risk: "MEDIUM", allowAlwaysOff: false, choices: ["ALLOW", "ASK", "BLOCK"] },
];

export interface StoredConversation extends ConversationSummary {
  messages: ChatMessage[];
}

export interface PendingAction {
  id: string;
  conversationId: string;
  tool: string;
  summary: string;
  arguments: string;
  createdAt: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  result: string | null;
  apply: () => string;
}

function seed() {
  const roles = seedRoles();
  const users = seedUsers(roles);
  const consultoria = seedConsultoria();
  const who = (name: string) => {
    const user = users.find((u) => u.name === name);
    return user ? { id: user.id, name: user.name } : null;
  };
  // The items someone took in a meeting already became tasks (the minutes automation did it).
  const combinadas = tarefasDosCombinados(consultoria.combinados, who, users[0].name);
  return {
    roles,
    users,
    permissions: PERMISSIONS,
    tasks: [...seedTasks(users), ...combinadas],
    audit: seedAudit(users),
    tools: TOOLS.map((t) => ({ ...t, choice: t.action ? "ASK" : "ALLOW", expiresAt: null, lastUsedAt: null }) as ToolSetting),
    conversations: [] as StoredConversation[],
    actions: [] as PendingAction[],
    ...consultoria,
  };
}

export type Db = ReturnType<typeof seed>;

const holder = globalThis as unknown as { __consultoriaDb?: Db };
export const db: Db = (holder.__consultoriaDb ??= seed());

// A store seeded before the company screens existed (the dev server kept it across a hot reload):
// add their permissions, so the administrator sees the new menu without a restart.
for (const permission of PERMISSIONS) {
  if (!db.permissions.some((p) => p.key === permission.key)) db.permissions.push(permission);
}
for (const role of db.roles.filter((r) => r.system)) {
  for (const key of ALL) if (!role.permissions.includes(key)) role.permissions.push(key);
}

export const me = () => db.users.find((u) => u.id === ME_ID)!;

export function audit(action: string, entityType: string | null, entityId: string | null, origin: AuditEventView["origin"] = "REST") {
  const user = me();
  db.audit.unshift({
    id: crypto.randomUUID(),
    action,
    origin,
    actorId: user.id,
    actorEmail: user.email,
    entityType,
    entityId,
    correlationId: null,
    details: null,
    ip: "127.0.0.1",
    occurredAt: new Date().toISOString(),
  });
}
