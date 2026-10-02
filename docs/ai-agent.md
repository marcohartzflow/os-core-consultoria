# Agente de IA

O diferencial do OS é que todo o sistema é operável pelo agente, e o agente só consegue fazer o que o usuário logado pode fazer. Este documento define como isso funciona no módulo `ai`.

Estado (2026-10-02): implementado no `os-core` conforme abaixo. Classes: `ToolRegistry`, `AuditedToolCallback`, `ConfirmingToolCallback`, `AgentService`, `PendingActionService`, `ConversationService`, `AiController`. Tools no `iam`: `iam_list_users`, `iam_get_user`, `iam_list_roles` e `iam_disable_user` (pede confirmação). Tool no `common`: `audit_search`. Tools do módulo de exemplo `tasks`: `tasks_list`, `tasks_get`, `tasks_create`, `tasks_complete` e `tasks_delete` (as três últimas pedem confirmação). A resposta chega token a token (evento `token`), intercalada com `tool_call`, `tool_failed`, `action_pending` e `ui_action`; `done` traz o texto completo.

## Princípios

1. **Use case é a única fonte de verdade.** REST e agente chamam o mesmo método. Não existe código de negócio só para a IA.
2. **Autorização do usuário, não do sistema.** Tool roda com o `SecurityContext` do usuário da conversa.
3. **Dupla barreira.** O modelo só recebe tools permitidas, e a execução verifica de novo. Filtro no catálogo não basta porque o modelo pode alucinar um nome.
4. **Toda ação que altera dado pede confirmação humana.** Só a leitura roda direto.
5. **Tudo auditado.**

## Como um use case vira tool

```java
@Service
class CreateUserUseCase {

    @Tool(description = "Cria um usuário e envia convite por e-mail. Use quando o usuário pedir para cadastrar ou convidar alguém.")
    @RequiresPermission("iam.user.create")
    @RequiresConfirmation("Convida a pessoa abaixo para o portal")
    @Transactional
    public UserSummary execute(
            @ToolParam(description = "E-mail corporativo do convidado") String email,
            @ToolParam(description = "Nome completo") String name,
            @ToolParam(description = "Ids das roles iniciais") List<UUID> roleIds) {
        // regra de negócio
    }
}
```

- `@Tool` e `@ToolParam` são do Spring AI (`org.springframework.ai.tool.annotation`). A descrição é o que o modelo lê; escreva para o modelo, não para o desenvolvedor.
- `@RequiresPermission` é a meta-anotação do projeto sobre `@PreAuthorize("hasAuthority('{value}')")`, habilitada por `@EnableMethodSecurity` e `AnnotationTemplateExpressionDefaults`.
- Toda `@Tool` declara exatamente uma de duas anotações do projeto (`common.security`): `@ReadOnlyTool` quando só lê, ou `@RequiresConfirmation("frase mostrada na confirmação")` quando altera qualquer coisa. Sem uma delas, ou com as duas, ou com a frase vazia, o boot falha (`ToolRegistry`).
- O controller REST é fino e chama `execute(...)`. O agente também.

## Registry e filtro por permissão

`ToolRegistry` (bean em `ai`) roda no boot:

1. Percorre os beans do contexto, encontra métodos com `@Tool`.
2. Para cada um, constrói um `MethodToolCallback` via `MethodToolCallback.builder().toolDefinition(ToolDefinitions.from(method)).toolMetadata(ToolMetadata.from(method)).toolMethod(method).toolObject(bean)`. Tool `@ReadOnlyTool` é embrulhada em `ReadOnlyTransactionToolCallback` (ver "Tools de leitura").
3. Guarda junto a permissão exigida (lida de `@RequiresPermission`) e se pede confirmação, com a frase (`RegisteredTool`).
4. Falha o boot se algum `@Tool` não tiver `@RequiresPermission`, se exigir permissão reservada, se não declarar `@ReadOnlyTool` ou `@RequiresConfirmation`, se o nome se repetir, se a tool estiver no próprio módulo `ai` ou se uma `@ReadOnlyTool` tiver `@Transactional` com `REQUIRES_NEW` ou `NOT_SUPPORTED` (escaparia da transação somente leitura).

Por requisição de chat, `AgentService`:

