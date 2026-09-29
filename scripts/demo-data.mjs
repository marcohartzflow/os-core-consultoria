#!/usr/bin/env node
// Fills a LOCAL instance with demonstration data (people, roles, tasks, sign-ins) through the public
// API, so every screen has something to show. Everything goes through the same permission checks
// and audit trail as a person using the portal.
//
//   pnpm demo:data                    # API at http://localhost:8080
//   pnpm demo:data --api http://127.0.0.1:18080
//
// It asks for an administrator's e-mail, password and, when enabled, the second-factor code. They
// can also come from OS_DEMO_EMAIL and OS_DEMO_PASSWORD. Nothing is written to disk and the
// generated passwords of the demo people are never printed: they exist only to accept the
// invitations and sign in once.
//
// Refuses any host other than localhost: demonstration data must never reach a real instance.
// Running it again skips people and roles that already exist and does not duplicate tasks.

import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

const DOMAIN = "demo.example.com";

const args = process.argv.slice(2);
const apiArg = args.indexOf("--api");
const API = new URL(apiArg >= 0 ? args[apiArg + 1] : "http://localhost:8080");
if (!["localhost", "127.0.0.1", "[::1]"].includes(API.hostname)) {
  console.error(`Recusado: ${API.origin} não é local. Dados de demonstração só em ambiente de desenvolvimento.`);
  process.exit(1);
}

