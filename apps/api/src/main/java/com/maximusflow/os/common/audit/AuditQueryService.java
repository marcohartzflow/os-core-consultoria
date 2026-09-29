package com.maximusflow.os.common.audit;

import java.io.IOException;
import java.io.Writer;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.security.RequiresPermission;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
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

	private static final Sort NEWEST_FIRST = Sort.by(Sort.Direction.DESC, "occurredAt");

	private final AuditEventRepository repository;

	static final int MAX_ACTIVITY_DAYS = 90;

	private final AuditRecorder recorder;

	private final Clock clock;

	AuditQueryService(AuditEventRepository repository, AuditRecorder recorder, Clock clock) {
		this.repository = repository;
		this.recorder = recorder;
		this.clock = clock;
	}

	/**
	 * One entry per day for the last {@code days} days (today included) in {@code zone}, days
	 * without events included with zeros so a chart has no gaps. Counts only, no personal data.
	 */
	@RequiresPermission(value = "audit.event.read", description = "Ver a trilha de auditoria")
	public List<AuditActivityDay> activity(int days, ZoneId zone) {
		if (days < 1 || days > MAX_ACTIVITY_DAYS) {
			throw new DomainRuleException("O período deve ter entre 1 e " + MAX_ACTIVITY_DAYS + " dias");
		}
		LocalDate today = LocalDate.now(this.clock.withZone(zone));
		LocalDate first = today.minusDays(days - 1L);
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

	@RequiresPermission(value = "audit.event.read", description = "Ver a trilha de auditoria")
	public Page<AuditEventView> search(AuditFilter filter, int page) {
		return this.repository.findAll(filter.toSpecification(), PageRequest.of(page, PAGE_SIZE, NEWEST_FIRST))
			.map(AuditEventView::of);
	}

	@Tool(name = "audit_search",
			description = "Consulta a trilha de auditoria: quem fez o quê e quando. Devolve as 50 entradas mais "
					+ "recentes que atendem aos filtros. Use para perguntas como 'quem desativou X' ou 'o que Y fez ontem'.")
	@RequiresPermission(value = "audit.event.read", description = "Ver a trilha de auditoria")
	public List<AuditEventView> searchForAgent(
			@ToolParam(required = false, description = "Parte do e-mail de quem agiu") @Nullable String actorEmail,
			@ToolParam(required = false,
					description = "Prefixo da ação, ex.: iam.user, tasks.task.deleted") @Nullable String action,
			@ToolParam(required = false, description = "Tipo da entidade, ex.: user, role, task") @Nullable String entityType,
			@ToolParam(required = false, description = "Id da entidade") @Nullable String entityId,
			@ToolParam(required = false, description = "Início (ISO-8601, ex.: 2026-09-01T00:00:00Z)") @Nullable Instant from,
			@ToolParam(required = false, description = "Fim exclusivo (ISO-8601)") @Nullable Instant to) {
		return search(new AuditFilter(actorEmail, action, entityType, entityId, from, to, null, null), 0).getContent();
	}

	/** Writes up to {@value EXPORT_LIMIT} matching entries as CSV (RFC 4180), newest first. */
	@RequiresPermission(value = "audit.event.export", description = "Exportar a trilha de auditoria")
	@Transactional
	public void exportCsv(AuditFilter filter, Writer out) throws IOException {
		this.recorder.record("audit.exported", null, null, null);
		List<AuditEvent> events = this.repository
			.findAll(filter.toSpecification(), PageRequest.of(0, EXPORT_LIMIT, NEWEST_FIRST))
			.getContent();
		out.write("occurred_at,actor_email,origin,action,entity_type,entity_id,ip,correlation_id,details\r\n");
		for (AuditEvent event : events) {
			out.write(String.join(",", csv(event.getOccurredAt().toString()), csv(event.getActorEmail()),
					csv(event.getOrigin().name()), csv(event.getAction()), csv(event.getEntityType()),
					csv(event.getEntityId()), csv(event.getIp()), csv(event.getCorrelationId()),
					csv(event.getDetails())));
			out.write("\r\n");
		}
	}

	static String csv(@Nullable String value) {
		if (value == null) {
			return "";
		}
		// A leading formula character would execute in spreadsheets (CSV injection); neutralize it.
		String safe = (value.startsWith("=") || value.startsWith("+") || value.startsWith("-") || value.startsWith("@")
				|| value.startsWith("\t") || value.startsWith("\r")) ? "'" + value : value;
		return "\"" + safe.replace("\"", "\"\"") + "\"";
	}

}