1. Lê as `GrantedAuthority` do usuário atual.
2. Seleciona do registry só as tools cuja permissão o usuário tem.
3. Chama `chatClient.prompt().user(msg).tools(permitidas).toolContext(Map.of("conversationId", id)).advisors(a -> a.param(ChatMemory.CONVERSATION_ID, id)).stream().chatResponse().toStream()`, repassa o texto de cada `ChatResponse` como token e guarda o último `Usage` não vazio dos metadados (ver "Limites de consumo"). O usuário vem do `SecurityContext`, repassado a cada tool call por `ContextPropagatingToolCallback`. Fechar o stream cancela a chamada ao modelo: o turno para quando o cliente desconecta ou o `os.ai.turn-timeout` vence.

O `ToolCallingManager` é configurado com `resolutionFallbackEnabled(false)` (padrão), `maxCallsPerTool` e `maxTotalToolCalls`. O fallback por nome ficaria acessível a qualquer tool do contexto, o que quebraria o filtro.

## Enforcement na execução

Mesmo com o catálogo filtrado, o método do use case tem `@RequiresPermission`. Se o modelo tentar chamar uma tool fora da lista (o Spring AI já rejeita nome desconhecido), ou se a permissão do usuário mudar no meio da conversa, a chamada cai em `AccessDeniedException`.

O `MethodToolCallback` do Spring AI embrulha toda exceção do use case em `ToolExecutionException`. `AuditedToolCallback` desembrulha a causa (`ToolFailures.unwrap`, o mesmo usado por `PendingActionService`) antes de classificar: a trilha (`ai.tool.failed`, campo `reason`) e o log `SECURITY` recebem a classe real (`AccessDeniedException`, `NotFoundException`...); uma negação vai ao log como `ai tool denied tool=... rule=hasAuthority('...')`. O que o modelo lê vem do nosso `ToolExecutionExceptionProcessor` (`SafeToolExceptionProcessor`, bean em `AiConfig`; a auto-configuração do Spring AI recua com `@ConditionalOnMissingBean`): a mensagem de `DomainRuleException`, `NotFoundException`, `ConflictException` e `InvalidRequestException`, "sem permissão" para `AccessDeniedException` e "erro interno" para qualquer outra coisa. O processador padrão do Spring AI devolveria a mensagem da exceção, que pode trazer SQL ou nome de constraint (OWASP LLM02). A pessoa vê o mesmo texto no evento `tool_failed`.

O `SecurityContext` precisa estar presente na thread que executa a tool. O turno roda em uma virtual thread (`DelegatingSecurityContextRunnable` no `AiController`), mas em streaming (`ChatClient.stream()`) o Spring AI executa as tools em threads do Reactor. `ContextPropagatingToolCallback` captura `SecurityContext`, escopo do `AuditContext`, listener de `ToolEvents`, IP do cliente e MDC no início do turno e os restabelece em volta de cada chamada, em qualquer thread, limpando depois. `ContextPropagatingToolCallbackTests` prova isso.

A origem do turno vem da requisição (ASVS 16.2.1). O `AiController` lê na thread da requisição o IP (`getRemoteAddr()`, já o do cliente depois do proxy confiável), o id da requisição (`X-Request-Id`) e o MDC, e a thread do turno abre `AuditContext.with(REST, idDaRequisição, ip, ...)` com o MDC copiado. Assim `ai.turn.started` e `ai.turn.ended` saem com origem `REST` (foi uma chamada REST da pessoa), o IP dela e o id da requisição como `correlationId`, e as linhas de log do turno têm `http.request.id` e `client.ip`. Dentro de cada tool call a origem passa a `AI_TOOL` com o id da conversa, e o IP continua o da pessoa.

## Confirmação humana

Tool marcada com `@RequiresConfirmation` não executa na primeira passada:

