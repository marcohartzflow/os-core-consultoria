package com.maximusflow.os.iam.internal.application;

import java.util.List;

import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.iam.PermissionCatalog;
import com.maximusflow.os.iam.PermissionDefinition;

import org.springframework.stereotype.Service;

@Service
public class PermissionService {

	private final PermissionCatalog catalog;

	PermissionService(PermissionCatalog catalog) {
		this.catalog = catalog;
	}

	@RequiresPermission(value = "iam.permission.read", description = "Ver o catálogo de permissões")
	public List<PermissionDefinition> list() {
		return List.copyOf(this.catalog.all());
	}

}
