package com.maximusflow.os.iam;

/**
 * One entry of the permission catalog, derived from a {@code @RequiresPermission} annotation.
 * {@code reserved} permissions belong to the system administrator role only.
 */
public record PermissionDefinition(String key, String module, String description, boolean reserved)
		implements Comparable<PermissionDefinition> {

	@Override
	public int compareTo(PermissionDefinition other) {
		return this.key.compareTo(other.key);
	}

}
