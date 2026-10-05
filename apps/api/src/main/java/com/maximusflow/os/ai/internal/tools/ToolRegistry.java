package com.maximusflow.os.ai.internal.tools;

import java.lang.reflect.Method;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

import com.maximusflow.os.common.security.ReadOnlyTool;
import com.maximusflow.os.common.security.RequiresConfirmation;
import com.maximusflow.os.common.security.RequiresPermission;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.metadata.ToolMetadata;
import org.springframework.ai.tool.method.MethodToolCallback;
import org.springframework.ai.tool.support.ToolDefinitions;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionAttribute;
import org.springframework.util.ClassUtils;
import org.springframework.util.ReflectionUtils;

/**
 * Discovers every {@code @Tool} method on singleton beans at startup. A tool without
 * {@code @RequiresPermission} fails the boot: a tool the agent could call without authorization is a
 * bug, not a configuration choice. So does a tool that declares neither {@code @ReadOnlyTool} nor
 * {@code @RequiresConfirmation}: nothing runs without confirmation unless it says it only reads. A
 * {@code @ReadOnlyTool} is then held to it: every call runs in a read-only transaction
 * ({@link ReadOnlyTransactionToolCallback}), so the database refuses a write, and a read-only tool whose
 * own transaction would escape that one (REQUIRES_NEW, NOT_SUPPORTED) fails the boot. The registry never
 * imports business modules; it only sees beans.
 */
@Component
public class ToolRegistry implements SmartInitializingSingleton {

	private static final Logger log = LoggerFactory.getLogger(ToolRegistry.class);

	private static final AnnotationTransactionAttributeSource TRANSACTION_ATTRIBUTES =
			new AnnotationTransactionAttributeSource();

	private final ApplicationContext context;

	private final TreeMap<String, RegisteredTool> tools = new TreeMap<>();

	ToolRegistry(ApplicationContext context) {
		this.context = context;
	}

	@Override
	public void afterSingletonsInstantiated() {
		for (String beanName : this.context.getBeanDefinitionNames()) {
			if (!this.context.isSingleton(beanName)) {
				continue;
			}
			Class<?> type = this.context.getType(beanName, false);
			if (type == null) {
				continue;
			}
			Class<?> userClass = ClassUtils.getUserClass(type);
			ReflectionUtils.doWithMethods(userClass, (method) -> {
				Tool tool = AnnotatedElementUtils.findMergedAnnotation(method, Tool.class);
				if (tool != null) {
					register(beanName, userClass, method, tool);
				}
			}, ReflectionUtils.USER_DECLARED_METHODS);
		}
		log.info("AI tool registry: {} tool(s) {}", this.tools.size(), this.tools.keySet());
	}