1. Registry registra a tool com um wrapper. Quando o modelo a chama, o wrapper grava uma `PendingAction` (tool, argumentos, usuário, conversa, expira em 5 min) e devolve ao modelo "ação aguardando confirmação do usuário, id X".
2. O front recebe um evento SSE tipado `action_pending` com a frase e os argumentos exatos da chamada, e mostra os dois com o botão de confirmar.
3. `POST /api/ai/actions/{id}/confirm` verifica que o usuário é o mesmo, que não expirou, executa o use case real (passando de novo pela autorização) e grava auditoria. Se a tool não existe mais (removida numa versão nova entre propor e confirmar), a ação, já reivindicada como `EXECUTING`, vira `FAILED` com a nota na conversa e `ai.action.failed` na trilha, e a resposta é 422 "Ferramenta não existe mais".
4. Recusa ou expiração também são auditadas. A expiração acontece de dois jeitos, com o mesmo `UPDATE` atômico e a mesma ação `ai.action.expired`: quando alguém tenta confirmar tarde (como a pessoa) e a cada 5 minutos pelo `PendingActionCleanup` (como sistema), para nenhuma ação ficar `PENDING` para sempre.
5. Ações resolvidas (confirmada, recusada, expirada, falha) são apagadas com os argumentos depois de 90 dias (`PendingActionCleanup.RETENTION`; conversas não têm retenção própria). Se a frase do desfecho ainda faz parte da conversa (`note`), a linha fica, sem argumentos nem resultado, até a conversa ser apagada, porque é por ela que a tela esconde a frase do portal. Ação presa em `EXECUTING` por queda fica como evidência. A trilha guarda o histórico.
6. A exportação de dados pessoais (LGPD art. 18 II) traz, em cada conversa, as ações propostas: tool, frase, argumentos, status e datas. Resultado e nota ficam de fora.

Qualquer escrita, por menor que seja (criar, concluir, editar, apagar, enviar), é `@RequiresConfirmation`. `@ReadOnlyTool` só para o que não muda nada.

Gestão de acesso nunca é tool: um use case com permissão reservada (`@RequiresPermission(reserved = true)`, como atribuir roles, redefinir segundo fator ou anonimizar) não pode ter `@Tool`, e o boot falha se tiver. Assim, uma injeção de prompt vinda de dados nunca alcança quem acessa o quê, nem na conversa de um administrador.

## Tools de leitura

`@ReadOnlyTool` é imposto, não confiado (OWASP LLM06). O `ToolRegistry` embrulha toda tool de leitura em `ReadOnlyTransactionToolCallback`, que roda a chamada num `TransactionTemplate` com `readOnly = true` e `PROPAGATION_REQUIRED`. Com JPA, o `JpaTransactionManager` (via `HibernateJpaDialect`) marca a conexão JDBC como somente leitura durante a transação e põe a sessão do Hibernate em flush manual; o driver do PostgreSQL abre a transação como `BEGIN READ ONLY`, e o banco recusa qualquer INSERT, UPDATE ou DELETE. O `@Transactional` do próprio use case (REQUIRED) entra nessa transação, somente leitura incluída. Uma tool de leitura não grava auditoria (o `AuditRecorder` recusa transação somente leitura); a linha `ai.tool.executed` é escrita fora, pelo `AuditedToolCallback`.

O registry só olha o método da tool. Código que ela chama pode abrir a própria transação (`@Transactional(propagation = REQUIRES_NEW)` num callee, um `TransactionTemplate` próprio), e essa transação nova pega outra conexão, gravável. Para isso existe `ReadOnlyToolTransactionGuard`, um `TransactionExecutionListener` do Spring Framework (6.1+) que o Spring Boot registra no gerenciador de transação auto-configurado (`ExecutionListenersTransactionManagerCustomizer`): enquanto uma `@ReadOnlyTool` roda naquela thread, ele recusa no `beforeBegin` qualquer transação nova que não seja somente leitura; o `AbstractPlatformTransactionManager` aborta o início e retoma a transação somente leitura. A tool falha (`ai.tool.failed`, `IllegalStateException`, log `SECURITY`) e o modelo lê "erro interno". Transação nova somente leitura e savepoint (`NESTED`, mesma conexão) passam.

Limitação: o guarda só vê transações abertas pelo gerenciador do Spring na thread da tool. Não vê um callee com `NOT_SUPPORTED` (suspende sem abrir transação) que grave por JDBC em autocommit, código que pegue conexão direto do `DataSource`, nem trabalho entregue a outra thread (`@Async`, listener assíncrono, executor). Isso não se detecta estaticamente. Regra para quem escreve módulo: uma `@ReadOnlyTool` não chama código que abre a própria transação nem que grava fora dela; se o use case precisa gravar algo (contador, cache, auditoria própria), ele não é tool de leitura e vai com `@RequiresConfirmation`.

`audit_search` devolve `AuditEntryForAgent`: a mesma entrada da tela de auditoria sem o IP. Para responder "quem fez o quê e quando" basta o e-mail de quem agiu, e o que a tool devolve vai para o provedor do modelo (LGPD art. 6 III, necessidade). A tela e o CSV continuam com o IP.

## Validação de entrada

