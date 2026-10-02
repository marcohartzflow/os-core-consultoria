package com.maximusflow.os;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import com.maximusflow.os.ai.internal.application.ConversationService;
import com.maximusflow.os.ai.internal.application.PendingActionService;
import com.maximusflow.os.ai.internal.tools.ConfirmingToolCallback;
import com.maximusflow.os.ai.internal.tools.ReadOnlyTransactionToolCallback;
import com.maximusflow.os.ai.internal.tools.RegisteredTool;
import com.maximusflow.os.ai.internal.tools.SafeToolExceptionProcessor;
import com.maximusflow.os.ai.internal.tools.ToolArguments;
import com.maximusflow.os.ai.internal.tools.ToolRegistry;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.privacy.PersonalDataService;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.UserDirectory;
import com.maximusflow.os.tasks.internal.application.TaskService;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.DefaultToolDefinition;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.execution.ToolExecutionExceptionProcessor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;

import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The agent's safeguards against a real database: read-only tools cannot write, what the model and the
 * export receive, pending actions closed by the scheduler, and the request id in the trail.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiSafeguardsTests {

	@Autowired
	MockMvc mvc;

	@Autowired
	ApplicationContext context;

	@Autowired
	ToolRegistry registry;

	@Autowired
	PendingActionService pendingActions;

	@Autowired
	ConversationService conversations;

	@Autowired
	PersonalDataService personalData;

	@Autowired
	UserDirectory userDirectory;

	@Autowired
	TaskService tasks;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	PlatformTransactionManager transactionManager;

	@Autowired
	ObjectMapper json;

	@AfterEach
	void clearContext() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void theModelOnlyReadsSafeFailureTexts() {
		assertThat(this.context.getBean(ToolExecutionExceptionProcessor.class))
			.isInstanceOf(SafeToolExceptionProcessor.class);
	}

	/** Every read-only tool runs read-only, and the database refuses a write made inside one. */
	@Test
	void aReadOnlyToolCannotWrite() {
		assertThat(this.registry.all()).filteredOn((tool) -> !tool.requiresConfirmation())
			.isNotEmpty()
			.allSatisfy((tool) -> assertThat(tool.callback()).isInstanceOf(ReadOnlyTransactionToolCallback.class));

		ToolCallback writer = new ToolCallback() {
			@Override
			public ToolDefinition getToolDefinition() {
				return DefaultToolDefinition.builder().name("writer").description("x").inputSchema("{}").build();
			}

			@Override
			public String call(String toolInput) {
				AiSafeguardsTests.this.jdbc.update("INSERT INTO tasks (id, title, status, created_at, updated_at)"
						+ " VALUES (?, 'escrita indevida', 'OPEN', now(), now())", UUID.randomUUID());
				return "written";
			}
		};
		assertThatThrownBy(() -> new ReadOnlyTransactionToolCallback(writer, this.transactionManager).call("{}"))
			.hasMessageContaining("read-only transaction");
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM tasks WHERE title = 'escrita indevida'",
				Integer.class)).isZero();
	}

	@Test
	void auditSearchGivesTheModelNoIpAddresses() throws Exception {
		loginAsAdmin();
		actAsAdmin();
		String result = this.registry.find("audit_search").orElseThrow().callback().call("{}",
				new ToolContext(Map.of()));
		assertThat(result).contains("actorEmail").doesNotContain("\"ip\"");
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE ip IS NOT NULL", Integer.class))
			.isPositive();
	}

	@Test
	void overduePendingActionsAreExpiredByTheSchedulerAndPurgedLater() {
		actAsAdmin();
		UUID conversationId = this.conversations.create("teste").id();
		UUID taskId = this.tasks.create("Expira sozinha", null, null, null).id();
		UUID overdue = park(this.registry.find("tasks_delete").orElseThrow(), conversationId,
				"{\"id\":\"" + taskId + "\"}");
		UUID onTime = park(this.registry.find("tasks_delete").orElseThrow(), conversationId,
				"{\"id\":\"" + taskId + "\"}");
		this.jdbc.update("UPDATE ai_pending_action SET expires_at = now() - interval '1 minute' WHERE id = ?", overdue);
		SecurityContextHolder.clearContext();

		Object cleanup = this.context.getBean("pendingActionCleanup");
		ReflectionTestUtils.invokeMethod(cleanup, "expireOverdue");

		assertThat(actionStatus(overdue)).isEqualTo("EXPIRED");
		assertThat(actionStatus(onTime)).isEqualTo("PENDING");
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE action = 'ai.action.expired'"
				+ " AND entity_id = ? AND origin = 'SYSTEM'", Integer.class, overdue.toString())).isEqualTo(1);
		// Running again changes nothing: one expiry, one audit entry.
		ReflectionTestUtils.invokeMethod(cleanup, "expireOverdue");
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE action = 'ai.action.expired'"
				+ " AND entity_id = ?", Integer.class, overdue.toString())).isEqualTo(1);

		// Past the retention period: an action without a note goes, one whose note the conversation
		// still needs stays without its arguments.
		actAsAdmin();
		this.pendingActions.reject(onTime);
		SecurityContextHolder.clearContext();
		this.jdbc.update("UPDATE ai_pending_action SET resolved_at = ? WHERE id IN (?, ?)",
				Timestamp.from(Instant.now().minus(91, ChronoUnit.DAYS)), overdue, onTime);
		ReflectionTestUtils.invokeMethod(cleanup, "purgeResolved");
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM ai_pending_action WHERE id = ?", Integer.class,
				overdue)).isZero();
		assertThat(this.jdbc.queryForMap("SELECT arguments, note FROM ai_pending_action WHERE id = ?", onTime))
			.containsEntry("arguments", "")
			.hasEntrySatisfying("note", (note) -> assertThat(note).isNotNull());
	}

	/** The trail outlives the pending action: it keeps argument names and a hash, never the values. */
	@Test
	void aParkedActionIsAuditedWithoutItsArgumentValues() {
		actAsAdmin();
		UUID conversationId = this.conversations.create("argumentos").id();
		UUID taskId = this.tasks.create("Não vai para a trilha", null, null, null).id();
		String arguments = "{\"id\":\"" + taskId + "\"}";
		UUID actionId = park(this.registry.find("tasks_delete").orElseThrow(), conversationId, arguments);

		String details = this.jdbc.queryForObject(
				"SELECT details::text FROM audit_event WHERE action = 'ai.action.parked' AND entity_id = ?", String.class,
				actionId.toString());
		assertThat(details).doesNotContain(taskId.toString())
			.contains("\"argumentNames\": [\"id\"]", ToolArguments.sha256(arguments), "tasks_delete");
		// While the pending action exists, its stored arguments match the hash in the trail.
		assertThat(ToolArguments.sha256(this.jdbc.queryForObject(
				"SELECT arguments FROM ai_pending_action WHERE id = ?", String.class, actionId)))
			.isEqualTo(ToolArguments.sha256(arguments));
	}

	/** A tool removed between parking and confirming must not leave the action EXECUTING forever. */
	@Test
	void confirmingAnActionWhoseToolIsGoneResolvesItAsFailed() {
		actAsAdmin();
		UUID conversationId = this.conversations.create("ferramenta removida").id();
		UUID taskId = this.tasks.create("Ferramenta some", null, null, null).id();
		UUID actionId = park(this.registry.find("tasks_delete").orElseThrow(), conversationId,
				"{\"id\":\"" + taskId + "\"}");
		this.jdbc.update("UPDATE ai_pending_action SET tool_name = 'tasks_removed' WHERE id = ?", actionId);

		assertThatThrownBy(() -> this.pendingActions.confirm(actionId)).isInstanceOf(DomainRuleException.class)
			.hasMessage("Ferramenta não existe mais");

		assertThat(actionStatus(actionId)).isEqualTo("FAILED");
		assertThat(this.jdbc.queryForObject("SELECT note FROM ai_pending_action WHERE id = ?", String.class, actionId))
			.contains("tasks_removed", "Ferramenta não existe mais");
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE action = 'ai.action.failed'"
				+ " AND entity_id = ?", Integer.class, actionId.toString())).isEqualTo(1);
	}

	@Test
	void theExportHasTheProposedActionsAndThePersonsTasks() {
		actAsAdmin();
		AccountSnapshot admin = this.userDirectory.findByEmail("admin@example.com").orElseThrow();
		UUID conversationId = this.conversations.create("exportar").id();
		String title = "Tarefa exportada " + UUID.randomUUID();
		UUID taskId = this.tasks.create(title, null, admin.id(), null).id();
		park(this.registry.find("tasks_delete").orElseThrow(), conversationId, "{\"id\":\"" + taskId + "\"}");

		String export = this.json.writeValueAsString(this.personalData.export(admin.id(), admin.email()));

		assertThat(export).contains("\"tool\":\"tasks_delete\"", "\"status\":\"PENDING\"", taskId.toString(), title,
				"\"assignedToYou\":true", "\"createdByYou\":true");
		// The portal's internal note and the tool's result never leave.
		assertThat(export).doesNotContain("\"note\"", "\"result\"");
	}

	@Test
	void aRequestIdIsReturnedAndRecordedAsTheAuditCorrelation() throws Exception {
		Cookie session = loginAsAdmin();
		MvcResult result = this.mvc.perform(get("/api/me/data").cookie(session))
			.andExpect(status().isOk())
			.andExpect(header().exists("X-Request-Id"))
			.andReturn();
		String requestId = result.getResponse().getHeader("X-Request-Id");
		assertThat(this.jdbc.queryForObject(
				"SELECT count(*) FROM audit_event WHERE action = 'privacy.data.exported' AND correlation_id = ?",
				Integer.class, requestId)).isEqualTo(1);
	}

	private String actionStatus(UUID actionId) {
		return this.jdbc.queryForObject("SELECT status FROM ai_pending_action WHERE id = ?", String.class, actionId);
	}

	private UUID park(RegisteredTool tool, UUID conversationId, String arguments) {
		var stub = new ConfirmingToolCallback(tool, (t, a) -> this.pendingActions.park(conversationId, t, a));
		String reply = stub.call(arguments, new ToolContext(Map.of()));
		return UUID.fromString(reply.replaceAll(".*\"actionId\":\"([^\"]+)\".*", "$1"));
	}

	private void actAsAdmin() {
		AccountSnapshot admin = this.userDirectory.findByEmail("admin@example.com").orElseThrow();
		OsPrincipal principal = new OsPrincipal(admin.id(), admin.email(), admin.name(), null, true, true,
				admin.permissions());
		SecurityContext securityContext = SecurityContextHolder.createEmptyContext();
		securityContext.setAuthentication(
				UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
		SecurityContextHolder.setContext(securityContext);
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
