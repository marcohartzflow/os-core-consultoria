package com.maximusflow.os;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.maximusflow.os.ai.internal.application.ConversationService;
import com.maximusflow.os.ai.internal.application.PendingActionService;
import com.maximusflow.os.ai.internal.domain.PendingAction;
import com.maximusflow.os.ai.internal.tools.ConfirmingToolCallback;
import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.ai.internal.tools.RegisteredTool;
import com.maximusflow.os.ai.internal.tools.ToolRegistry;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.UserDirectory;
import com.maximusflow.os.tasks.internal.application.TaskService;
import com.maximusflow.os.tasks.internal.domain.TaskStatus;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The agent's safety rails without calling the model: registry contents and permission filtering,
 * state-changing tools parked as pending actions, and confirmation executing the real use case under
 * the confirming person's authorization.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiToolsTests {

	@Autowired
	AuditRecorder auditRecorder;

	@Autowired
	MockMvc mvc;

	@Autowired
	ToolRegistry registry;

	@Autowired
	com.maximusflow.os.iam.PermissionCatalog catalog;

	@Autowired
	PendingActionService pendingActions;

	@Autowired
	ConversationService conversations;

	@Autowired
	UserDirectory userDirectory;

	@Autowired
	TaskService tasks;

	@Autowired
	ChatMemory chatMemory;

	@Autowired
	org.springframework.jdbc.core.JdbcTemplate jdbc;

	@AfterEach
	void clearContext() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void everyToolRequiresAPermissionAndTheCatalogIsFilteredByIt() {
		assertThat(this.registry.all()).extracting(RegisteredTool::name).contains("iam_list_users", "iam_get_user",
				"iam_disable_user", "iam_list_roles");
		assertThat(this.registry.all()).allSatisfy((tool) -> assertThat(tool.permission()).isNotBlank());
		assertThat(this.registry.find("iam_disable_user")).get().extracting(RegisteredTool::requiresConfirmation)
			.isEqualTo(true);
		assertThat(this.registry.find("iam_list_users")).get().extracting(RegisteredTool::requiresConfirmation)
			.isEqualTo(false);
		assertThat(this.registry.all()).filteredOn(RegisteredTool::requiresConfirmation)
			.allSatisfy((tool) -> assertThat(tool.confirmationSummary()).isNotBlank());

		assertThat(this.registry.forPermissions(Set.of("iam.user.read"))).extracting(RegisteredTool::name)
			.containsExactly("iam_get_user", "iam_list_users");
		assertThat(this.registry.forPermissions(Set.of())).isEmpty();
		// Access management is never an AI tool, not even for administrators.
		assertThat(this.registry.all()).extracting(RegisteredTool::name).doesNotContain("iam_anonymize_user");
		assertThat(this.registry.all()).noneSatisfy((tool) -> assertThat(this.catalog.isReserved(tool.permission())).isTrue());
	}

	@Test
	void toolsEndpointRequiresChatPermissionAndReturnsOnlyAllowedTools() throws Exception {
		Cookie session = loginAsAdmin();
		this.mvc.perform(get("/api/ai/tools").cookie(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[?(@.name == 'iam_disable_user')].destructive").value(true));
		this.mvc.perform(get("/api/ai/tools")).andExpect(status().isUnauthorized());
	}

	@Test
	void stateChangingToolIsParkedAndOnlyRunsAfterConfirmation() {
		actAsAdmin();
		UUID conversationId = this.conversations.create("teste").id();
		RegisteredTool disable = this.registry.find("iam_disable_user").orElseThrow();

		// The agent "calls" the state-changing tool: nothing happens except a pending action.
		var stub = new ConfirmingToolCallback(disable, (tool, args) -> this.pendingActions.park(conversationId, tool, args),
				(input) -> null, this.auditRecorder);
		String reply = stub.call("{\"id\":\"" + UUID.randomUUID() + "\"}", new ToolContext(Map.of()));
		assertThat(reply).contains("PENDING_CONFIRMATION");
		var open = this.pendingActions.open(conversationId);
		assertThat(open).hasSize(1);
		assertThat(open.getFirst().tool()).isEqualTo("iam_disable_user");

		// Rejecting closes it; confirming a closed action is refused.
		var rejected = this.pendingActions.reject(open.getFirst().id());
		assertThat(rejected.status()).isEqualTo(PendingAction.Status.REJECTED);
		assertThat(this.pendingActions.open(conversationId)).isEmpty();

		// Confirming runs the real use case, which applies its own rules (unknown user -> 404 mapped to FAILED).
		UUID again = stub2(disable, conversationId).apply("{\"id\":\"" + UUID.randomUUID() + "\"}");
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> this.pendingActions.confirm(again))
			.isInstanceOf(com.maximusflow.os.common.error.NotFoundException.class);
		assertThat(this.pendingActions.open(conversationId)).isEmpty();
	}

	@Test
	void confirmationRunsTheToolExactlyOnceEvenWhenConfirmedConcurrently() throws Exception {
		actAsAdmin();
		UUID conversationId = this.conversations.create("teste").id();
		UUID taskId = this.tasks.create("Excluir uma vez", null, null, null).id();
		RegisteredTool delete = this.registry.find("tasks_delete").orElseThrow();
		UUID actionId = stub2(delete, conversationId).apply("{\"id\":\"" + taskId + "\"}");

		SecurityContext context = SecurityContextHolder.getContext();
		CountDownLatch start = new CountDownLatch(1);
		Callable<String> confirm = () -> {
			SecurityContextHolder.setContext(context);
			start.await();
			try {
				return this.pendingActions.confirm(actionId).status().name();
			}
			catch (com.maximusflow.os.common.error.DomainRuleException ex) {
				return "REFUSED";
			}
			finally {
				SecurityContextHolder.clearContext();
			}
		};
		try (var pool = Executors.newFixedThreadPool(2)) {
			List<Future<String>> futures = List.of(pool.submit(confirm), pool.submit(confirm));
			start.countDown();
			List<String> outcomes = List.of(futures.get(0).get(), futures.get(1).get());
			assertThat(outcomes).containsExactlyInAnyOrder("CONFIRMED", "REFUSED");
		}
		// Executed once: the task is gone, and a third confirmation is refused, not re-run as a 404.
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> this.tasks.get(taskId))
			.isInstanceOf(com.maximusflow.os.common.error.NotFoundException.class);
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> this.pendingActions.confirm(actionId))
			.isInstanceOf(com.maximusflow.os.common.error.DomainRuleException.class);
		assertThat(this.pendingActions.open(conversationId)).isEmpty();

		// Outcomes reach the model as fixed user-role notes: no system message, no raw tool result,
		// and nothing of it in what the person sees or exports.
		var memory = this.chatMemory.get(conversationId.toString());
		assertThat(memory).isNotEmpty().allSatisfy((m) -> assertThat(m.getMessageType()).isEqualTo(MessageType.USER));
		assertThat(memory).allSatisfy((m) -> assertThat(m.getText()).contains(actionId.toString())
			.doesNotContain("Excluir uma vez"));
		assertThat(this.conversations.messages(conversationId)).isEmpty();
	}

	@Test
	void creatingAndCompletingATaskWaitForConfirmation() {
		actAsAdmin();
		UUID conversationId = this.conversations.create("teste").id();
		String title = "Criada pelo assistente " + UUID.randomUUID();
		UUID createId = stub2(this.registry.find("tasks_create").orElseThrow(), conversationId)
			.apply("{\"title\":\"" + title + "\"}");

		// Parked with what will run: the person sees the summary and the arguments; nothing exists yet.
		var open = this.pendingActions.open(conversationId);
		assertThat(open).singleElement().satisfies((action) -> {
			assertThat(action.summary()).isEqualTo("Cria uma tarefa");
			assertThat(action.arguments()).contains(title);
		});
		String byTitle = "SELECT id FROM tasks WHERE title = ?";
		assertThat(this.jdbc.queryForList(byTitle, UUID.class, title)).isEmpty();

		this.pendingActions.confirm(createId);
		UUID created = this.jdbc.queryForObject(byTitle, UUID.class, title);

		UUID completeId = stub2(this.registry.find("tasks_complete").orElseThrow(), conversationId)
			.apply("{\"id\":\"" + created + "\"}");
		assertThat(this.tasks.get(created).status()).isEqualTo(TaskStatus.OPEN);
		this.pendingActions.confirm(completeId);
		assertThat(this.tasks.get(created).status()).isEqualTo(TaskStatus.DONE);
	}

	@Test
	void portalNotesAreHiddenByRecordNotByAPrefixThePersonCanType() throws Exception {
		Cookie session = loginAsAdmin();
		actAsAdmin();
		UUID conversationId = this.conversations.create("teste").id();
		this.chatMemory.add(conversationId.toString(), new UserMessage("[portal] escrito pela pessoa"));
		UUID taskId = this.tasks.create("Recusada", null, null, null).id();
		UUID actionId = stub2(this.registry.find("tasks_delete").orElseThrow(), conversationId)
			.apply("{\"id\":\"" + taskId + "\"}");
		this.pendingActions.reject(actionId);

		// The model gets both; the person sees and exports only what they wrote.
		assertThat(this.chatMemory.get(conversationId.toString())).hasSize(2);
		assertThat(this.conversations.messages(conversationId)).extracting(ConversationService.ChatMessage::text)
			.containsExactly("[portal] escrito pela pessoa");
		this.mvc.perform(get("/api/me/data").cookie(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.conversations[?(@.id == '" + conversationId + "')].messages[*].text")
				.value("[portal] escrito pela pessoa"));
	}

	@Test
	void anExpiredActionCannotBeConfirmedAndTheExpiryIsRecorded() {
		actAsAdmin();
		UUID conversationId = this.conversations.create("teste").id();
		UUID taskId = this.tasks.create("Expira", null, null, null).id();
		UUID actionId = stub2(this.registry.find("tasks_delete").orElseThrow(), conversationId)
			.apply("{\"id\":\"" + taskId + "\"}");
		this.jdbc.update("UPDATE ai_pending_action SET expires_at = now() - interval '1 second' WHERE id = ?", actionId);

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> this.pendingActions.confirm(actionId))
			.isInstanceOf(com.maximusflow.os.common.error.DomainRuleException.class);
		assertThat(this.jdbc.queryForObject("SELECT status FROM ai_pending_action WHERE id = ?", String.class, actionId))
			.isEqualTo("EXPIRED");
		assertThat(this.jdbc.queryForObject(
				"SELECT count(*) FROM audit_event WHERE action = 'ai.action.expired' AND entity_id = ?", Integer.class,
				actionId.toString())).isEqualTo(1);
		// Nothing ran.
		assertThat(this.tasks.get(taskId).title()).isEqualTo("Expira");
	}

	@Test
	void anotherPersonCannotSeeOrResolveSomeoneElsesConversationOrAction() {
		actAsAdmin();
		UUID conversationId = this.conversations.create("do admin").id();
		UUID taskId = this.tasks.create("Alheia", null, null, null).id();
		UUID actionId = stub2(this.registry.find("tasks_delete").orElseThrow(), conversationId)
			.apply("{\"id\":\"" + taskId + "\"}");

		// Same permissions, different person: every lookup answers 404, never "forbidden".
		actAs(UUID.randomUUID(), Set.of("ai.chat.use", "tasks.task.read", "tasks.task.delete"));
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> this.conversations.messages(conversationId))
			.isInstanceOf(com.maximusflow.os.common.error.NotFoundException.class);
		assertThat(this.pendingActions.open(conversationId)).isEmpty();
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> this.pendingActions.confirm(actionId))
			.isInstanceOf(com.maximusflow.os.common.error.NotFoundException.class);
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> this.pendingActions.reject(actionId))
			.isInstanceOf(com.maximusflow.os.common.error.NotFoundException.class);
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> this.conversations.delete(conversationId))
			.isInstanceOf(com.maximusflow.os.common.error.NotFoundException.class);
		assertThat(this.conversations.mine()).isEmpty();

		actAsAdmin();
		assertThat(this.pendingActions.open(conversationId)).hasSize(1);
	}

	private void actAs(UUID id, Set<String> permissions) {
		OsPrincipal principal = new OsPrincipal(id, "outra@example.com", "Outra", null, true, true, permissions);
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(
				UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
		SecurityContextHolder.setContext(context);
	}

	private java.util.function.Function<String, UUID> stub2(RegisteredTool tool, UUID conversationId) {
		return (args) -> {
			var stub = new ConfirmingToolCallback(tool, (t, a) -> this.pendingActions.park(conversationId, t, a),
					(input) -> null, this.auditRecorder);
			String reply = stub.call(args, new ToolContext(Map.of()));
			return UUID.fromString(reply.replaceAll(".*\"actionId\":\"([^\"]+)\".*", "$1"));
		};
	}

	private void actAsAdmin() {
		AccountSnapshot admin = this.userDirectory.findByEmail("admin@example.com").orElseThrow();
		OsPrincipal principal = new OsPrincipal(admin.id(), admin.email(), admin.name(), null, true, true,
				admin.permissions());
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(
				UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
		SecurityContextHolder.setContext(context);
	}

	private Cookie loginAsAdmin() throws Exception {
		MvcResult csrf = this.mvc.perform(get("/api/auth/csrf")).andReturn();
		Cookie xsrf = csrf.getResponse().getCookie("XSRF-TOKEN");
		MvcResult login = this.mvc
			.perform(post("/api/auth/login").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"admin@example.com\",\"password\":\"Bootstrap-Secret-2026\"}"))
			.andExpect(status().isOk())
			.andReturn();
		return login.getResponse().getCookie("OS_SESSION");
	}

}
