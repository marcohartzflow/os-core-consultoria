package com.maximusflow.os;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.http.Cookie;

import com.maximusflow.os.ai.internal.AiProvider;
import com.maximusflow.os.ai.internal.ProviderChatModels;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The chat endpoint end to end with a scripted model in place of Anthropic: authentication and
 * CSRF on the stream, token and done frames, what the model is offered (tools filtered by the
 * person's permissions), a tool executed on a Reactor thread with the person's authority and audit
 * scope, conversation ownership and the per-person turn limit.
 */
@Import({ TestcontainersConfiguration.class, AiChatStreamTests.ScriptedModel.class })
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiChatStreamTests {

	/** Answers by keyword; "usuarios" makes it call iam_list_users itself, like the real loop would. */
	@TestConfiguration(proxyBeanMethods = false)
	static class ScriptedModel {

		static final List<List<String>> OFFERED = new CopyOnWriteArrayList<>();

		/** The model id each call asked for, as the provider would receive it. */
		static final List<String> MODELS = new CopyOnWriteArrayList<>();

		/** Stands in for every provider; only Anthropic has a key in the test profile. */
		@Bean
		@Primary
		ProviderChatModels scriptedProviders() {
			ChatModel scripted = scriptedChatModel();
			return new ProviderChatModels(Map.of(AiProvider.ANTHROPIC, scripted, AiProvider.OPENAI, scripted));
		}

		private static ChatModel scriptedChatModel() {
			return new ChatModel() {
				@Override
				public ChatResponse call(Prompt prompt) {
					return response("não usado");
				}

				@Override
				public ChatOptions getOptions() {
					return ToolCallingChatOptions.builder().build();
				}

				@Override
				public Flux<ChatResponse> stream(Prompt prompt) {
					List<ToolCallback> tools = (prompt.getOptions() instanceof ToolCallingChatOptions options)
							? options.getToolCallbacks() : List.of();
					OFFERED.add(tools.stream().map((t) -> t.getToolDefinition().name()).sorted().toList());
					MODELS.add(String.valueOf(prompt.getOptions().getModel()));
					String text = prompt.getUserMessage().getText();
					if (text.contains("usuarios")) {
						return Flux.defer(() -> {
							ToolCallback list = tools.stream()
								.filter((t) -> t.getToolDefinition().name().equals("iam_list_users"))
								.findFirst()
								.orElseThrow();
							String result = list.call("{}");
							return Flux.just(response("Encontrei "), response(result.contains("admin@example.com")
									? "o administrador." : "ninguém."));
						}).subscribeOn(Schedulers.boundedElastic());
					}
					if (text.contains("crie")) {
						return Flux.defer(() -> {
							ToolCallback create = tools.stream()
								.filter((t) -> t.getToolDefinition().name().equals("tasks_create"))
								.findFirst()
								.orElseThrow();
							create.call("{\"title\":\"Tarefa do assistente\"}");
							return Flux.just(response("Aparece para confirmação."));
						}).subscribeOn(Schedulers.boundedElastic());
					}
					if (text.startsWith("conclua ")) {
						return Flux.defer(() -> {
							ToolCallback complete = tools.stream()
								.filter((t) -> t.getToolDefinition().name().equals("tasks_complete"))
								.findFirst()
								.orElseThrow();
							complete.call("{\"id\":\"" + text.substring("conclua ".length()).trim() + "\"}");
							return Flux.just(response("Concluída."));
						}).subscribeOn(Schedulers.boundedElastic());
					}
					if (text.startsWith("A pessoa confirmou")) {
						return Flux.just(response("Pronto, criei a tarefa."));
					}
					if (text.contains("pense")) {
						// Like Anthropic: reasoning deltas carry the "thinking" property and no text.
						return Flux.just(thinking(), thinking(), response("Pensei."));
					}
					if (text.contains("devagar")) {
						return Flux.interval(Duration.ofMillis(300)).take(5).map((i) -> response("."));
					}
					// Like Anthropic: the usage arrives on the last event of the call, with no text.
					return Flux.just(response("Olá"), response(", tudo certo."), usage(120, 8));
				}
			};
		}

		private static ChatResponse response(String text) {
			return new ChatResponse(List.of(new Generation(new AssistantMessage(text))));
		}

		private static ChatResponse thinking() {
			return new ChatResponse(List.of(new Generation(
					AssistantMessage.builder().properties(Map.of("thinking", Boolean.TRUE)).build())));
		}

		private static ChatResponse usage(int prompt, int completion) {
			return new ChatResponse(List.of(new Generation(new AssistantMessage(""))),
					ChatResponseMetadata.builder().usage(new DefaultUsage(prompt, completion)).build());
		}

	}

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void theStreamRequiresASessionAndTheCsrfToken() throws Exception {
		// CSRF is checked first: no token is 403 whoever asks; a token without a session is 401.
		this.mvc.perform(post("/api/ai/conversations/00000000-0000-0000-0000-000000000000/messages")
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"text\":\"oi\"}")).andExpect(status().isForbidden());
		this.mvc.perform(withCsrf(post("/api/ai/conversations/00000000-0000-0000-0000-000000000000/messages"),
				anonymous())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"text\":\"oi\"}")).andExpect(status().isUnauthorized());
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		String conversation = newConversation(admin);
		this.mvc.perform(post("/api/ai/conversations/" + conversation + "/messages").cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"text\":\"oi\"}")).andExpect(status().isForbidden());
	}

	@Test
	void tokensStreamThenDoneAndTheConversationIsKept() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		String conversation = newConversation(admin);
		String events = send(admin, conversation, "Primeira pergunta");
		assertThat(events).contains("event:token", "\"text\":\"Olá\"", "event:done", "Olá, tudo certo.");

		this.mvc.perform(get("/api/ai/conversations/" + conversation + "/messages").cookie(admin.cookie()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].role").value("user"))
			.andExpect(jsonPath("$[1].text").value("Olá, tudo certo."));
		// Title and last activity are stored (the turn runs outside a transaction).
		this.mvc.perform(get("/api/ai/conversations").cookie(admin.cookie()))
			.andExpect(jsonPath("$[?(@.id == '" + conversation + "')].title").value("Primeira pergunta"));
	}

	/**
	 * The turn runs on another thread, yet its rows say who, from where and which request (ASVS 16.2.1),
	 * and the end of the turn records the tokens the model reported (OWASP LLM10).
	 */
	/**
	 * Each frame must reach the browser as written: no-transform keeps a compressing proxy (the Next.js
	 * server's gzip) from holding the stream back. Reasoning is signalled once per block, never sent.
	 */
	@Test
	void theStreamIsNotTransformedByProxiesAndSignalsThinking() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		String conversation = newConversation(admin);
		MvcResult result = start(admin, conversation, "pense antes");
		String events = awaitEnd(result);
		assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-transform", "no-store");
		assertThat(events.split("event:thinking", -1)).hasSize(2);
		assertThat(events.indexOf("event:thinking")).isLessThan(events.indexOf("event:token"));
		assertThat(events).contains("Pensei.");
	}

	@Test
	void theTurnIsAuditedWithTheRequestsOriginAddressAndIdAndItsTokenUsage() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		String conversation = newConversation(admin);
		MvcResult result = start(admin, conversation, "Quanto custa?");
		assertThat(awaitEnd(result)).contains("event:done", "Olá, tudo certo.");
		String requestId = result.getResponse().getHeader("X-Request-Id");
		assertThat(requestId).isNotBlank();

		assertThat(this.jdbc.queryForMap("SELECT origin, ip, correlation_id, actor_email FROM audit_event"
				+ " WHERE action = 'ai.turn.started' AND entity_id = ?", conversation))
			.containsEntry("origin", "REST")
			.containsEntry("ip", "127.0.0.1")
			.containsEntry("correlation_id", requestId)
			.containsEntry("actor_email", "admin@example.com");
		String ended = this.jdbc.queryForObject("SELECT details::text FROM audit_event"
				+ " WHERE action = 'ai.turn.ended' AND entity_id = ? AND correlation_id = ?", String.class,
				conversation, requestId);
		assertThat(ended).contains("\"outcome\": \"completed\"", "\"promptTokens\": 120",
				"\"completionTokens\": 8", "\"totalTokens\": 128");
	}

	@Test
	void aToolRunsOnTheModelsThreadWithThePersonsAuthorityAndIsAudited() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		String conversation = newConversation(admin);
		String events = send(admin, conversation, "quais usuarios existem?");
		assertThat(events).contains("event:tool_call", "iam_list_users", "Encontrei o administrador.");
		// After a reload the history still says which tool answered: the trail between question and answer.
		this.mvc.perform(get("/api/ai/conversations/" + conversation + "/messages").cookie(admin.cookie()))
			.andExpect(jsonPath("$[0].steps").isEmpty())
			.andExpect(jsonPath("$[1].steps[0].kind").value("tool"))
			.andExpect(jsonPath("$[1].steps[0].tool").value("iam_list_users"));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE action = 'ai.tool.executed'"
				+ " AND entity_id = 'iam_list_users' AND origin = 'AI_TOOL' AND correlation_id = ?"
				+ " AND ip = '127.0.0.1' AND details->>'argumentsSha256' IS NOT NULL AND details->>'arguments' IS NULL",
				Integer.class, conversation)).isEqualTo(1);
	}

	@Test
	void theModelIsOfferedOnlyTheToolsThePersonMayUse() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		String readerRole = firstMatch(this.mvc
			.perform(withCsrf(post("/api/iam/roles"), admin).contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"Leitor de tarefas\",\"permissions\":[\"ai.chat.use\",\"tasks.task.read\"]}"))
			.andExpect(status().isCreated())
			.andReturn(), "\"id\"\\s*:\\s*\"([^\"]+)\"");
		String link = firstMatch(this.mvc
			.perform(withCsrf(post("/api/iam/users"), admin).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"leo@example.com\",\"name\":\"Leo\",\"roleIds\":[\"" + readerRole + "\"]}"))
			.andExpect(status().isCreated())
			.andReturn(), "\"invitationLink\"\\s*:\\s*\"([^\"]+)\"");
		Session anonymous = anonymous();
		this.mvc.perform(withCsrf(post("/api/iam/invitations/accept"), anonymous).contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + link.substring(link.lastIndexOf('/') + 1)
					+ "\",\"password\":\"Oel-Passphrase-2026\"}"))
			.andExpect(status().isNoContent());
		Session leo = login("leo@example.com", "Oel-Passphrase-2026");

		send(leo, newConversation(leo), "oi");
		assertThat(ScriptedModel.OFFERED.getLast()).containsExactly("tasks_get", "tasks_list");

		// Leo cannot talk into the administrator's conversation: refused before any stream starts, with the
		// same answer as a conversation that does not exist.
		String adminConversation = newConversation(admin);
		this.mvc.perform(withCsrf(post("/api/ai/conversations/" + adminConversation + "/messages"), leo)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"text\":\"oi\"}")).andExpect(status().isNotFound());
	}

	/** Only models of providers with a key are offered, and only those ids reach a provider. */
	@Test
	void thePersonPicksAModelFromTheConfiguredList() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		this.mvc.perform(get("/api/ai/models").cookie(admin.cookie()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].id").value("claude-opus-5-5"))
			.andExpect(jsonPath("$[0].isDefault").value(true))
			.andExpect(jsonPath("$[?(@.provider == 'openai')]").isEmpty());

		String conversation = newConversation(admin);
		send(admin, conversation, "oi");
		assertThat(ScriptedModel.MODELS.getLast()).isEqualTo("claude-opus-5-5");
		assertThat(awaitEnd(start(admin, conversation, "oi", "claude-haiku-4-5"))).contains("event:done");
		assertThat(ScriptedModel.MODELS.getLast()).isEqualTo("claude-haiku-4-5");
		assertThat(this.jdbc.queryForList("SELECT details->>'model' FROM audit_event WHERE action = 'ai.turn.started'"
				+ " AND entity_id = ? ORDER BY occurred_at", String.class, conversation))
			.containsExactly("claude-opus-5-5", "claude-haiku-4-5");

		// A model outside the list, or of a provider without a key, is refused before the stream starts.
		for (String model : List.of("claude-3-opus", "gpt-6-astra")) {
			this.mvc.perform(withCsrf(post("/api/ai/conversations/" + conversation + "/messages"), admin)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"text\":\"oi\",\"model\":\"" + model + "\"}")).andExpect(status().isBadRequest());
		}
	}

	@Test
	void aConversationIsRenamedOnlyByItsOwner() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		String conversation = newConversation(admin);
		this.mvc.perform(withCsrf(patch("/api/ai/conversations/" + conversation), admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"title\":\"  Plano do trimestre  \"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.title").value("Plano do trimestre"));
		this.mvc.perform(withCsrf(patch("/api/ai/conversations/" + conversation), admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"title\":\" \"}")).andExpect(status().isBadRequest());
		this.mvc.perform(withCsrf(patch("/api/ai/conversations/00000000-0000-0000-0000-000000000000"), admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"title\":\"x\"}")).andExpect(status().isNotFound());
	}

	/**
	 * Human in the loop: the person confirms the action, the assistant continues by itself from the
	 * portal's note, and after a reload the answer still shows the action with its outcome.
	 */
	@Test
	void afterAConfirmationTheAssistantContinuesAndTheHistoryKeepsTheOutcome() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		String conversation = newConversation(admin);
		String events = send(admin, conversation, "crie uma tarefa");
		String actionId = firstMatch(events, "\"actionId\"\\s*:\\s*\"([^\"]+)\"");
		// Nothing to continue before a decision.
		assertThat(awaitEnd(continueTurn(admin, conversation))).contains("event:error", "Nada a continuar");

		this.mvc.perform(withCsrf(post("/api/ai/actions/" + actionId + "/confirm"), admin))
			.andExpect(status().isOk());
		String continued = awaitEnd(continueTurn(admin, conversation));
		assertThat(continued).contains("event:done", "Pronto, criei a tarefa.", "totalTokens");
		// Once answered, there is nothing left to continue.
		assertThat(awaitEnd(continueTurn(admin, conversation))).contains("event:error", "Nada a continuar");

		this.mvc.perform(get("/api/ai/conversations/" + conversation + "/messages").cookie(admin.cookie()))
			.andExpect(jsonPath("$.length()").value(3))
			.andExpect(jsonPath("$[1].steps[0].kind").value("pending"))
			.andExpect(jsonPath("$[1].steps[0].tool").value("tasks_create"))
			.andExpect(jsonPath("$[1].steps[0].action.status").value("CONFIRMED"))
			.andExpect(jsonPath("$[2].text").value("Pronto, criei a tarefa."));
	}

	/**
	 * Tool permissions, as in Claude: the settings list each tool with what the person may choose;
	 * "always" and "this conversation" run an action without the card; a block keeps the tool from the
	 * model; the risk ceiling is enforced on save and on confirmation.
	 */
	@Test
	void toolPermissionsLetActionsRunWithoutAskingWithinTheirCeiling() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		try {
			this.mvc.perform(get("/api/ai/tool-preferences").cookie(admin.cookie()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.name == 'tasks_create')].risk").value("MEDIUM"))
				.andExpect(jsonPath("$[?(@.name == 'tasks_complete')].risk").value("LOW"))
				.andExpect(jsonPath("$[?(@.name == 'tasks_create')].choice").value("ASK"))
				.andExpect(jsonPath("$[?(@.name == 'tasks_list')].choice").value("ALLOW"))
				.andExpect(jsonPath("$[?(@.name == 'iam_disable_user')].choices[0]").value("ASK"));
			// Above the ceiling: refused.
			this.mvc.perform(withCsrf(put("/api/ai/tool-preferences/iam_disable_user"), admin)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"choice\":\"ALLOW\"}")).andExpect(status().is4xxClientError());

			// "Permitir nesta conversa" from the card: the next call in the same conversation runs at once.
			String conversation = newConversation(admin);
			String first = send(admin, conversation, "crie uma tarefa");
			String actionId = firstMatch(first, "\"actionId\"\\s*:\\s*\"([^\"]+)\"");
			this.mvc.perform(withCsrf(post("/api/ai/actions/" + actionId + "/confirm"), admin)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"scope\":\"CONVERSATION\"}")).andExpect(status().isOk());
			String second = send(admin, conversation, "crie outra tarefa");
			assertThat(second).contains("event:action_auto", "\"scope\":\"CONVERSATION\"")
				.doesNotContain("event:action_pending");
			// Not in another conversation.
			assertThat(send(admin, newConversation(admin), "crie mais uma")).contains("event:action_pending")
				.doesNotContain("event:action_auto");

			// Creating a task writes free text others read: never "always" (prompt-injection exfiltration).
			this.mvc.perform(withCsrf(put("/api/ai/tool-preferences/tasks_create"), admin)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"choice\":\"ALLOW\"}")).andExpect(status().is4xxClientError());

			// "Permitir sempre" from the settings, on a light action: every conversation, audited as such.
			String taskId = firstMatch(this.mvc
				.perform(withCsrf(post("/api/tasks"), admin).contentType(MediaType.APPLICATION_JSON)
					.content("{\"title\":\"Para concluir\"}"))
				.andExpect(status().isCreated())
				.andReturn(), "\"id\"\\s*:\\s*\"([^\"]+)\"");
			this.mvc.perform(withCsrf(put("/api/ai/tool-preferences/tasks_complete"), admin)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"choice\":\"ALLOW\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.choice").value("ALLOW"))
				.andExpect(jsonPath("$.expiresAt").isNotEmpty());
			String always = newConversation(admin);
			assertThat(send(admin, always, "conclua " + taskId)).contains("event:action_auto", "\"scope\":\"ALWAYS\"",
					"\"callId\"");
			this.mvc.perform(get("/api/ai/conversations/" + always + "/messages").cookie(admin.cookie()))
				.andExpect(jsonPath("$[1].steps[0].kind").value("auto"))
				.andExpect(jsonPath("$[1].steps[0].scope").value("ALWAYS"));

			// Tightening is always possible: a read can ask first. Approving it lets the next call through, once.
			this.mvc.perform(withCsrf(put("/api/ai/tool-preferences/iam_list_users"), admin)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"choice\":\"ASK\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.choice").value("ASK"));
			String reads = newConversation(admin);
			String asked = send(admin, reads, "quais usuarios existem?");
			assertThat(asked).contains("event:action_pending", "iam_list_users").doesNotContain("o administrador");
			String readAction = firstMatch(asked, "\"actionId\"\\s*:\\s*\"([^\"]+)\"");
			this.mvc.perform(withCsrf(post("/api/ai/actions/" + readAction + "/confirm"), admin)).andExpect(status().isOk());
			assertThat(send(admin, reads, "quais usuarios existem?")).contains("event:tool_call", "o administrador")
				.doesNotContain("event:action_pending");
			assertThat(send(admin, reads, "quais usuarios existem?")).contains("event:action_pending");
			// A sensitive action can be blocked, never allowed without asking.
			this.mvc.perform(get("/api/ai/tool-preferences").cookie(admin.cookie()))
				.andExpect(jsonPath("$[?(@.name == 'iam_disable_user')].choices[1]").value("BLOCK"))
				.andExpect(jsonPath("$[?(@.name == 'iam_list_users')].choices[0]").value("ALLOW"));
			this.mvc.perform(withCsrf(put("/api/ai/tool-preferences/iam_disable_user"), admin)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"choice\":\"BLOCK\"}")).andExpect(status().isOk());

			// Blocked: the model is not offered the tool at all.
			this.mvc.perform(withCsrf(put("/api/ai/tool-preferences/tasks_create"), admin)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"choice\":\"BLOCK\"}")).andExpect(status().isOk());
			send(admin, newConversation(admin), "oi");
			assertThat(ScriptedModel.OFFERED.getLast()).doesNotContain("tasks_create").contains("tasks_list");
		}
		finally {
			// The administrator is shared with other tests: back to the defaults.
			this.mvc.perform(withCsrf(delete("/api/ai/tool-preferences"), admin)).andExpect(status().isNoContent());
		}
	}

	private MvcResult continueTurn(Session session, String conversation) throws Exception {
		return this.mvc
			.perform(withCsrf(post("/api/ai/conversations/" + conversation + "/continue"), session)
				.contentType(MediaType.APPLICATION_JSON)
				.accept(MediaType.TEXT_EVENT_STREAM)
				.content("{}"))
			.andExpect(request().asyncStarted())
			.andReturn();
	}

	@Test
	void onePersonRunsAtMostTwoTurnsAtATime() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		String conversation = newConversation(admin);
		MvcResult first = start(admin, conversation, "devagar");
		// One turn per conversation: the same conversation waits for its answer.
		this.mvc.perform(withCsrf(post("/api/ai/conversations/" + conversation + "/messages"), admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"text\":\"devagar\"}")).andExpect(status().isConflict());
		MvcResult second = start(admin, newConversation(admin), "devagar");
		this.mvc.perform(withCsrf(post("/api/ai/conversations/" + newConversation(admin) + "/messages"), admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"text\":\"devagar\"}")).andExpect(status().isTooManyRequests());
		assertThat(awaitEnd(first)).contains("event:done");
		assertThat(awaitEnd(second)).contains("event:done");
		// Once they finish, a new turn is accepted.
		assertThat(send(admin, conversation, "oi")).contains("event:done");
	}

	// helpers

	record Session(Cookie cookie, Cookie xsrf) {
	}

	private String send(Session session, String conversation, String text) throws Exception {
		return awaitEnd(start(session, conversation, text));
	}

	private MvcResult start(Session session, String conversation, String text) throws Exception {
		return start(session, conversation, text, null);
	}

	private MvcResult start(Session session, String conversation, String text, String model) throws Exception {
		String body = (model == null) ? "{\"text\":\"" + text + "\"}"
				: "{\"text\":\"" + text + "\",\"model\":\"" + model + "\"}";
		return this.mvc
			.perform(withCsrf(post("/api/ai/conversations/" + conversation + "/messages"), session)
				.contentType(MediaType.APPLICATION_JSON)
				.accept(MediaType.TEXT_EVENT_STREAM)
				.content(body))
			.andExpect(request().asyncStarted())
			.andReturn();
	}

	/** The stream is written by the turn's own thread; wait until it closes with done or error. */
	private static String awaitEnd(MvcResult result) throws Exception {
		long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
		while (true) {
			String body = result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
			// The terminal frame complete: its blank line written, not only its name.
			if ((body.contains("event:done") || body.contains("event:error")) && body.endsWith("\n\n")) {
				return body;
			}
			assertThat(System.nanoTime()).as("stream did not end: %s", body).isLessThan(deadline);
			Thread.sleep(50);
		}
	}

	private String newConversation(Session session) throws Exception {
		return firstMatch(this.mvc
			.perform(withCsrf(post("/api/ai/conversations"), session).contentType(MediaType.APPLICATION_JSON)
				.content("{}"))
			.andExpect(status().isCreated())
			.andReturn(), "\"id\"\\s*:\\s*\"([^\"]+)\"");
	}

	private Session anonymous() throws Exception {
		MvcResult csrf = this.mvc.perform(get("/api/auth/csrf")).andReturn();
		return new Session(null, csrf.getResponse().getCookie("XSRF-TOKEN"));
	}

	private Session login(String email, String password) throws Exception {
		Session anonymous = anonymous();
		MvcResult login = this.mvc
			.perform(withCsrf(post("/api/auth/login"), anonymous).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
			.andExpect(status().isOk())
			.andReturn();
		return new Session(login.getResponse().getCookie("OS_SESSION"), anonymous.xsrf());
	}

	private static MockHttpServletRequestBuilder withCsrf(MockHttpServletRequestBuilder builder, Session session) {
		if (session.cookie() != null) {
			builder.cookie(session.cookie());
		}
		return builder.cookie(session.xsrf()).header("X-XSRF-TOKEN", session.xsrf().getValue());
	}

	private static String firstMatch(String text, String regex) {
		Matcher m = Pattern.compile(regex).matcher(text);
		assertThat(m.find()).as("pattern %s in %s", regex, text).isTrue();
		return m.group(1);
	}

	private static String firstMatch(MvcResult result, String regex) throws Exception {
		String body = result.getResponse().getContentAsString();
		Matcher matcher = Pattern.compile(regex).matcher(body);
		assertThat(matcher.find()).as("pattern %s in %s", regex, body).isTrue();
		return matcher.group(1);
	}

}
