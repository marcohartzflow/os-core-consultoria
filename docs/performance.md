# Desempenho das listagens

Como o portal se mantém rápido quando as tabelas crescem, o que foi medido e as regras para quem cria módulos num fork. A trilha de auditoria é o caso extremo: só recebe inserções, precisa ser guardada por anos (LGPD art. 37) e chega a dezenas de milhões de linhas.

## Resultado medido (2026-09-30)

Carga: 3 milhões de eventos de auditoria (2 anos), 5.000 pessoas, 200.000 tarefas, 30 roles. PostgreSQL 18 local, API real por HTTP, mediana de 20 execuções após 3 de aquecimento (`scripts/perf`). Os ~8 ms de piso são HTTP, sessão e serialização.

| Cenário | Antes (ms) | Depois (ms) | Ganho |
|---|---:|---:|---:|
| audit: primeira página | 153.4 | 14.1 | 10.9× |
| audit: página funda (100 mil eventos atrás) | 178.8 | 12.9 | 13.9× |
| audit: página seguinte (cursor) | — | 12.2 | novo |
| audit: página mais antiga | — | 13.1 | novo |
| audit: e-mail contém (existe) | 627.6 | 42.9 | 14.6× |
| audit: e-mail contém (não existe) | 518.9 | 9.9 | 52.5× |
| audit: por pessoa (actorId) | 9.4 | 11.2 | 0.8× |
| audit: por entidade | 9.1 | 10.7 | 0.9× |
| audit: ação rara (privacy.) | 117.7 | 10.1 | 11.6× |
| audit: ação inexistente | 232.4 | 8.8 | 26.3× |
| audit: origem AI_TOOL | 109.8 | 27.2 | 4.0× |
| audit: últimos 7 dias | 9.1 | 8.7 | 1.1× |
| audit: mesma requisição | 216.4 | 7.5 | 28.8× |
| audit: exportar CSV (10 mil) | 191.0 | 35.0 | 5.5× |
| painel: atividade 90 dias | 142.8 | 12.6 | 11.3× |
| painel: eventos recentes | 146.5 | 7.5 | 19.6× |
| usuários: primeira página | 10.0 | 11.8 | 0.8× |
| usuários: busca (silva) | 13.2 | 13.8 | 1.0× |
| usuários: busca sem resultado | 8.8 | 8.9 | 1.0× |
| usuários: bloqueados | 9.3 | 8.2 | 1.1× |
| usuários: por role | 10.2 | 8.8 | 1.2× |
| usuários: sem duas etapas | 10.3 | 9.7 | 1.1× |
| usuários: 100 por página | 12.4 | 11.4 | 1.1× |
| tarefas: primeira página | 33.6 | 23.6 | 1.4× |
| tarefas: 100 por página | 32.4 | 23.2 | 1.4× |
| tarefas: busca (contrato) | 109.1 | 16.9 | 6.5× |
| tarefas: busca sem resultado | 58.8 | 6.0 | 9.8× |
| tarefas: por responsável | 6.5 | 6.8 | 1.0× |
| tarefas: atrasadas | 12.7 | 8.4 | 1.5× |
| tarefas: página 5000 | 112.8 | 51.3 | 2.2× |
| roles: lista | 8.8 | 9.0 | 1.0× |

Antes, o tempo da auditoria crescia com o tamanho da tabela (contagem exata e varreduras); depois, cada página custa o mesmo com 3 ou 300 milhões de eventos, exceto a contagem, limitada a 10.000. "Por pessoa" e "por entidade" ficaram ~1,5 ms mais lentos porque agora também contam (até 10.000) para mostrar o total; usuários e roles já eram rápidos e ficaram iguais (diferenças dentro do ruído).

Custo, na mesma carga:

| | Antes | Depois |
|---|---:|---:|
| `audit_event` total (tabela + índices) | 914 MB | 1.679 MB |
| 20.000 inserções de evento, uma por comando | 1,74 s | 1,45 s |

Os índices novos quase dobram o espaço da auditoria; a escrita ficou mais rápida mesmo com mais índices, porque ids UUIDv7 entram no fim do índice em vez de em páginas aleatórias. Atualizar um banco existente com 3 milhões de eventos levou 45 s (V12 2 s, V13 43 s), sem bloquear a escrita.

