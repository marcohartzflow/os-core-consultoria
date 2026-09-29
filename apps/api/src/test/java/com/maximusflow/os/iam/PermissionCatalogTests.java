package com.maximusflow.os.iam;

import com.maximusflow.os.common.security.RequiresPermission;

import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

/** The catalog is derived from the annotations; a key must be reserved everywhere or nowhere. */
class PermissionCatalogTests {

	static class Roles {

		@RequiresPermission(value = "demo.role.update", description = "Editar", reserved = true)
		public void update() {
		}

		@RequiresPermission(value = "demo.role.read", description = "Ver")
		public void read() {
		}

	}

	static class Careless {

		@RequiresPermission("demo.role.update")
		public void sneak() {
		}

	}

	@Test
	void reservedFlagsComeFromTheAnnotations() {
		PermissionCatalog catalog = catalogOf(Roles.class);
		assertThat(catalog.isReserved("demo.role.update")).isTrue();
		assertThat(catalog.isReserved("demo.role.read")).isFalse();
		assertThat(catalog.isReserved("unknown")).isFalse();
	}

	@Test
	void aKeyDeclaredReservedInOnePlaceAndNotInAnotherStopsTheApplication() {
		assertThatIllegalStateException().isThrownBy(() -> catalogOf(Roles.class, Careless.class))
			.withMessageContaining("demo.role.update");
	}

	private static PermissionCatalog catalogOf(Class<?>... beans) {
		try (var context = new GenericApplicationContext()) {
			for (Class<?> bean : beans) {
				context.registerBean(bean);
			}
			context.refresh();
			var catalog = new PermissionCatalog(context);
			catalog.afterSingletonsInstantiated();
			return catalog;
		}
	}

}
