package com.maximusflow.os.iam;

import java.util.Collections;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeMap;
import java.util.TreeSet;

import com.maximusflow.os.common.security.RequiresPermission;

import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;
import org.springframework.util.ClassUtils;
import org.springframework.util.ReflectionUtils;

/**
 * Catalog of every permission the system knows. Built once at startup by scanning
 * {@link RequiresPermission} on all beans, so a permission exists if and only if some use case
 * requires it. Roles can only be granted permissions from this catalog.
 */
@Component
public class PermissionCatalog implements SmartInitializingSingleton {

	private final ApplicationContext context;

	private final TreeMap<String, PermissionDefinition> definitions = new TreeMap<>();

	PermissionCatalog(ApplicationContext context) {
		this.context = context;
	}

	@Override
	public void afterSingletonsInstantiated() {
		for (String beanName : this.context.getBeanDefinitionNames()) {
			Class<?> type = this.context.getType(beanName, false);
			if (type == null) {
				continue;
			}
			Class<?> target = ClassUtils.getUserClass(type);
			RequiresPermission onType = AnnotatedElementUtils.findMergedAnnotation(target, RequiresPermission.class);
			if (onType != null) {
				register(onType);
			}
			ReflectionUtils.doWithMethods(target, (method) -> {
				RequiresPermission onMethod = AnnotatedElementUtils.findMergedAnnotation(method,
						RequiresPermission.class);
				if (onMethod != null) {
					register(onMethod);
				}
			}, ReflectionUtils.USER_DECLARED_METHODS);
		}
	}

	private void register(RequiresPermission annotation) {
		String key = annotation.value();
		int dot = key.indexOf('.');
		String module = (dot > 0) ? key.substring(0, dot) : key;
		this.definitions.merge(key, new PermissionDefinition(key, module, annotation.description()),
				(existing, incoming) -> existing.description().isBlank() ? incoming : existing);
	}

	public SortedSet<PermissionDefinition> all() {
		return Collections.unmodifiableSortedSet(new TreeSet<>(this.definitions.values()));
	}

	public Set<String> keys() {
		return Collections.unmodifiableSet(this.definitions.keySet());
	}

	public boolean contains(String key) {
		return this.definitions.containsKey(key);
	}

}