O Spring AI não valida o JSON do modelo contra o schema antes de invocar. Cada use case valida os próprios argumentos (como `TaskService.validate`), pois o mesmo método atende REST e tool; entrada inválida vira `DomainRuleException`, que volta ao modelo como erro sem tocar o banco. Listagens têm teto (200) para o prompt não receber uma tabela inteira.

## Auditoria

Cada turno gera `ai.turn.started` (quantas tools foram oferecidas) e `ai.turn.ended` (desfecho e tokens), com origem `REST`, o IP e o id da requisição (seção acima). Cada tool call gera uma linha em `audit_event` com origem `AI_TOOL`, id da conversa, IP da pessoa e nome da tool: `ai.tool.executed` com a duração, ou `ai.tool.failed` com a classe da exceção (`reason`). Estacionar, confirmar, recusar, falhar e expirar uma ação também geram linha (`ai.action.*`). O resultado da tool não vai para a trilha.

Os argumentos também não (LGPD art. 6 III, necessidade; ASVS 14.2.4). São texto livre escolhido pelo modelo e podem conter dado pessoal; a trilha é append-only, fica 5 anos e sobrevive à anonimização, enquanto `ai_pending_action`, que guarda os argumentos inteiros, é apagada 90 dias depois de resolvida. `ai.tool.executed`, `ai.tool.failed` e `ai.action.parked` guardam (`ToolArguments.auditDetails`):

- `argumentNames`: os nomes dos argumentos de primeiro nível, em ordem alfabética;
- `argumentsSha256`: o SHA-256, em hexadecimal, do JSON canônico dos argumentos: lido e escrito de novo compacto, sem espaços, com as propriedades de todo objeto em ordem de nome (`JsonNodeFeature.WRITE_PROPERTIES_SORTED` do Jackson), em UTF-8. Texto que não é JSON entra como veio.

Numa contestação, enquanto a ação pendente existir, `ToolArguments.sha256(ai_pending_action.arguments)` confere com o hash da linha da trilha; depois disso a trilha prova que houve a chamada, com quais campos, e não o que havia neles.

O resultado de uma tool nunca entra no prompt de sistema: o desfecho de uma confirmação (confirmada, recusada ou falha) vira uma frase no papel de usuário, escrita por `PendingActionService`. A mesma frase fica gravada na coluna `ai_pending_action.note` (`V15`), e é por ela que a tela e a exportação (LGPD art. 18) escondem as notas do portal (`ConversationService.visible`). A memória de chat do Spring AI guarda só texto, tipo e horário, então a nota é reconhecida pelo texto exato registrado na ação, não por um prefixo que a pessoa poderia digitar.

## Limites de consumo

OWASP LLM10 (consumo ilimitado), ASVS 15.2.2:

- Por resposta: `spring.ai.anthropic.chat.max-tokens`. Por turno: `spring.ai.tools.limits.*` (10 chamadas por tool, 30 no total) e `os.ai.turn-timeout` (5 min).
- Por mensagem: `os.ai.max-user-message-length` (4000 caracteres; um fork muda em `application.yml`, até `AiProperties.MAX_USER_MESSAGE_LENGTH_CEILING`, 32000, que é também o limite validado no corpo da requisição). Acima do configurado, `AgentService` recusa e o stream termina com o evento `error` "Mensagem vazia ou longa demais".
- Por pessoa: `os.ai.turns-per-minute` turnos iniciados por minuto (20, janela deslizante) e `os.ai.max-concurrent-turns-per-user` ao mesmo tempo (2). Acima de qualquer um, `POST /api/ai/conversations/{id}/messages` responde 429 com Problem Details antes de chamar o modelo, e o log `SECURITY` registra o excesso de ritmo. O limitador é o `RateLimiter` em memória de `common`, o mesmo do login: uma instância por deploy, zerado ao reiniciar.
- Consumo registrado por turno: `ai.turn.ended` traz `outcome` (`completed` ou `interrupted`), `promptTokens`, `completionTokens`, `totalTokens` e, quando há cache, `cacheReadInputTokens` e `cacheWriteInputTokens`. Os números vêm do `Usage` nos metadados da `ChatResponse` do Spring AI 2.0: a Anthropic informa o uso no último evento de cada chamada (`message_delta`, somado ao `input_tokens` do `message_start`), e o `ToolCallingAdvisor` soma as rodadas de tool anteriores em cada pedaço que traz uso, então o último uso não vazio do stream é o total do turno. O custo por conversa é a soma das linhas `ai.turn.ended` com o mesmo `entity_id`; o valor em dinheiro sai da tabela de preço do contrato, não do código. Um turno interrompido (cliente saiu, timeout, erro) registra o que o provedor tinha informado até ali.

