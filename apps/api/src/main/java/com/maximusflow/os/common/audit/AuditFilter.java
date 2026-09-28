package com.maximusflow.os.common.audit;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import jakarta.persistence.criteria.Predicate;

import org.jspecify.annotations.Nullable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

/** Optional criteria for searching the audit trail. Every field is ANDed; null means "any". */
public record AuditFilter(@Nullable String actorEmail, @Nullable String action, @Nullable String entityType,
		@Nullable String entityId, @Nullable Instant from, @Nullable Instant to) {

	Specification<AuditEvent> toSpecification() {
		return (root, query, cb) -> {
			List<Predicate> predicates = new ArrayList<>();
			if (StringUtils.hasText(this.actorEmail)) {
				predicates.add(cb.like(cb.lower(root.get("actorEmail")),
						"%" + this.actorEmail.strip().toLowerCase(Locale.ROOT) + "%"));
			}
			if (StringUtils.hasText(this.action)) {
				predicates.add(cb.like(root.get("action"), this.action.strip() + "%"));
			}
			if (StringUtils.hasText(this.entityType)) {
				predicates.add(cb.equal(root.get("entityType"), this.entityType.strip()));
			}
			if (StringUtils.hasText(this.entityId)) {
				predicates.add(cb.equal(root.get("entityId"), this.entityId.strip()));
			}
			if (this.from != null) {
				predicates.add(cb.greaterThanOrEqualTo(root.get("occurredAt"), this.from));
			}
			if (this.to != null) {
				predicates.add(cb.lessThan(root.get("occurredAt"), this.to));
			}
			return cb.and(predicates.toArray(Predicate[]::new));
		};
	}

}
