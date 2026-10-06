-- Load-test data for a LOCAL, EMPTY-BUT-MIGRATED database (see scripts/perf/README.md).
-- Volumes are variables so the same script covers a small company and a large one:
--   psql -v users=5000 -v roles=30 -v tasks=200000 -v events=3000000 -v idfn=uuidv7 -f seed.sql
-- idfn is the function that generates ids: uuidv7 (what the API uses) or gen_random_uuid (v4).
-- Nothing here is meant for a real instance: passwords are empty and e-mails are fake.

\set ON_ERROR_STOP on
\if :{?users}   \else \set users 5000 \endif
\if :{?roles}   \else \set roles 30 \endif
\if :{?tasks}   \else \set tasks 200000 \endif
\if :{?events}  \else \set events 3000000 \endif
\if :{?idfn}    \else \set idfn uuidv7 \endif

SET maintenance_work_mem = '512MB';
SET synchronous_commit = off;

CREATE TEMP TABLE first_names (n int, v text);
INSERT INTO first_names SELECT ordinality, v FROM unnest(ARRAY['Ana','Bruno','Carla','Diego','Elisa','Fábio',
  'Gabriela','Heitor','Isabela','João','Karina','Lucas','Mariana','Nicolas','Olívia','Paulo','Renata','Sérgio',
  'Tatiane','Vinícius','Yasmin','Rafael','Beatriz','Caio','Daniela','Eduardo','Fernanda','Gustavo','Helena','Igor'])
  WITH ORDINALITY AS t(v, ordinality);
CREATE TEMP TABLE last_names (n int, v text);
INSERT INTO last_names SELECT ordinality, v FROM unnest(ARRAY['Silva','Souza','Oliveira','Santos','Lima','Pereira',
  'Costa','Rodrigues','Almeida','Nascimento','Carvalho','Araújo','Ribeiro','Martins','Rocha','Mendes','Barros',
  'Freitas','Moura','Teixeira'])
  WITH ORDINALITY AS t(v, ordinality);

-- People: mostly active, some invited, disabled and locked; 60 % with a second factor.
INSERT INTO users (id, email, name, password_hash, status, failed_login_attempts, locked_until, last_login_at,
                   created_at, updated_at, password_change_required)
SELECT :idfn(),
       lower(translate(f.v || '.' || l.v, 'áéíóúâêôãõçÁÉÍÓÚ', 'aeiouaeoaocAEIOU')) || g || '@empresa' || (g % 7) || '.com.br',
       f.v || ' ' || l.v,
       NULL,
       CASE WHEN g % 20 = 0 THEN 'INVITED' WHEN g % 33 = 0 THEN 'DISABLED' ELSE 'ACTIVE' END,
       0,
       CASE WHEN g % 50 = 0 THEN now() + interval '10 minutes' END,
       CASE WHEN g % 20 = 0 THEN NULL ELSE now() - (g % 90) * interval '1 day' END,
       now() - interval '800 days' + g * interval '2 hours', now(), false
FROM generate_series(1, :users) g
JOIN first_names f ON f.n = 1 + g % 30
JOIN last_names l ON l.n = 1 + (g / 30) % 20;

INSERT INTO user_mfa (user_id, secret, enabled_at, created_at, updated_at)
SELECT id, 'perf-not-a-secret', now(), now(), now()
FROM users WHERE status = 'ACTIVE' AND hashtext(id::text) % 5 < 3 AND email NOT LIKE 'admin@%';

INSERT INTO roles (id, name, description, is_system, created_at, updated_at)
SELECT :idfn(), 'Equipe ' || g, 'Role de carga ' || g, false, now(), now() FROM generate_series(1, :roles) g;
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p FROM roles r CROSS JOIN unnest(ARRAY['tasks.task.read','tasks.task.create','tasks.task.update',
  'iam.user.read']) p WHERE NOT r.is_system;

CREATE TEMP TABLE people AS SELECT row_number() OVER (ORDER BY id) AS n, id, email FROM users;
CREATE TEMP TABLE teams AS SELECT row_number() OVER (ORDER BY id) AS n, id FROM roles WHERE NOT is_system;
INSERT INTO user_roles (user_id, role_id)
SELECT p.id, t.id FROM people p JOIN teams t ON t.n = 1 + p.n % :roles
ON CONFLICT DO NOTHING;

-- Tasks: 40 % open, due dates around today, most with an assignee.
INSERT INTO tasks (id, title, description, status, assignee_id, due_date, completed_at, created_at, updated_at)
SELECT :idfn(),
       (ARRAY['Revisar contrato','Conciliar extratos','Preparar reunião','Atualizar cadastro','Enviar proposta',
              'Treinamento','Inventário','Renovar certificado','Pagar fornecedores','Planejar manutenção'])[1 + g % 10]
         || ' ' || g,
       CASE WHEN g % 3 = 0 THEN NULL ELSE 'Descrição da tarefa ' || g || ' com detalhes para a equipe.' END,
       CASE WHEN g % 5 < 2 THEN 'OPEN' ELSE 'DONE' END,
       CASE WHEN g % 9 = 0 THEN NULL ELSE p.id END,
       CASE WHEN g % 7 = 0 THEN NULL ELSE current_date + ((g % 120) - 60) END,
       CASE WHEN g % 5 >= 2 THEN now() - (g % 60) * interval '1 day' END,
       now() - interval '730 days' + g * (interval '730 days' / :tasks), now() - (g % 30) * interval '1 day'
FROM generate_series(1, :tasks) g
JOIN people p ON p.n = 1 + (hashint4(g) & 2147483647) % :users;

-- Audit trail: two years of events in time order (as the API appends them), 10 % without an actor
-- (system), a correlation id shared by about three events, entities that exist.
CREATE TEMP TABLE task_ids AS SELECT row_number() OVER () AS n, id FROM tasks;
INSERT INTO audit_event (id, occurred_at, actor_id, actor_email, origin, action, entity_type, entity_id, details, ip,
                         correlation_id)
SELECT :idfn(), s.ts,
       CASE WHEN s.g % 10 = 0 THEN NULL ELSE p.id END,
       CASE WHEN s.g % 10 = 0 THEN NULL ELSE p.email END,
       CASE WHEN s.g % 10 = 0 THEN 'SYSTEM' WHEN s.g % 10 < 3 THEN 'AI_TOOL' ELSE 'REST' END,
       (ARRAY['auth.login.success','auth.login.success','auth.login.failure','iam.user.renamed','iam.user.invited',
              'iam.role.updated','tasks.task.created','tasks.task.updated','tasks.task.completed',
              'tasks.task.deleted','ai.tool.executed','auth.session.terminated','privacy.data.exported',
              'audit.exported'])[1 + (hashint4(s.g * 7) & 2147483647) % 14],
       CASE WHEN s.g % 3 = 0 THEN 'task' ELSE 'user' END,
       CASE WHEN s.g % 3 = 0 THEN t.id::text ELSE p.id::text END,
       '{"perf": true}',
       '10.0.' || (s.g % 250) || '.' || (s.g % 200),
       'perf-' || (s.g / 3)
FROM (SELECT g, now() - interval '730 days' + g * (interval '730 days' / :events) AS ts
      FROM generate_series(1, :events) g) s
JOIN people p ON p.n = 1 + (hashint4(s.g) & 2147483647) % :users
JOIN task_ids t ON t.n = 1 + (hashint4(s.g + 1) & 2147483647) % :tasks
ORDER BY s.g;

VACUUM ANALYZE;
