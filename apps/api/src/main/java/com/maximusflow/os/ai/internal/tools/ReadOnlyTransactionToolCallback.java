package com.maximusflow.os.ai.internal.tools;

import java.util.Map;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.metadata.ToolMetadata;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Runs a {@code @ReadOnlyTool} inside a read-only transaction, so "only reads" is enforced by the
 * database rather than trusted (OWASP LLM06 excessive agency). With JPA, Spring's
 * {@code JpaTransactionManager} (through {@code HibernateJpaDialect}) marks the pooled JDBC connection
 * read-only for the transaction and switches the Hibernate session to manual flush; the PostgreSQL
 * driver then opens it as {@code BEGIN READ ONLY} and the server rejects any INSERT, UPDATE or DELETE
 * ("cannot execute ... in a read-only transaction"). The use case's own {@code @Transactional}
 * (propagation REQUIRED) joins this transaction, read-only included; the registry refuses a read-only
 * tool whose transaction would start a new one ({@code REQUIRES_NEW}) or suspend it
 * ({@code NOT_SUPPORTED}), which would escape the guard.
 *
 * <p>Code the tool calls can still open its own transaction (a {@code REQUIRES_NEW} on a callee, a
 * {@code TransactionTemplate}); that one would get a new, writable connection. While the tool runs,
 * {@link ReadOnlyToolTransactionGuard} refuses any new writable transaction begun on this thread
 * through Spring's transaction manager. What it cannot see is listed in docs/ai-agent.md.
 */
public final class ReadOnlyTransactionToolCallback implements ToolCallback {

	private static final ThreadLocal<Boolean> RUNNING = new ThreadLocal<>();

	private final ToolCallback delegate;

	private final TransactionTemplate readOnly;

	public ReadOnlyTransactionToolCallback(ToolCallback delegate, PlatformTransactionManager transactionManager) {
		this.delegate = delegate;
		this.readOnly = new TransactionTemplate(transactionManager);
		this.readOnly.setReadOnly(true);
		this.readOnly.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
	}

	@Override
	public ToolDefinition getToolDefinition() {
		return this.delegate.getToolDefinition();
	}

	@Override
	public ToolMetadata getToolMetadata() {
		return this.delegate.getToolMetadata();
	}

	@Override
	public String call(String toolInput) {
		return call(toolInput, new ToolContext(Map.of()));
	}

	@Override
	public String call(String toolInput, @Nullable ToolContext toolContext) {
		return this.readOnly.execute((status) -> {
			Boolean previous = RUNNING.get();
			RUNNING.set(Boolean.TRUE);
			try {
				return this.delegate.call(toolInput, toolContext);
			}
			finally {
				if (previous != null) {
					RUNNING.set(previous);
				}
				else {
					RUNNING.remove();
				}
			}
		});
	}

	/** True while a read-only tool runs on the current thread, inside its read-only transaction. */
	static boolean isRunning() {
		return RUNNING.get() != null;
	}

}
