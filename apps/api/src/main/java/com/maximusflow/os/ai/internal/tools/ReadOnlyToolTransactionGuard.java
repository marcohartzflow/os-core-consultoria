package com.maximusflow.os.ai.internal.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.TransactionExecution;
import org.springframework.transaction.TransactionExecutionListener;

/**
 * Refuses a new writable transaction begun while a {@code @ReadOnlyTool} runs on the same thread (OWASP
 * LLM06). A callee with {@code REQUIRES_NEW}, or its own {@code TransactionTemplate}, would otherwise
 * get a fresh, writable connection outside the tool's read-only transaction.
 *
 * <p>Uses Spring's {@link TransactionExecutionListener} (Spring Framework 6.1): Spring Boot registers
 * every listener bean on the auto-configured transaction manager
 * ({@code ExecutionListenersTransactionManagerCustomizer}), and {@code AbstractPlatformTransactionManager}
 * calls {@link #beforeBegin} before it opens a new transaction. Throwing there aborts the begin and
 * resumes the suspended read-only transaction. A new transaction that is itself read-only, and a
 * savepoint ({@code NESTED}, same connection), are allowed.
 */
@Component
class ReadOnlyToolTransactionGuard implements TransactionExecutionListener {

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	@Override
	public void beforeBegin(TransactionExecution transaction) {
		if (ReadOnlyTransactionToolCallback.isRunning() && transaction.isNewTransaction()
				&& !transaction.isReadOnly()) {
			security.warn("ai read-only tool tried to open a writable transaction name={}",
					transaction.getTransactionName());
			throw new IllegalStateException("A @ReadOnlyTool cannot open a writable transaction");
		}
	}

}
