package com.maximusflow.os.common.audit;

import java.io.IOException;
import java.io.Writer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.security.ReadOnlyTool;
import com.maximusflow.os.common.security.RequiresPermission;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.hibernate.Session;
import org.hibernate.query.criteria.HibernateCriteriaBuilder;
import org.hibernate.query.criteria.JpaCriteriaQuery;
import org.hibernate.query.criteria.JpaRoot;
import org.hibernate.query.criteria.JpaSubQuery;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read side of the audit trail (LGPD art. 37: the controller must be able to show who did what and
 * when). Exporting the trail is itself audited, because it copies personal data out of the system;
 * paging through it on screen is not, to keep the trail readable.
 */
@Service
@Transactional(readOnly = true)
public class AuditQueryService {

	static final int PAGE_SIZE = 50;

	static final int EXPORT_LIMIT = 10_000;

	/** Totals are exact up to this many entries; past it the screen shows "10.000+". */
	static final int COUNT_LIMIT = 10_000;

	static final int MAX_ACTIVITY_DAYS = 90;

	/**
	 * The one order of the trail, served by the index (occurred_at DESC, id DESC). No null handling
	 * is asked for: an explicit NULLS clause would not match the index and force a sort.
	 */
	static final Sort NEWEST_FIRST = Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("id"));

	private static final Sort OLDEST_FIRST = Sort.by(Sort.Order.asc("occurredAt"), Sort.Order.asc("id"));

	private final AuditEventRepository repository;

	private final AuditRecorder recorder;

	private final Clock clock;

	private final EntityManager entityManager;

	AuditQueryService(AuditEventRepository repository, AuditRecorder recorder, Clock clock,
			EntityManager entityManager) {
		this.repository = repository;
		this.recorder = recorder;
		this.clock = clock;
		this.entityManager = entityManager;
	}

	/**
	 * One entry per day for the last {@code days} days (today included) in {@code zone}, days
	 * without events included with zeros so a chart has no gaps. Counts only, no personal data.
	 */
	@RequiresPermission(value = "audit.event.read", description = "Ver a trilha de auditoria")
	@Transactional
	public List<AuditActivityDay> activity(int days, ZoneId zone) {
		if (days < 1 || days > MAX_ACTIVITY_DAYS) {
			throw new DomainRuleException("O período deve ter entre 1 e " + MAX_ACTIVITY_DAYS + " dias");
		}
		LocalDate today = LocalDate.now(this.clock.withZone(zone));
		LocalDate first = today.minusDays(days - 1L);
		// The chart reads 15-minute totals instead of the events: its cost stays the same however
		// many events the period has. The totals are first brought up to the latest event.
		this.repository.lockActivityBuckets();
		this.repository.refreshActivityBuckets(activitySince());
		Map<LocalDate, AuditEventRepository.DailyActivity> byDay = this.repository
			.dailyActivity(first.atStartOfDay(zone).toInstant(), zone.getId())
			.stream()
			.collect(Collectors.toMap(AuditEventRepository.DailyActivity::getDay, Function.identity()));
		List<AuditActivityDay> result = new ArrayList<>(days);
		for (LocalDate day = first; !day.isAfter(today); day = day.plusDays(1)) {
			AuditEventRepository.DailyActivity row = byDay.get(day);
			result.add(row == null ? AuditActivityDay.empty(day)
					: new AuditActivityDay(day, row.getRest(), row.getAiTool(), row.getSystem(), row.getLoginSuccess(),
							row.getLoginFailure()));
		}
		return result;
	}

	/**
	 * Where the refresh of the 15-minute totals starts: one hour before the newest bucket, so an
	 * event committed a little after its own time is still counted; 91 days ago (the oldest the
	 * chart reads) when nothing was counted yet. Always a bucket start, so no bucket is half counted.
	 */
	private Instant activitySince() {
		Instant floor = this.clock.instant().minus(Duration.ofDays(MAX_ACTIVITY_DAYS + 1L));
		Instant latest = this.repository.latestActivityBucket();
		// Never past now: an event stamped in the future (a clock that jumped) would otherwise move the
		// start ahead and leave the events in between uncounted until the clock caught up.
		if (latest != null && latest.isAfter(this.clock.instant())) {
			latest = this.clock.instant();
		}
		Instant since = (latest == null || latest.minus(Duration.ofHours(1)).isBefore(floor)) ? floor
				: latest.minus(Duration.ofHours(1));
		long bucketSeconds = Duration.ofMinutes(15).toSeconds();
		return Instant.ofEpochSecond(Math.floorDiv(since.getEpochSecond(), bucketSeconds) * bucketSeconds);
	}

	/**
	 * One page of the trail, newest first. Without a position it is the newest page; {@code after}
	 * gives the page of older entries, {@code before} the page of newer ones and {@code oldest} the
	 * last page. Each page is read straight from an index starting at the position, so its cost does
	 * not grow with how deep it is.
	 */
	@RequiresPermission(value = "audit.event.read", description = "Ver a trilha de auditoria")
	public AuditEventPage search(AuditFilter filter, @Nullable AuditCursor after, @Nullable AuditCursor before,
			boolean oldest, int size) {
		Specification<AuditEvent> matching = filter.toSpecification();
		// Newer entries (and the oldest page) are read in ascending order and turned around.
		boolean ascending = before != null || oldest;
		Specification<AuditEvent> spec = matching;
		if (after != null) {
			spec = spec.and(olderThan(after));
		}
		else if (before != null) {
			spec = spec.and(newerThan(before));
		}
		List<AuditEventView> rows = new ArrayList<>(this.repository
			.findBy(spec, (query) -> query.sortBy(ascending ? OLDEST_FIRST : NEWEST_FIRST).limit(size + 1).all())
			.stream()
			.map(AuditEventView::of)
			.toList());
		boolean more = rows.size() > size;
		if (more) {
			rows.removeLast();
		}
		if (ascending) {
			Collections.reverse(rows);
		}
		String next = null;
		String previous = null;
		if (!rows.isEmpty()) {
			String first = AuditCursor.of(rows.getFirst()).encode();
			String last = AuditCursor.of(rows.getLast()).encode();
			if (ascending) {
				// Read backwards: "more" means newer entries exist. Older ones always do (the
				// position itself), except on the oldest page.
				next = oldest ? null : last;
				previous = more ? first : null;
			}
			else {
				next = more ? last : null;
				previous = (after != null) ? first : null;
			}
		}
		long total = countUpTo(matching, COUNT_LIMIT + 1);
		return new AuditEventPage(rows, next, previous, Math.min(total, COUNT_LIMIT), total <= COUNT_LIMIT);
	}

	/**
	 * Entries after the position in the listing order, (occurredAt, id) &lt; position, written as
	 * {@code occurredAt <= t AND (occurredAt < t OR (occurredAt = t AND id < i))}. The first term
	 * lets the index start at the position; without it the database reads every newer entry and
	 * throws it away (measured: 1.1 s instead of 0.02 ms, 3 million entries).
	 */
	private static Specification<AuditEvent> olderThan(AuditCursor position) {
		return (root, query, cb) -> {
			Path<Instant> at = root.get("occurredAt");
			Path<UUID> id = root.get("id");
			return cb.and(cb.lessThanOrEqualTo(at, position.occurredAt()), cb.or(cb.lessThan(at, position.occurredAt()),
					cb.and(cb.equal(at, position.occurredAt()), cb.lessThan(id, position.id()))));
		};
	}

	private static Specification<AuditEvent> newerThan(AuditCursor position) {
		return (root, query, cb) -> {
			Path<Instant> at = root.get("occurredAt");
			Path<UUID> id = root.get("id");
			return cb.and(cb.greaterThanOrEqualTo(at, position.occurredAt()),
					cb.or(cb.greaterThan(at, position.occurredAt()),
							cb.and(cb.equal(at, position.occurredAt()), cb.greaterThan(id, position.id()))));
		};
	}

	/**
	 * Matching entries counted up to {@code limit}: {@code SELECT count(*) FROM (SELECT ... LIMIT n)}.
	 * A plain count reads every match (the whole trail when unfiltered); this one stops at the limit.
	 */
	long countUpTo(Specification<AuditEvent> spec, int limit) {
		HibernateCriteriaBuilder cb = this.entityManager.unwrap(Session.class).getCriteriaBuilder();
		JpaCriteriaQuery<Long> count = cb.createQuery(Long.class);
		JpaSubQuery<Tuple> matching = count.subquery(Tuple.class);
		JpaRoot<AuditEvent> root = matching.from(AuditEvent.class);
		matching.multiselect(root.get("id").alias("id"));
		Predicate predicate = spec.toPredicate(root, count, cb);
		if (predicate != null) {
			matching.where(predicate);
		}
		matching.fetch(limit);
		count.from(matching);
		count.select(cb.count());
		return this.entityManager.createQuery(count).getSingleResult();
	}

	/** The trail as the agent sees it: without IP addresses ({@link AuditEntryForAgent}). */
	@Tool(name = "audit_search",
			description = "Consulta a trilha de auditoria: quem fez o quê e quando. Devolve as 50 entradas mais "
					+ "recentes que atendem aos filtros. Use para perguntas como 'quem desativou X' ou 'o que Y fez ontem'.")
	@ReadOnlyTool
	@RequiresPermission(value = "audit.event.read", description = "Ver a trilha de auditoria")
	public List<AuditEntryForAgent> searchForAgent(
			@ToolParam(required = false, description = "Parte do e-mail de quem agiu") @Nullable String actorEmail,
			@ToolParam(required = false,
					description = "Prefixo da ação, ex.: iam.user, tasks.task.deleted") @Nullable String action,
			@ToolParam(required = false, description = "Tipo da entidade, ex.: user, role, task") @Nullable String entityType,
			@ToolParam(required = false, description = "Id da entidade") @Nullable String entityId,
			@ToolParam(required = false, description = "Início (ISO-8601, ex.: 2026-09-01T00:00:00Z)") @Nullable Instant from,
			@ToolParam(required = false, description = "Fim exclusivo (ISO-8601)") @Nullable Instant to) {
		return this.repository
			.findBy(new AuditFilter(actorEmail, null, action, entityType, entityId, from, to, null, null)
				.toSpecification(), (query) -> query.sortBy(NEWEST_FIRST).limit(PAGE_SIZE).all())
			.stream()
			.map(AuditEntryForAgent::of)
			.toList();
	}

	/** Writes up to {@value EXPORT_LIMIT} matching entries as CSV (RFC 4180), newest first. */
	@RequiresPermission(value = "audit.event.export", description = "Exportar a trilha de auditoria")
	@Transactional
	public void exportCsv(AuditFilter filter, Writer out) throws IOException {
		// One row past the limit tells whether the file was cut, without counting every match.
		List<AuditEvent> events = new ArrayList<>(this.repository.findBy(filter.toSpecification(),
				(query) -> query.sortBy(NEWEST_FIRST).limit(EXPORT_LIMIT + 1).all()));
		boolean truncated = events.size() > EXPORT_LIMIT;
		if (truncated) {
			events.removeLast();
		}
		// What was copied out: the filters used and how many rows, so the export is traceable.
		Map<String, Object> details = new LinkedHashMap<>(filter.asDetails());
		details.put("rows", events.size());
		details.put("truncated", truncated);
		this.recorder.record("audit.exported", null, null, details);
		// Written before the first byte leaves: once the file is streaming, a failed commit could no
		// longer stop it, and the copy would have left without its entry in the trail.
		this.entityManager.flush();
		out.write("occurred_at,actor_email,origin,action,entity_type,entity_id,ip,correlation_id,details\r\n");
		for (AuditEvent event : events) {
			out.write(String.join(",", csv(event.getOccurredAt().toString()), csv(event.getActorEmail()),
					csv(event.getOrigin().name()), csv(event.getAction()), csv(event.getEntityType()),
					csv(event.getEntityId()), csv(event.getIp()), csv(event.getCorrelationId()),
					csv(event.getDetails())));
			out.write("\r\n");
		}
	}

	/**
	 * First characters that make a spreadsheet read a cell as a formula (OWASP CSV injection),
	 * including the full-width forms some spreadsheets also accept and a leading line break.
	 */
	private static final String FORMULA_START = "=+-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20";

	static String csv(@Nullable String value) {
		if (value == null) {
			return "";
		}
		// A leading formula character would execute in spreadsheets (CSV injection). OWASP: prefix a tab
		// inside the quoted field; a single quote is not reliable once Excel saves and reopens the file.
		String safe = (!value.isEmpty() && FORMULA_START.indexOf(value.charAt(0)) >= 0) ? "\t" + value : value;
		return "\"" + safe.replace("\"", "\"\"") + "\"";
	}

}
