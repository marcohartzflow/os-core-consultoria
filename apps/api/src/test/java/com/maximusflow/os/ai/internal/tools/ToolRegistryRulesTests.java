package com.maximusflow.os.ai.internal.tools;

import com.maximusflow.os.common.security.RequiresPermission;

import org.junit.jupiter.api.Test;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.context.support.GenericApplicationContext;

import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

/** Boot-time rules of the tool registry: a violation stops the application from starting. */
class ToolRegistryRulesTests {

	static class AccessManagement {

		@Tool(name = "grant_everything", description = "x")
		@RequiresPermission(value = "iam.user.roles.assign", reserved = true)
		public String grant() {
			return "no";
		}

	}

	static class Unguarded {

		@Tool(name = "unguarded", description = "x")
		public String call() {
			return "no";
		}

	}

	static class Ordinary {

		@Tool(name = "tasks_probe", description = "x")
		@RequiresPermission("tasks.task.read")
		public String call() {
			return "ok";
		}

	}

	@Test
	void aToolThatRequiresAReservedPermissionIsRefused() {
		assertThatIllegalStateException().isThrownBy(() -> registryWith(AccessManagement.class))
			.withMessageContaining("reserved permission iam.user.roles.assign");
	}

	@Test
	void aToolWithoutAPermissionIsRefused() {
		assertThatIllegalStateException().isThrownBy(() -> registryWith(Unguarded.class))
			.withMessageContaining("no @RequiresPermission");
	}

	/** These sample classes live in the ai module's package, so this rule applies to them too. */
	@Test
	void aToolDeclaredInsideTheAiModuleIsRefused() {
		assertThatIllegalStateException().isThrownBy(() -> registryWith(Ordinary.class))
			.withMessageContaining("lives in the ai module");
	}

	private static ToolRegistry registryWith(Class<?> bean) {
		try (var context = new GenericApplicationContext()) {
			context.registerBean(bean);
			context.refresh();
			var registry = new ToolRegistry(context);
			registry.afterSingletonsInstantiated();
			return registry;
		}
	}

}