// ---- prompts ---------------------------------------------------------------------------------

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo nothing while the password is typed.
      rl._writeToOutput = (text) => {
        if (text.startsWith(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

// ---- HTTP with a cookie jar per session ------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Session {
  cookies = new Map();

  async request(method, path, body) {
    for (;;) {
      const headers = { Accept: "application/json", Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (method !== "GET") headers["X-XSRF-TOKEN"] = this.cookies.get("XSRF-TOKEN") ?? "";
      const response = await fetch(new URL(path, API), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";");
        const index = pair.indexOf("=");
        const value = pair.slice(index + 1);
        if (value) this.cookies.set(pair.slice(0, index), value);
        else this.cookies.delete(pair.slice(0, index));
      }
      if (response.status === 429) {
        // The API limits sign-ins and invitation acceptance per address; wait out the window.
        process.stdout.write("  (limite de tentativas da API; aguardando 60 s)\n");
        await sleep(61_000);
        continue;
      }
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      return { status: response.status, data };
    }
  }

  async start() {
    await this.request("GET", "/api/auth/csrf");
    return this;
  }
}

async function expect(promise, what) {
  const { status, data } = await promise;
  if (status >= 400) throw new Error(`${what}: ${status} ${data?.title ?? ""} ${data?.detail ?? ""}`.trim());
  return data;
}

// ---- demo content ----------------------------------------------------------------------------

const PEOPLE = [
  ["Ana Souza", "financeiro"], ["Bruno Lima", "comercial"], ["Carla Mendes", "rh"],
  ["Diego Rocha", "operacoes"], ["Elisa Prado", "financeiro"], ["Fábio Nunes", "comercial"],
  ["Gabriela Costa", "operacoes"], ["Heitor Almeida", "auditoria"], ["Isabela Martins", "comercial"],
  ["João Pedro Ramos", "operacoes"], ["Karina Duarte", "rh"], ["Lucas Ferreira", "financeiro"],
  ["Mariana Teixeira", "comercial"], ["Nicolas Barros", "operacoes"], ["Olívia Cardoso", "rh"],
  ["Paulo Henrique Dias", "auditoria"], ["Renata Azevedo", "comercial"], ["Sérgio Moura", "operacoes"],
  ["Tatiane Freitas", "financeiro"], ["Vinícius Correia", "operacoes"], ["Yasmin Ribeiro", "comercial"],
  ["Rafael Pires", null],
];

const ROLES = {
  financeiro: {
    name: "Financeiro",
    description: "Acompanha pagamentos, contratos e tarefas da área financeira",
    permissions: (keys) => keys.filter((k) => k.startsWith("tasks.")),
  },
  comercial: {
    name: "Comercial",
    description: "Equipe de vendas e relacionamento com clientes",
    permissions: (keys) => keys.filter((k) => k.startsWith("tasks.") && !k.endsWith(".delete")),
  },
  rh: {
    name: "Pessoas (RH)",
    description: "Convida e acompanha colaboradores",
    permissions: (keys) => keys.filter((k) => k === "iam.user.read" || k === "iam.user.create" || k.startsWith("tasks.")),
  },
  operacoes: {
    name: "Operações",
    description: "Rotinas do dia a dia e uso do assistente",
    permissions: (keys) => keys.filter((k) => k.startsWith("tasks.") || k === "ai.chat.use"),
  },
  auditoria: {
    name: "Auditoria interna",
    description: "Leitura da trilha de auditoria e das contas",
    permissions: (keys) => keys.filter((k) => k.startsWith("audit.") || k === "iam.user.read" || k === "iam.role.read"),
  },
};

const TASKS = [
  ["Conciliar extratos bancários de setembro", "Conferir lançamentos do banco contra o sistema financeiro.", "financeiro", -4],
  ["Renovar contrato com fornecedor de TI", "Contrato vence no fim do mês; pedir proposta atualizada.", "financeiro", 6],
  ["Enviar proposta para a Construtora Horizonte", "Incluir desconto por volume aprovado na reunião.", "comercial", 1],
  ["Revisar funil de vendas do trimestre", null, "comercial", 9],
  ["Organizar integração dos novos colaboradores", "Três pessoas começam na segunda-feira.", "rh", 3],
  ["Atualizar política de home office", "Incorporar o feedback da pesquisa interna.", "rh", 15],
  ["Conferir backups da semana", "Validar restauração de um arquivo por servidor.", "operacoes", 0],
  ["Trocar certificado TLS do portal", "Certificado atual expira em 30 dias.", "operacoes", 21],
  ["Inventário de notebooks", "Registrar número de série e responsável de cada máquina.", "operacoes", -2],
  ["Revisar acessos de ex-colaboradores", "Desativar contas de quem saiu no último trimestre.", "auditoria", -1],
  ["Relatório trimestral de auditoria", "Consolidar eventos relevantes e exceções.", "auditoria", 12],
  ["Pagar fornecedores da quinzena", null, "financeiro", 2],
  ["Ligar para clientes com renovação em outubro", "Priorizar contas acima de R$ 50 mil.", "comercial", 5],
  ["Treinamento do novo portal", "Sessão de 1 hora para cada área.", "rh", 8],
  ["Planejar manutenção do ar-condicionado", null, "operacoes", 30],
  ["Atualizar cadastro de fornecedores", "Pedir documentos que estão vencidos.", "financeiro", -7],
  ["Fechar metas comerciais de novembro", null, "comercial", 18],
  ["Pesquisa de clima organizacional", "Montar questionário e definir prazo de resposta.", "rh", 25],
  ["Mapear processos de compras", "Desenhar o fluxo atual e pontos de aprovação.", "operacoes", 11],
  ["Checar logs de acesso fora do horário", null, "auditoria", 4],
  ["Emitir notas fiscais pendentes", null, "financeiro", -3],
  ["Atualizar apresentação institucional", "Novos cases e números de 2026.", "comercial", 14],
  ["Revisar benefícios para 2027", null, "rh", 40],
  ["Testar plano de continuidade", "Simular queda do servidor principal.", "operacoes", 35],
  ["Arquivar documentos de 2024", null, null, 20],
  ["Definir calendário de férias", null, "rh", 7],
  ["Negociar prazo com transportadora", null, "operacoes", -5],
  ["Preparar reunião de resultados", "Slides com receita, custos e próximos passos.", "financeiro", 9],
];

const TO_COMPLETE = new Set([0, 8, 10, 15, 20, 26, 5, 13]);

const pick = (list, index) => list[index % list.length];
const emailOf = (name) =>
  `${name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(" ")
    .filter((part, index, parts) => index === 0 || index === parts.length - 1)
    .join(".")}@${DOMAIN}`;
const strongPassword = () => `Demo-${randomBytes(18).toString("base64url")}`;
const isoDay = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

// ---- run -------------------------------------------------------------------------------------

async function signInAsAdministrator() {
  const email = process.env.OS_DEMO_EMAIL || (await ask("E-mail do administrador: "));
  const password = process.env.OS_DEMO_PASSWORD || (await ask("Senha: ", { hidden: true }));
  const admin = await new Session().start();
  await expect(admin.request("POST", "/api/auth/login", { email, password }), "Login");
  let me = await expect(admin.request("GET", "/api/me"), "Sessão");
  if (me.mfa.enabled && !me.mfa.verified) {
    const code = await ask("Código de verificação em duas etapas: ");
    await expect(admin.request("POST", "/api/auth/mfa", { code }), "Duas etapas");
    me = await expect(admin.request("GET", "/api/me"), "Sessão");
  }
  if (me.passwordChangeRequired) throw new Error("Troque a senha provisória no portal antes de rodar este script.");
  for (const needed of ["iam.role.create", "iam.user.create", "iam.user.roles.assign", "tasks.task.create"]) {
    if (!me.permissions.includes(needed)) throw new Error(`A conta precisa da permissão ${needed} (use um administrador).`);
  }
  console.log(`Conectado como ${me.name} em ${API.origin}.\n`);
  return { admin, me };
}

async function main() {
  const { admin, me } = await signInAsAdministrator();

  // Roles
  const catalog = await expect(admin.request("GET", "/api/iam/permissions"), "Catálogo");
  const allowed = catalog.filter((p) => !p.reserved).map((p) => p.key);
  const existingRoles = await expect(admin.request("GET", "/api/iam/roles"), "Roles");
  const roleIds = {};
  for (const [key, role] of Object.entries(ROLES)) {
    const found = existingRoles.find((r) => r.name === role.name);
    if (found) {
      roleIds[key] = found.id;
      continue;
    }
    const created = await expect(
      admin.request("POST", "/api/iam/roles", {
        name: role.name,
        description: role.description,
        permissions: role.permissions(allowed),
      }),
      `Role ${role.name}`,
    );
    roleIds[key] = created.id;
    console.log(`Role criada: ${role.name}`);
  }

  // People: most accept the invitation and sign in once; a few stay invited; two are disabled.
  const existingUsers = await expect(admin.request("GET", "/api/iam/users"), "Usuários");
  const people = [];
  let linkless = 0;
  for (const [index, [name, area]] of PEOPLE.entries()) {
    const email = emailOf(name);
    const found = existingUsers.find((u) => u.email === email);
    if (found) {
      people.push({ id: found.id, name, area, email, fresh: false });
      continue;
    }
    const issued = await expect(
      admin.request("POST", "/api/iam/users", { email, name, roleIds: area ? [roleIds[area]] : [] }),
      `Convite ${email}`,
    );
    const person = { id: issued.user.id, name, area, email, fresh: true };
    people.push(person);
    process.stdout.write(`Convidado: ${name}\n`);
    const staysInvited = index % 7 === 3;
    if (!issued.invitationLink) {
      linkless++;
      continue;
    }
    if (staysInvited) continue;
    const token = issued.invitationLink.slice(issued.invitationLink.lastIndexOf("/") + 1);
    const password = strongPassword();
    const visitor = await new Session().start();
    await expect(visitor.request("POST", "/api/iam/invitations/accept", { token, password }), `Aceite ${email}`);
    const login = await new Session().start();
    await expect(login.request("POST", "/api/auth/login", { email, password }), `Login ${email}`);
    // A couple of mistyped passwords, as happens in real life (well below the lockout threshold).
    if (index % 5 === 1) {
      const wrong = await new Session().start();
      await wrong.request("POST", "/api/auth/login", { email, password: "senha-digitada-errada" });
    }
  }
  if (linkless > 0) {
    console.log(`\n${linkless} convites foram por e-mail (SMTP configurado); essas pessoas ficam como convidadas.`);
  }
  for (const person of people.filter((p) => p.fresh && ["Nicolas Barros", "Lucas Ferreira"].includes(p.name))) {
    await expect(admin.request("POST", `/api/iam/users/${person.id}/disable`), `Desativar ${person.email}`);
    console.log(`Desativado: ${person.name}`);
  }

  // Tasks, assigned to people of the matching area (or to the administrator).
  const existingTasks = await expect(admin.request("GET", "/api/tasks"), "Tarefas");
  const titles = new Set(existingTasks.map((t) => t.title));
  let createdTasks = 0;
  for (const [index, [title, description, area, due]] of TASKS.entries()) {
    if (titles.has(title)) continue;
    const candidates = people.filter((p) => p.area === area);
    const assigneeId = area === null ? null : index % 6 === 0 ? me.id : (pick(candidates, index)?.id ?? me.id);
    const task = await expect(
      admin.request("POST", "/api/tasks", { title, description, assigneeId, dueDate: isoDay(due) }),
      `Tarefa ${title}`,
    );
    createdTasks++;
    if (TO_COMPLETE.has(index)) await expect(admin.request("POST", `/api/tasks/${task.id}/complete`), `Concluir ${title}`);
  }

  console.log(
    `\nPronto: ${people.filter((p) => p.fresh).length} pessoas novas, ${Object.keys(roleIds).length} roles, ${createdTasks} tarefas novas.`,
  );
  console.log(`As contas de demonstração usam o domínio ${DOMAIN} e senhas aleatórias descartadas.`);
}

main().catch((error) => {
  console.error(`\nFalhou: ${error.message}`);
  process.exit(1);
});