## O que foi feito e por quê

**Paginação por posição na auditoria.** `GET /api/audit/events` responde `{content, next, previous, total, totalExact}` e aceita `after`, `before` ou `oldest=true` no lugar de `page`/`sort`. A página lê o índice a partir da posição, então a página 1.000 custa o mesmo que a primeira. A ordem é sempre a mais recente primeiro, `(occurred_at DESC, id DESC)`, com o desempate na mesma direção para um único índice servir a ordem e a posição. A condição é escrita como `occurred_at <= t AND (occurred_at < t OR (occurred_at = t AND id < i))`: sem o primeiro termo, o PostgreSQL não usa o índice para começar e lê tudo o que vem antes (medido: 1,1 s contra 0,02 ms). Por isso não se usa o `Window`/`ScrollPosition` do Spring Data, que gera a forma sem esse termo.

**Contagem limitada.** `SELECT count(*) FROM (SELECT ... LIMIT 10001)`: exata até 10.000, depois "Mais de 10.000 eventos". Contar tudo custava 150 ms por página com 3 milhões de linhas e cresce com a tabela.

**Índices que casam com as consultas** (V13):

| Índice | Serve |
|---|---|
| `audit_event (occurred_at DESC, id DESC)` | listagem, posição, período |
| `audit_event (actor_id, occurred_at DESC)` parcial | "eventos desta pessoa" |
| `audit_event (entity_id, occurred_at DESC)` parcial | "eventos desta entidade" e o detalhe do usuário |
| `audit_event (action text_pattern_ops)` | prefixo de ação (`LIKE 'x%'`) |
| `audit_event (correlation_id)` parcial | "mesma requisição" |
| `audit_event USING gin (lower(actor_email) gin_trgm_ops)` | "e-mail contém" |
| `tasks (status DESC, due_date NULLS LAST, created_at, id)` | ordem padrão das tarefas |
| `tasks USING gin (lower(title))`, `(lower(description))` trigram | busca de tarefas |

Coluna filtrada primeiro, depois a ordem da lista: as linhas saem prontas do índice em vez de serem coletadas e ordenadas. A expressão do índice é a mesma da consulta (`lower(coluna)`); `lower(coalesce(descricao, ''))` na consulta não usaria o índice de `lower(descricao)`.

**"E-mail contém" com no mínimo 3 caracteres.** O índice trigram não ajuda com menos (medido: 364 ms com 2 letras). A API responde 400 abaixo disso. Na tela, "Quem" escolhe a pessoa (filtro exato por `actorId`, índice próprio) e o "e-mail contém" fica para endereços sem conta, como tentativas de login.

**Totais do painel pré-somados** (V12, `audit_activity_bucket`). O gráfico lê totais de 15 minutos em vez dos eventos; 15 minutos porque todo fuso horário tem deslocamento múltiplo de 15 minutos, e o gráfico agrupa por dia no fuso de quem vê. Antes de ler, a API reconta a partir da última hora já somada (um evento gravado um pouco depois da sua hora ainda entra). Custo constante, qualquer que seja o volume do período.

**Ids UUIDv7** (`@UuidGenerator(style = VERSION_7)`) em todas as entidades. Ordenados pelo tempo: inserção no fim do índice, índice menor e escrita mais barata que o UUID aleatório.

**Chave primária `(id, occurred_at)` na auditoria.** Tabela particionada exige a chave de partição em toda restrição única; já no formato, particionar depois não reconstrói esse índice.

**Plano por execução.** Depois de 5 execuções o driver JDBC prepara o comando no servidor e o PostgreSQL pode passar a um plano genérico, que não enxerga o valor do `LIKE` nem a raridade de um filtro. Medido: 0,04 ms virou 1,3 s. O pool abre cada conexão com `SET plan_cache_mode = force_custom_plan` (planejar custa ~0,1 ms).

