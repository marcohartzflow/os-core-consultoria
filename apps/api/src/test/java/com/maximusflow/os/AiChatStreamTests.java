package com.maximusflow.os;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
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

		@Bean
		@Primary
		ChatModel scriptedChatModel() {
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
					if (text.contains("devagar")) {
						return Flux.interval(Duration.ofMillis(300)).take(5).map((i) -> response("."));
					}
					return Flux.just(response("Olá"), response(", tudo certo."));
				}
			};
		}

		private static ChatResponse response(String text) {
			return new ChatResponse(List.of(new Generation(new AssistantMessage(text))));
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
		Session admin = login("admin@example.com", "Admin-Password-2026");
		String conversation = newConversation(admin);
		this.mvc.perform(post("/api/ai/conversations/" + conversation + "/messages").cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"text\":\"oi\"}")).andExpect(status().isForbidden());
	}

	@Test
	void tokensStreamThenDoneAndTheConversationIsKept() throws Exception {
		Session admin = login("admin@example.com", "Admin-Password-2026");
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

	@Test
	void aToolRunsOnTheModelsThreadWithThePersonsAuthorityAndIsAudited() throws Exception {
		Session admin = login("admin@example.com", "Admin-Password-2026");
		String conversation = newConversation(admin);
		String events = send(admin, conversation, "quais usuarios existem?");
		assertThat(events).contains("event:tool_call", "iam_list_users", "Encontrei o administrador.");
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE action = 'ai.tool.executed'"
				+ " AND entity_id = 'iam_list_users' AND origin = 'AI_TOOL' AND correlation_id = ?", Integer.class,
				conversation)).isEqualTo(1);
	}

	@Test
	void theModelIsOfferedOnlyTheToolsThePersonMayUse() throws Exception {
		Session admin = login("admin@example.com", "Admin-Password-2026");
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
					+ "\",\"password\":\"Leo-Password-2026\"}"))
			.andExpect(status().isNoContent());
		Session leo = login("leo@example.com", "Leo-Password-2026");

		send(leo, newConversation(leo), "oi");
		assertThat(ScriptedModel.OFFERED.getLast()).containsExactly("tasks_get", "tasks_list");

		// Leo cannot talk into the administrator's conversation: same answer as a conversation that does not exist.
		String adminConversation = newConversation(admin);
		assertThat(send(leo, adminConversation, "oi")).contains("event:error", "Conversa não encontrada")
			.doesNotContain("event:done");
	}

	@Test
	void onePersonRunsAtMostTwoTurnsAtATime() throws Exception {
		Session admin = login("admin@example.com", "Admin-Password-2026");
		String conversation = newConversation(admin);
		MvcResult first = start(admin, conversation, "devagar");
		MvcResult second = start(admin, conversation, "devagar");
		this.mvc.perform(withCsrf(post("/api/ai/conversations/" + conversation + "/messages"), admin)
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
		return this.mvc
			.perform(withCsrf(post("/api/ai/conversations/" + conversation + "/messages"), session)
				.contentType(MediaType.APPLICATION_JSON)
				.accept(MediaType.TEXT_EVENT_STREAM)
				.content("{\"text\":\"" + text + "\"}"))
			.andExpect(request().asyncStarted())
			.andReturn();
	}

	/** The stream is written by the turn's own thread; wait until it closes with done or error. */
	private static String awaitEnd(MvcResult result) throws Exception {
		long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
		while (true) {
			String body = result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
			if (body.contains("event:done") || body.contains("event:error")) {
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

	private static String firstMatch(MvcResult result, String regex) throws Exception {
		String body = result.getResponse().getContentAsString();
		Matcher matcher = Pattern.compile(regex).matcher(body);
		assertThat(matcher.find()).as("pattern %s in %s", regex, body).isTrue();
		return matcher.group(1);
	}

}