	private void register(String beanName, Class<?> userClass, Method method, Tool tool) {
		RequiresPermission permission = AnnotatedElementUtils.findMergedAnnotation(method, RequiresPermission.class);
		if (permission == null) {
			permission = AnnotatedElementUtils.findMergedAnnotation(userClass, RequiresPermission.class);
		}
		if (permission == null) {
			throw new IllegalStateException("AI tool " + userClass.getSimpleName() + "." + method.getName()
					+ " has @Tool but no @RequiresPermission. Every tool must require a permission.");
		}
		if (permission.reserved()) {
			throw new IllegalStateException("AI tool " + userClass.getSimpleName() + "." + method.getName()
					+ " requires the reserved permission " + permission.value()
					+ ". Access management stays with people in the portal; it is never an AI tool.");
		}
		ReadOnlyTool readOnly = AnnotatedElementUtils.findMergedAnnotation(method, ReadOnlyTool.class);
		RequiresConfirmation confirmation = AnnotatedElementUtils.findMergedAnnotation(method,
				RequiresConfirmation.class);
		if ((readOnly == null) == (confirmation == null)) {
			throw new IllegalStateException("AI tool " + userClass.getSimpleName() + "." + method.getName()
					+ " must declare exactly one of @ReadOnlyTool or @RequiresConfirmation."
					+ " A tool that changes anything waits for the person's confirmation.");
		}
		if (confirmation != null && confirmation.value().isBlank()) {
			throw new IllegalStateException("AI tool " + userClass.getSimpleName() + "." + method.getName()
					+ " has an empty @RequiresConfirmation. Say what the person is confirming.");
		}
		if (userClass.getPackageName().startsWith(ToolRegistry.class.getPackageName().replace(".internal.tools", ""))) {
			throw new IllegalStateException("AI tool " + userClass.getSimpleName() + "." + method.getName()
					+ " lives in the ai module. Confirm, reject and the chat itself are never tools.");
		}
		Object bean = this.context.getBean(beanName);
		ToolCallback callback = MethodToolCallback.builder()
			.toolDefinition(ToolDefinitions.from(method))
			.toolMetadata(ToolMetadata.from(method))
			.toolMethod(method)
			.toolObject(bean)
			.build();
		if (readOnly != null) {
			callback = readOnly(userClass, method, callback);
		}
		String name = callback.getToolDefinition().name();
		if (this.tools.containsKey(name)) {
			throw new IllegalStateException("Duplicate AI tool name: " + name);
		}
		this.tools.put(name, new RegisteredTool(name, callback.getToolDefinition().description(), permission.value(),
				confirmation != null, (confirmation != null) ? confirmation.value() : readSummary(callback),
				// A read-only tool asks nothing; HIGH keeps "waive the confirmation" off for it all the same.
				(confirmation != null) ? confirmation.risk() : RequiresConfirmation.Risk.HIGH, callback));
	}

	/**
	 * Wraps a {@code @ReadOnlyTool} in a read-only transaction. The tool's own transaction attribute is
	 * resolved the way Spring's transaction interceptor resolves it (method, then class); one that would
	 * start a separate transaction or run without one could write outside the guard, so it is refused.
	 */
	private ToolCallback readOnly(Class<?> userClass, Method method, ToolCallback callback) {
		TransactionAttribute own = TRANSACTION_ATTRIBUTES.getTransactionAttribute(method, userClass);
		if (own != null && (own.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW
				|| own.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NOT_SUPPORTED)) {
			throw new IllegalStateException("AI tool " + userClass.getSimpleName() + "." + method.getName()
					+ " is @ReadOnlyTool but its @Transactional suspends the caller's transaction."
					+ " A read-only tool runs inside the read-only transaction the registry opens.");
		}
		PlatformTransactionManager transactionManager = this.context.getBeanProvider(PlatformTransactionManager.class)
			.getIfUnique();
		if (transactionManager == null) {
			throw new IllegalStateException("AI tool " + userClass.getSimpleName() + "." + method.getName()
					+ " is @ReadOnlyTool, which needs a single PlatformTransactionManager to run it read-only.");
		}
		return new ReadOnlyTransactionToolCallback(callback, transactionManager);
	}

	public Collection<RegisteredTool> all() {
		return this.tools.values();
	}

	public Optional<RegisteredTool> find(String name) {
		return Optional.ofNullable(this.tools.get(name));
	}

	/** Tools whose required permission is in the given set. The set comes from the session authorities. */
	public List<RegisteredTool> forPermissions(Set<String> permissions) {
		return this.tools.values().stream().filter((tool) -> permissions.contains(tool.permission())).toList();
	}


	/**
	 * What the approval card says for a read the person chose to approve first: the first sentence of
	 * the description, which is written for the model but reads well enough ("Lista os usuários…").
	 */
	private static String readSummary(ToolCallback callback) {
		String description = callback.getToolDefinition().description().strip();
		int end = description.indexOf(". ");
		String first = (end > 0) ? description.substring(0, end) : description.replaceAll("\\.$", "");
		return (first.length() > 200) ? first.substring(0, 199) + "…" : first;
	}

}