**Proteções** (`application.yml`):
- `statement_timeout = 15s` no pool, para nenhuma consulta prender conexão e banco; as migrations rodam sem limite (`spring.flyway.init-sqls`), e as conexões que elas usaram são descartadas ao fim (`FlywayConfig`), para nenhuma voltar ao pool sem o limite.
- `hibernate.log_slow_query: 500`, que loga em `org.hibernate.SQL_SLOW` com o SQL.
- `hibernate.query.fail_on_pagination_over_collection_fetch`: paginar com fetch de coleção é erro, não carga silenciosa na memória.
- `hibernate.default_batch_fetch_size: 100`: coleções de uma página em uma consulta.
- Autovacuum da auditoria depois de 2% de inserções, em vez de 20%.

## Regras para listagens novas

1. Toda consulta de lista tem um índice que começa pelas colunas filtradas por igualdade e termina na ordem da lista, com as mesmas direções. Confira com `EXPLAIN (ANALYZE, BUFFERS)` numa carga realista (`scripts/perf`), não numa tabela vazia.
2. Tabela que só cresce (log, eventos, histórico) pagina por posição e conta com limite, como a auditoria. Tabela de cadastro (pessoas, roles, tarefas de uma equipe) pode usar `page`/`PagedModel`.
3. Busca "contém" em tabela grande: índice trigram em `lower(coluna)`, consulta com `lower(coluna)` e mínimo de 3 caracteres. Busca por prefixo: índice `text_pattern_ops`. Nada de `citext` nem busca de texto completo para e-mail.
4. Limite inferior de consulta vem como parâmetro, não subconsulta: com subconsulta o planejador não estima quantas linhas ela seleciona e pode varrer a tabela (aconteceu no painel: 350 ms em vez de 1 ms).
5. Índice novo em tabela que já tem dados: migration só com `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, fora de transação (arquivo `.sql.conf` com `executeInTransaction=false`, como `V13__listing_indexes.sql`).
6. Não crie índice "por via das dúvidas": cada um custa espaço e escrita. Um GIN em `details` (jsonb) só com consulta real que o use.

## Se uma migration de índice falhar

`CREATE INDEX CONCURRENTLY` que falha deixa o índice inválido, e ele continua custando escrita. Encontre e apague, marque a migration como pendente e suba a aplicação de novo:

```sql
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
DROP INDEX CONCURRENTLY <indice>;
```

Depois, `flyway repair` (Flyway CLI, com a mesma URL e usuário da aplicação) e suba a aplicação.

Toda instrução da V13 usa `IF NOT EXISTS`/`IF EXISTS`, então repetir é seguro. A troca da chave primária desiste depois de 5 s esperando o travamento da tabela (uma transação longa aberta); nesse caso basta subir de novo.

Os totais do painel (`audit_activity_bucket`) só recontam a partir da última hora já somada. Depois de importar eventos antigos direto no banco, esvazie a tabela (`TRUNCATE audit_activity_bucket`): a próxima leitura do painel reconta os últimos 91 dias.

## Quando particionar a auditoria

Não agora: com poucos milhões de linhas a partição só acrescenta custo (toda consulta sem filtro de data visita todas as partições). A regra da documentação do PostgreSQL é quando tabela e índices passam da memória do servidor; na prática, algo entre 50 e 100 milhões de eventos, ou antes disso se a retenção exigir descartar meses antigos. O caminho, já preparado pela chave `(id, occurred_at)`:

1. Criar `audit_event_p` particionada por mês em `occurred_at`, com as mesmas colunas e índices.
2. Adicionar à tabela atual um `CHECK` de intervalo de `occurred_at` validado (assim o `ATTACH` não varre a tabela) e anexá-la como partição histórica.
3. Um job que cria as partições dos próximos meses e monitora a partição padrão.
4. `ANALYZE audit_event` agendado: o autovacuum não analisa a tabela pai de uma particionada.
5. Imutabilidade por permissão: gatilho de `TRUNCATE` na tabela pai não protege partições, e `DETACH`/`DROP` não disparam gatilhos. O usuário da aplicação não pode ser dono da tabela nem ter `TRUNCATE`.
6. Arquivar e conferir antes de descartar qualquer partição: a retenção é obrigação legal.

## Medindo num fork

`scripts/perf/README.md`: sobe uma API local sobre um banco de carga, preenche com o volume que você quiser e mede as mesmas telas. Rode antes e depois de mudar uma consulta ou um índice.
