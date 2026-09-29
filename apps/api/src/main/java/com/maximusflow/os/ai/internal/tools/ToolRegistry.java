package com.maximusflow.os.ai.internal.tools;

import java.lang.reflect.Method;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

import com.maximusflow.os.common.security.Destructive;
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
import org.springframework.util.ClassUtils;
import org.springframework.util.ReflectionUtils;

/**
 * Discovers every {@code @Tool} method on singleton beans at startup. A tool without
 * {@code @RequiresPermission} fails the boot: a tool the agent could call without authorization is a
 * bug, not a configuration choice. The registry never imports business modules; it only sees beans.
 */
@Component
public class ToolRegistry implements SmartInitializingSingleton {

	private static final Logger log = LoggerFactory.getLogger(ToolRegistry.class);

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
		String name = callback.getToolDefinition().name();
		if (this.tools.containsKey(name)) {
			throw new IllegalStateException("Duplicate AI tool name: " + name);
		}
		Destructive destructive = AnnotatedElementUtils.findMergedAnnotation(method, Destructive.class);
		this.tools.put(name, new RegisteredTool(name, callback.getToolDefinition().description(), permission.value(),
				destructive != null, (destructive != null) ? destructive.value() : "", callback));
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

}
