package com.maximusflow.os.iam;

/** One entry of the permission catalog, derived from a {@code @RequiresPermission} annotation. */
public record PermissionDefinition(String key, String module, String description) implements Comparable<PermissionDefinition> {

	@Override
	public int compareTo(PermissionDefinition other) {
		return this.key.compareTo(other.key);
	}

}
