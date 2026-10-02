package com.maximusflow.os.common.audit;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.criteria.Predicate;

import com.maximusflow.os.common.error.InvalidRequestException;
import com.maximusflow.os.common.paging.PageQuery;

import org.jspecify.annotations.Nullable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

/**
 * Optional criteria for searching the audit trail. Every field is ANDed; null (or an empty set of
 * origins) means "any". Several origins match any of them. {@code actorEmail} matches part of an
 * address (a search box); {@code actorId} is one exact person (the "events of this person" links).
 * Actions and entity types are recorded in lower case, so both are compared in lower case.
 */
public record AuditFilter(@Nullable String actorEmail, @Nullable UUID actorId, @Nullable String action,
		@Nullable String entityType, @Nullable String entityId, @Nullable Instant from, @Nullable Instant to,
		@Nullable Set<AuditOrigin> origins, @Nullable String correlationId) {

	/** Shorter text cannot use the trigram index on the e-mail, and the search would read the whole trail. */
	static final int MIN_EMAIL_SEARCH = 3;

	/**
	 * Checked here rather than on each caller, so the REST API and the assistant's tool apply the
	 * same limits: the e-mail search is measured after trimming, and instants must be inside what
	 * PostgreSQL stores (a year like -5000 would fail in the database as a 500).
	 */
	public AuditFilter {
		if (StringUtils.hasText(actorEmail) && actorEmail.strip().length() < MIN_EMAIL_SEARCH) {
			throw new InvalidRequestException(
					"A busca por e-mail precisa de pelo menos " + MIN_EMAIL_SEARCH + " caracteres");
		}
		requireStorable(from);
		requireStorable(to);
	}

	/** Years 1 to 9999: inside the timestamptz range and anything a person would ask for. */
	static void requireStorable(@Nullable Instant instant) {
		if (instant != null && (instant.isBefore(EARLIEST) || !instant.isBefore(LATEST))) {
			throw new InvalidRequestException("Data fora do intervalo aceito");
		}
	}

	private static final Instant EARLIEST = LocalDate.of(1, 1, 1).atStartOfDay(ZoneOffset.UTC).toInstant();

	private static final Instant LATEST = LocalDate.of(10_000, 1, 1).atStartOfDay(ZoneOffset.UTC).toInstant();

	/** The criteria that were set, by name, for the details of an audit entry. */
	Map<String, Object> asDetails() {
		Map<String, Object> details = new LinkedHashMap<>();
		putIfSet(details, "actorEmail", this.actorEmail);
		putIfSet(details, "actorId", this.actorId);
		putIfSet(details, "action", this.action);
		putIfSet(details, "entityType", this.entityType);
		putIfSet(details, "entityId", this.entityId);
		putIfSet(details, "from", this.from);
		putIfSet(details, "to", this.to);
		if (this.origins != null && !this.origins.isEmpty()) {
			details.put("origins", this.origins.stream().map(Enum::name).sorted().toList());
		}
		putIfSet(details, "correlationId", this.correlationId);
		return details;
	}

	private static void putIfSet(Map<String, Object> details, String name, @Nullable Object value) {
		if (value != null && !(value instanceof String text && !StringUtils.hasText(text))) {
			details.put(name, value.toString());
		}
	}

	Specification<AuditEvent> toSpecification() {
		return (root, query, cb) -> {
			List<Predicate> predicates = new ArrayList<>();
			if (StringUtils.hasText(this.actorEmail)) {
				predicates.add(cb.like(cb.lower(root.get("actorEmail")),
						PageQuery.contains(this.actorEmail), PageQuery.LIKE_ESCAPE));
			}
			if (this.actorId != null) {
				predicates.add(cb.equal(root.get("actorId"), this.actorId));
			}
			if (StringUtils.hasText(this.action)) {
				predicates.add(cb.like(root.get("action"), PageQuery.startsWith(this.action.toLowerCase(Locale.ROOT)),
						PageQuery.LIKE_ESCAPE));
			}
			if (StringUtils.hasText(this.entityType)) {
				predicates.add(cb.equal(root.get("entityType"), this.entityType.strip().toLowerCase(Locale.ROOT)));
			}
			if (StringUtils.hasText(this.entityId)) {
				predicates.add(cb.equal(root.get("entityId"), this.entityId.strip()));
			}
			if (this.origins != null && !this.origins.isEmpty()) {
				predicates.add(root.get("origin").in(this.origins));
			}
			if (StringUtils.hasText(this.correlationId)) {
				predicates.add(cb.equal(root.get("correlationId"), this.correlationId.strip()));
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