## Memória e streaming

- `MessageChatMemoryAdvisor` com `MessageWindowChatMemory` sobre `JdbcChatMemoryRepository` (starter `spring-ai-starter-model-chat-memory-repository-jdbc`). Tabela criada por Flyway, `initialize-schema=never`.
- Conversa pertence a um usuário. `GET /api/ai/conversations` lista só as do usuário atual. Admin não lê conversa alheia; auditoria já registra as ações.
- Resposta por SSE (`text/event-stream`) com eventos tipados: `token`, `tool_call`, `tool_failed`, `action_pending`, `ui_action`, `done` (texto completo), `error`.

## Modelo e opções

- Provedor: Anthropic via `spring-ai-starter-model-anthropic`.
- Modelo padrão: `claude-opus-5` (`spring.ai.anthropic.chat.model`). Thinking adaptativo é o comportamento padrão do modelo; não configurar `budget_tokens`.
- `max-tokens` 16000 para chamadas não-streaming; streaming pode subir.
- Prompt caching: `spring.ai.anthropic.chat.cache-options.strategy=SYSTEM_AND_TOOLS` quando o catálogo de tools estabilizar. O catálogo por usuário varia, então a ordem das tools precisa ser determinística para o cache funcionar.
- System prompt em `src/main/resources/prompts/system.st`, versionado, sem segredos, sem regras de autorização.

## Ações de UI

Um use case pode, enquanto roda como tool, publicar `UiActions.publish(new UiAction.Navigate("/tasks", "Ver tarefas"))` (pacote `common.ui`). Fora do agente (REST) não há ouvinte e a chamada não faz nada. Dentro do agente, `ContextPropagatingToolCallback` captura o ouvinte e o `AiController` envia o evento SSE `ui_action` (`{type: "navigate", path, label}`); o painel mostra um link e navega. Só caminhos internos (`/...`), validados nos dois lados; nunca HTML, nunca script. A ação nasce no nosso código, não no texto do modelo, então não pode ser forjada pela conversa. Exemplos no core: `tasks_create` leva para `/tasks`, `iam_get_user` abre a ficha do usuário. Outros tipos (`highlight`, `openForm`) entram quando um módulo precisar.

## Janela do agente (web)

O assistente é uma segunda janela à direita da página, com a mesma borda e os mesmos cantos (`src/core/ai/AgentWorkspace.tsx`, sobre o `resizable` do shadcn / react-resizable-panels). Abre em cerca de um terço da tela, redimensiona pela divisória (mouse ou setas do teclado), amplia até 60 % e recolhe com `⌘I`/`Ctrl+I` ou pelo botão "Assistente" do cabeçalho. A divisão fica no cookie `agent_layout`, lido pelo layout `(os)` para o primeiro quadro já sair no tamanho certo. No celular o agente abre em tela cheia.

Dentro da janela (`AgentPanel.tsx`):

- Funcionando de verdade: histórico com busca e grupos por data, fixar conversa (só ids, neste navegador), exportar em Markdown, excluir uma ou todas, nova conversa, resposta em streaming com botão de parar (Esc), Markdown seguro (sem HTML e sem imagens), copiar, ler em voz alta (síntese do próprio navegador), editar e reenviar, perguntar de novo, confirmações das ações que alteram dados, lista de ferramentas vinda de `GET /api/ai/tools`, preferências de envio com Enter, tamanho do texto, mostrar ferramentas e abrir telas automaticamente.
- Prévia, marcada na tela: seletor de modelo, tom, instruções personalizadas, memória, avaliação de respostas, renomear (vale só na aba), anexos. Nada disso é enviado ao servidor ainda.
- Ditado por voz fica desligado de propósito: o reconhecimento do navegador envia o áudio a terceiros, o que não cabe com dados confidenciais.

Parar a resposta fecha o stream na tela; o servidor pode terminar o turno em segundo plano, respeitando o tempo limite de cada turno.

## O que um módulo novo precisa fazer

Nada além de anotar seus use cases com `@Tool` + `@RequiresPermission` + `@ReadOnlyTool` ou `@RequiresConfirmation` e escrever boas descrições. O módulo `ai` descobre tudo pelo contexto do Spring e não importa nenhum módulo de negócio.
