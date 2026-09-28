package com.maximusflow.os.common.openapi;

import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.maximusflow.os.OsApiApplication;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.Schema;

import org.jspecify.annotations.Nullable;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.type.classreading.CachingMetadataReaderFactory;
import org.springframework.core.type.classreading.MetadataReader;
import org.springframework.util.ClassUtils;

/**
 * Makes the OpenAPI document say what the Java records already say: a component annotated with
 * JSpecify {@code @Nullable} becomes nullable, and every component is required because Jackson
 * always writes it (null included). Without this the generated TypeScript client would treat every
 * field as optional and non-null, which is wrong in both directions. Records are matched to schemas by simple name, the same rule springdoc
 * uses to name them.
 */
@Configuration(proxyBeanMethods = false)
class JSpecifyOpenApiCustomizer {

	@Bean
	OpenApiCustomizer jspecifyNullability() {
		Map<String, Class<?>> records = recordsBySimpleName();
		return (openApi) -> {
			if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
				return;
			}
			openApi.getComponents().getSchemas().forEach((name, schema) -> {
				Class<?> record = records.get(name);
				if (record != null) {
					apply(record, schema);
				}
			});
		};
	}

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private static void apply(Class<?> record, Schema<?> schema) {
		Map<String, Schema> properties = schema.getProperties();
		if (properties == null) {
			return;
		}
		List<String> required = new ArrayList<>();
		for (RecordComponent component : record.getRecordComponents()) {
			Schema property = properties.get(component.getName());
			if (property == null) {
				continue;
			}
			if (component.getAnnotatedType().isAnnotationPresent(Nullable.class)) {
				properties.put(component.getName(), nullable(property));
			}
			required.add(component.getName());
		}
		if (!required.isEmpty()) {
			schema.setRequired(required);
		}
	}

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private static Schema nullable(Schema property) {
		if (property.get$ref() != null) {
			Schema nullSchema = new Schema<>();
			nullSchema.setTypes(Set.of("null"));
			Schema wrapper = new Schema<>();
			wrapper.setAnyOf(List.of(property, nullSchema));
			return wrapper;
		}
		Set<String> types = new LinkedHashSet<>();
		if (property.getTypes() != null) {
			types.addAll(property.getTypes());
		}
		else if (property.getType() != null) {
			types.add(property.getType());
		}
		else {
			// Free-form object (e.g. a raw JSON document).
			types.add("object");
		}
		types.add("null");
		property.setTypes(types);
		return property;
	}

	/** Every record under the application's base package, keyed by simple name. */
	private static Map<String, Class<?>> recordsBySimpleName() {
		Map<String, Class<?>> found = new HashMap<>();
		try {
			var resolver = new PathMatchingResourcePatternResolver();
			var readers = new CachingMetadataReaderFactory(resolver);
			String base = ClassUtils.convertClassNameToResourcePath(OsApiApplication.class.getPackageName());
			for (var resource : resolver.getResources("classpath*:" + base + "/**/*.class")) {
				MetadataReader reader = readers.getMetadataReader(resource);
				Class<?> type = ClassUtils.forName(reader.getClassMetadata().getClassName(),
						JSpecifyOpenApiCustomizer.class.getClassLoader());
				if (type.isRecord()) {
					found.put(type.getSimpleName(), type);
				}
			}
		}
		catch (Exception ex) {
			throw new IllegalStateException("Could not scan records for the OpenAPI document", ex);
		}
		return found;
	}

}
