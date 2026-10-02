package com.maximusflow.os.ai.internal.tools;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.fixtures.ReadOnlyToolFixtures;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.DefaultToolDefinition;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.execution.ToolExecutionException;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/** What a failed tool call reveals, and how a read-only tool is held to reading. */
class ToolSafeguardsTests {

	private static final ToolDefinition DEFINITION = DefaultToolDefinition.builder()
		.name("tasks_probe")
		.description("x")
		.inputSchema("{}")
		.build();

	private final SafeToolExceptionProcessor processor = new SafeToolExceptionProcessor();

	@Test
	void theModelReadsDomainRefusalsButNeverInternals() {
		assertThat(this.processor.process(wrapped(new NotFoundException("Tarefa não encontrada"))))
			.isEqualTo("Tarefa não encontrada");
		assertThat(this.processor.process(wrapped(new DomainRuleException("Título obrigatório"))))
			.isEqualTo("Título obrigatório");
		assertThat(this.processor.process(wrapped(new AuthorizationDeniedException("Access Denied"))))
			.isEqualTo("sem permissão");
		assertThat(this.processor.process(wrapped(new DataIntegrityViolationException(
				"ERROR: duplicate key value violates unique constraint \"users_email_key\" Detail: Key (email)=(a@b.c)"))))
			.isEqualTo("erro interno");
		assertThat(this.processor.process(wrapped(new IllegalStateException("select * from users"))))
			.isEqualTo("erro interno");
	}

	@Test
	void anErrorIsNotAToolOutcome() {
		assertThatExceptionOfType(OutOfMemoryError.class)
			.isThrownBy(() -> this.processor.process(new ToolExecutionException(DEFINITION, new OutOfMemoryError())));
	}

	/** The trail and the person get the use case's exception, not Spring AI's wrapper. */
	@Test
	void aFailedCallIsAuditedWithTheUnwrappedCause() {
		AuditRecorder audit = mock(AuditRecorder.class);
		ToolCallback failing = new FailingCallback(wrapped(new AuthorizationDeniedException("Access Denied")));
		List<ToolEvents.Event> events = new ArrayList<>();
		var callback = new AuditedToolCallback(failing, audit, Clock.systemUTC());

		assertThatExceptionOfType(ToolExecutionException.class)
			.isThrownBy(() -> ToolEvents.listen(events::add, () -> callback.call("{}", new ToolContext(Map.of()))));

		verify(audit).record(eq("ai.tool.failed"), eq("ai_tool"), eq("tasks_probe"),
				eq(Map.of("argumentNames", List.of(), "argumentsSha256", ToolArguments.sha256("{}"), "reason",
						"AuthorizationDeniedException")));
		assertThat(events).containsExactly(new ToolEvents.ToolFailed("tasks_probe", "sem permissão"));
	}

	@Test
	void aReadOnlyToolRunsInAReadOnlyTransaction() {
		RecordingTransactionManager transactions = new RecordingTransactionManager();
		ToolRegistry registry = registryWith(ReadOnlyToolFixtures.Reader.class, transactions);
		ToolCallback callback = registry.find("fixture_read").orElseThrow().callback();

		assertThat(callback).isInstanceOf(ReadOnlyTransactionToolCallback.class);
		assertThat(callback.call("{}")).contains("readOnly=true,active=true");
		assertThat(transactions.begun).singleElement()
			.satisfies((definition) -> assertThat(definition.isReadOnly()).isTrue());
	}

	@Test
	void aReadOnlyToolThatWouldEscapeTheTransactionIsRefused() {
		assertThatIllegalStateException()
			.isThrownBy(() -> registryWith(ReadOnlyToolFixtures.Escaping.class, new RecordingTransactionManager()))
			.withMessageContaining("suspends the caller's transaction");
	}

	/** A callee opening its own writable transaction would get a writable connection; the guard refuses it. */
	@Test
	void codeCalledByAReadOnlyToolCannotOpenAWritableTransaction() {
		RecordingTransactionManager transactions = new RecordingTransactionManager();
		transactions.addListener(new ReadOnlyToolTransactionGuard());
		TransactionTemplate writable = new TransactionTemplate(transactions);
		writable.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
		TransactionTemplate readOnly = new TransactionTemplate(transactions);
		readOnly.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
		readOnly.setReadOnly(true);

		var escaping = new ReadOnlyTransactionToolCallback(new Body(() -> writable.execute((s) -> "wrote")),
				transactions);
		assertThatIllegalStateException().isThrownBy(() -> escaping.call("{}"))
			.withMessageContaining("cannot open a writable transaction");

		var reading = new ReadOnlyTransactionToolCallback(new Body(() -> readOnly.execute((s) -> "read")),
				transactions);
		assertThat(reading.call("{}")).isEqualTo("read");
		// Outside a read-only tool nothing changes.
		String outside = writable.execute((s) -> "wrote");
		assertThat(outside).isEqualTo("wrote");
	}

	private static ToolExecutionException wrapped(RuntimeException cause) {
		return new ToolExecutionException(DEFINITION, cause);
	}

	private static ToolRegistry registryWith(Class<?> bean, PlatformTransactionManager transactions) {
		try (var context = new GenericApplicationContext()) {
			context.registerBean(bean);
			context.registerBean(PlatformTransactionManager.class, () -> transactions);
			context.refresh();
			var registry = new ToolRegistry(context);
			registry.afterSingletonsInstantiated();
			return registry;
		}
	}

	private record FailingCallback(RuntimeException failure) implements ToolCallback {

		@Override
		public ToolDefinition getToolDefinition() {
			return DEFINITION;
		}

		@Override
		public String call(String toolInput) {
			throw this.failure;
		}

	}

	private record Body(java.util.function.Supplier<String> body) implements ToolCallback {

		@Override
		public ToolDefinition getToolDefinition() {
			return DEFINITION;
		}

		@Override
		public String call(String toolInput) {
			return this.body.get();
		}

	}

	/** Begins nothing real; records the definitions it was asked for. */
	static final class RecordingTransactionManager extends AbstractPlatformTransactionManager {

		final List<TransactionDefinition> begun = new ArrayList<>();

		@Override
		protected Object doGetTransaction() {
			return new Object();
		}

		@Override
		protected void doBegin(Object transaction, TransactionDefinition definition) {
			this.begun.add(definition);
		}

		@Override
		protected void doCommit(DefaultTransactionStatus status) {
		}

		@Override
		protected void doRollback(DefaultTransactionStatus status) {
		}

	}

}
