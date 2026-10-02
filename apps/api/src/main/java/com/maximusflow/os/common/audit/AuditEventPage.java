package com.maximusflow.os.common.audit;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import org.jspecify.annotations.Nullable;

/**
 * One page of the audit trail, newest first, with the positions of the neighbouring pages.
 * {@code total} is exact up to {@link AuditQueryService#COUNT_LIMIT}; beyond that the trail only
 * says there are more ({@code totalExact} false), because counting millions of rows on every page
 * would cost more than the page itself.
 */
public record AuditEventPage(List<AuditEventView> content,
		@Schema(description = "Position of the older page; null on the oldest page") @Nullable String next,
		@Schema(description = "Position of the newer page; null on the newest page") @Nullable String previous,
		long total, boolean totalExact) {

}
