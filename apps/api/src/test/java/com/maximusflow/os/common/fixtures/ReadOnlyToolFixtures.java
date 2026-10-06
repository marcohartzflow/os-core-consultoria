package com.maximusflow.os.common.fixtures;

import com.maximusflow.os.common.security.ReadOnlyTool;
import com.maximusflow.os.common.security.RequiresPermission;

import org.springframework.ai.tool.annotation.Tool;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Tools declared outside the ai module (the registry refuses tools inside it), for the registry's
 * read-only rules.
 */
public final class ReadOnlyToolFixtures {

	private ReadOnlyToolFixtures() {
	}

	public static class Reader {

		@Tool(name = "fixture_read", description = "x")
		@ReadOnlyTool
		@RequiresPermission("tasks.task.read")
		public String read() {
			return "readOnly=" + TransactionSynchronizationManager.isCurrentTransactionReadOnly() + ",active="
					+ TransactionSynchronizationManager.isActualTransactionActive();
		}

	}

	public static class Escaping {

		@Tool(name = "fixture_escape", description = "x")
		@ReadOnlyTool
		@RequiresPermission("tasks.task.read")
		@Transactional(propagation = Propagation.REQUIRES_NEW)
		public String read() {
			return "no";
		}

	}

}
