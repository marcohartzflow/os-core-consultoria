#!/usr/bin/env node
// Times the API listings a person uses every day against a LOCAL instance loaded by seed.sql, and
// prints median, p95 and minimum per scenario. See scripts/perf/README.md.
//
//   node scripts/perf/run.mjs --api http://localhost:18090 --params params.json --out result.json
//
// Signs in with OS_PERF_EMAIL / OS_PERF_PASSWORD (an administrator without a second factor, which
// only a local instance started with the flags in the README has). Refuses any host but localhost.

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const API = new URL(arg("--api", "http://localhost:18090"));
if (!["localhost", "127.0.0.1", "[::1]"].includes(API.hostname)) {
  console.error(`Recusado: ${API.origin} não é local.`);
  process.exit(1);
}
const P = JSON.parse(readFileSync(arg("--params"), "utf8"));
const RUNS = Number(arg("--runs", "20"));
const WARMUP = Number(arg("--warmup", "3"));
const ONLY = arg("--only", "");

const cookies = new Map();
async function request(method, path, body) {
  const headers = { Accept: "application/json, text/csv", Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-XSRF-TOKEN"] = cookies.get("XSRF-TOKEN") ?? "";
  const response = await fetch(new URL(path, API), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const text = await response.text();
  if (response.status >= 400) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return text;
}

const q = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) search.append(key, item);
  }
  return `?${search}`;
};

// One entry per screen action. The audit listing is newest first and pages with a cursor: the
// "deep" scenario asks for the events before a point two years back, as the "go to date" does.
const SCENARIOS = [
  ["audit: primeira página", `/api/audit/events${q({ size: 50 })}`],
  ["audit: página funda (100 mil eventos atrás)", `/api/audit/events${q({ size: 50, to: P.deepTo })}`],
  ["audit: página seguinte (cursor)", async () => `/api/audit/events${q({ size: 50, after: await firstNext() })}`],
  ["audit: página mais antiga", `/api/audit/events${q({ size: 50, oldest: "true" })}`],
  ["audit: e-mail contém (existe)", `/api/audit/events${q({ size: 50, actorEmail: P.actorEmailPart })}`],
  ["audit: e-mail contém (não existe)", `/api/audit/events${q({ size: 50, actorEmail: "naoexiste" })}`],
  ["audit: por pessoa (actorId)", `/api/audit/events${q({ size: 50, actorId: P.actorId })}`],
  ["audit: por entidade", `/api/audit/events${q({ size: 50, entityType: "user", entityId: P.entityId })}`],
  ["audit: ação rara (privacy.)", `/api/audit/events${q({ size: 50, action: "privacy." })}`],
  ["audit: ação inexistente", `/api/audit/events${q({ size: 50, action: "nada." })}`],
  ["audit: origem AI_TOOL", `/api/audit/events${q({ size: 50, origin: "AI_TOOL" })}`],
  ["audit: últimos 7 dias", `/api/audit/events${q({ size: 50, from: P.weekAgo })}`],
  ["audit: mesma requisição", `/api/audit/events${q({ size: 50, correlationId: P.correlationId })}`],
  ["audit: exportar CSV (10 mil)", `/api/audit/events.csv`],
  ["painel: atividade 90 dias", `/api/audit/activity${q({ days: 90, zone: "America/Sao_Paulo" })}`],
  ["painel: eventos recentes", `/api/audit/events${q({ size: 6 })}`],
  ["usuários: primeira página", `/api/iam/users${q({ size: 20 })}`],
  ["usuários: busca (silva)", `/api/iam/users${q({ size: 20, q: P.userSearch })}`],
  ["usuários: busca sem resultado", `/api/iam/users${q({ size: 20, q: "zzzz" })}`],
  ["usuários: bloqueados", `/api/iam/users${q({ size: 20, state: "LOCKED" })}`],
  ["usuários: por role", `/api/iam/users${q({ size: 20, roleId: P.roleId })}`],
  ["usuários: sem duas etapas", `/api/iam/users${q({ size: 20, mfa: "false" })}`],
  ["usuários: 100 por página", `/api/iam/users${q({ size: 100 })}`],
  ["tarefas: primeira página", `/api/tasks${q({ size: 20 })}`],
  ["tarefas: 100 por página", `/api/tasks${q({ size: 100 })}`],
  ["tarefas: busca (contrato)", `/api/tasks${q({ size: 20, q: "contrato" })}`],
  ["tarefas: busca sem resultado", `/api/tasks${q({ size: 20, q: "zzzz" })}`],
  ["tarefas: por responsável", `/api/tasks${q({ size: 20, assigneeId: P.assigneeId })}`],
  ["tarefas: atrasadas", `/api/tasks${q({ size: 20, status: "OPEN", dueBefore: P.today })}`],
  ["tarefas: página 5000", `/api/tasks${q({ size: 20, page: 5000 })}`],
  ["roles: lista", `/api/iam/roles${q({ size: 20 })}`],
];

let next;
/** Position of the second page of the trail, read once. */
async function firstNext() {
  next ??= JSON.parse(await request("GET", `/api/audit/events${q({ size: 50 })}`)).next;
  return next;
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

await request("GET", "/api/auth/csrf");
await request("POST", "/api/auth/login", {
  email: process.env.OS_PERF_EMAIL ?? "admin@example.com",
  password: process.env.OS_PERF_PASSWORD ?? (console.error("Defina OS_PERF_PASSWORD."), process.exit(1)),
});

const results = [];
for (const [name, target] of SCENARIOS) {
  if (ONLY && !name.includes(ONLY)) continue;
  const path = typeof target === "function" ? await target() : target;
  const times = [];
  let bytes = 0;
  for (let i = 0; i < WARMUP + RUNS; i++) {
    const start = performance.now();
    const body = await request("GET", path);
    const elapsed = performance.now() - start;
    if (i >= WARMUP) times.push(elapsed);
    bytes = body.length;
  }
  times.sort((a, b) => a - b);
  const row = { name, path, p50: percentile(times, 50), p95: percentile(times, 95), min: times[0], bytes };
  results.push(row);
  console.log(`${name.padEnd(46)} p50 ${row.p50.toFixed(1).padStart(8)} ms   p95 ${row.p95.toFixed(1).padStart(8)} ms`);
}
const out = arg("--out");
if (out) writeFileSync(out, JSON.stringify(results, null, 2));
