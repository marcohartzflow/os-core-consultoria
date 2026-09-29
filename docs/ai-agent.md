# Agente de IA

O diferencial do OS é que todo o sistema é operável pelo agente, e o agente só consegue fazer o que o usuário logado pode fazer. Este documento define como isso funciona no módulo `ai`.

Estado (2026-09-28): implementado no `os-core` conforme abaixo. Classes: `ToolRegistry`, `AuditedToolCallback`, `ConfirmingToolCallback`, `AgentService`, `PendingActionService`, `ConversationService`, `AiController`. Tools no `iam`: `iam_list_users`, `iam_get_user`, `iam_list_roles` e `iam_disable_user` (destrutiva). Tools do módulo de exemplo `tasks`: `tasks_list`, `tasks_get`, `tasks_create`, `tasks_complete` e `tasks_delete` (destrutiva). A resposta chega token a token (evento `token`), intercalada com `tool_call`, `tool_failed`, `action_pending` e `ui_action`; `done` traz o texto completo.

## Princípios

1. **Use case é a única fonte de verdade.** REST e agente chamam o mesmo método. Não existe código de negócio só para a IA.
2. **Autorização do usuário, não do sistema.** Tool roda com o `SecurityContext` do usuário da conversa.
3. **Dupla barreira.** O modelo só recebe tools permitidas, e a execução verifica de novo. Filtro no catálogo não basta porque o modelo pode alucinar um nome.
4. **Ação destrutiva pede confirmação humana.**
5. **Tudo auditado.**

## Como um use case vira tool

```java
@Service
class CreateUserUseCase {

    @Tool(description = "Cria um usuário e envia convite por e-mail. Use quando o usuário pedir para cadastrar ou convidar alguém.")
    @RequiresPermission("iam.user.create")
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
- Tool que altera ou apaga dado recebe também `@Destructive` (anotação do projeto). O registry lê essa marca.
- O controller REST é fino e chama `execute(...)`. O agente também.

## Registry e filtro por permissão

`ToolRegistry` (bean em `ai`) roda no boot:

1. Percorre os beans do contexto, encontra métodos com `@Tool`.
2. Para cada um, constrói um `MethodToolCallback` via `MethodToolCallback.builder().toolDefinition(ToolDefinitions.builder(method)...).toolMethod(method).toolObject(bean)`.
3. Guarda junto a permissão exigida (lida de `@RequiresPermission`) e a flag destrutiva.
4. Falha o boot se algum `@Tool` não tiver `@RequiresPermission`. Tool sem permissão é bug.

Por requisição de chat, `AgentService`:

1. Lê as `GrantedAuthority` do usuário atual.
2. Seleciona do registry só as tools cuja permissão o usuário tem.
3. Chama `chatClient.prompt().user(msg).tools(permitidas).toolContext(Map.of("conversationId", id)).advisors(a -> a.param(ChatMemory.CONVERSATION_ID, id)).stream().content().toStream()`. O usuário vem do `SecurityContext`, repassado a cada tool call por `ContextPropagatingToolCallback`. Fechar o stream cancela a chamada ao modelo: o turno para quando o cliente desconecta ou o `os.ai.turn-timeout` vence.

O `ToolCallingManager` é configurado com `resolutionFallbackEnabled(false)` (padrão), `maxCallsPerTool` e `maxTotalToolCalls`. O fallback por nome ficaria acessível a qualquer tool do contexto, o que quebraria o filtro.

## Enforcement na execução

Mesmo com o catálogo filtrado, o método do use case tem `@RequiresPermission`. Se o modelo tentar chamar uma tool fora da lista (o Spring AI já rejeita nome desconhecido), ou se a permissão do usuário mudar no meio da conversa, a chamada cai em `AccessDeniedException`, que é convertida em mensagem de erro para o modelo pelo `ToolExecutionExceptionProcessor` e registrada no log de segurança.

O `SecurityContext` precisa estar presente na thread que executa a tool. O turno roda em uma virtual thread (`DelegatingSecurityContextRunnable` no `AiController`), mas em streaming (`ChatClient.stream()`) o Spring AI executa as tools em threads do Reactor. `ContextPropagatingToolCallback` captura `SecurityContext`, escopo do `AuditContext` e listener de `ToolEvents` no início do turno e os restabelece em volta de cada chamada, em qualquer thread, limpando depois. `ContextPropagatingToolCallbackTests` prova isso.

## Confirmação humana

Tool marcada com `@Destructive` não executa na primeira passada:

1. Registry registra a tool com um wrapper. Quando o modelo a chama, o wrapper grava uma `PendingAction` (tool, argumentos, usuário, conversa, expira em 5 min) e devolve ao modelo "ação aguardando confirmação do usuário, id X".
2. O front recebe um evento SSE tipado `action_pending` e mostra o resumo com botão de confirmar.
3. `POST /api/ai/actions/{id}/confirm` verifica que o usuário é o mesmo, que não expirou, executa o use case real (passando de novo pela autorização) e grava auditoria.
4. Recusa ou expiração também são auditadas.

Toda tool com `delete`, `pay`, `send`, `cancel` ou mudança em massa é destrutiva. Na dúvida, é destrutiva.

Gestão de acesso nunca é tool: um use case com permissão reservada (`@RequiresPermission(reserved = true)`, como atribuir roles, redefinir segundo fator ou anonimizar) não pode ter `@Tool`, e o boot falha se tiver. Assim, uma injeção de prompt vinda de dados nunca alcança quem acessa o quê, nem na conversa de um administrador.

## Validação de entrada

O Spring AI não valida o JSON do modelo contra o schema antes de invocar. Cada use case valida os próprios argumentos (como `TaskService.validate`), pois o mesmo método atende REST e tool; entrada inválida vira `DomainRuleException`, que volta ao modelo como erro sem tocar o banco. Listagens têm teto (200) para o prompt não receber uma tabela inteira.

## Auditoria

Cada tool call gera uma linha em `audit_event` com origem `AI_TOOL`, id da conversa, nome da tool, argumentos como o modelo os enviou, resultado ou erro, duração. Confirmações, recusas e expirações também. Tool que receba dado pessoal sensível nos argumentos deve mascará-lo antes (responsabilidade do módulo), pois a trilha é imutável e sobrevive à anonimização.

O resultado de uma tool nunca entra no prompt de sistema: o desfecho de uma confirmação vira uma frase fixa no papel de usuário (`ConversationService.PORTAL_NOTE`), oculta na tela e na exportação.

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

## O que um módulo novo precisa fazer

Nada além de anotar seus use cases com `@Tool` + `@RequiresPermission` (+ `@Destructive` quando couber) e escrever boas descrições. O módulo `ai` descobre tudo pelo contexto do Spring e não importa nenhum módulo de negócio.
