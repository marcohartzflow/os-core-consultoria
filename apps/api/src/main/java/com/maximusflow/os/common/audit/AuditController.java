package com.maximusflow.os.common.audit;

import java.io.IOException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;

import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.paging.PageQuery;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import org.jspecify.annotations.Nullable;
import org.springframework.data.web.PagedModel;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class AuditController {

	private final AuditQueryService service;

	AuditController(AuditQueryService service) {
		this.service = service;
	}

	@GetMapping("/api/audit/events")
	PagedModel<AuditEventView> search(@RequestParam(required = false) @Size(max = 320) @Nullable String actorEmail,
			@RequestParam(required = false) @Size(max = 100) @Nullable String action,
			@RequestParam(required = false) @Size(max = 100) @Nullable String entityType,
			@RequestParam(required = false) @Size(max = 100) @Nullable String entityId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) @Nullable Instant from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) @Nullable Instant to,
			@RequestParam(required = false) @Size(max = 3) @Nullable Set<AuditOrigin> origin,
			@RequestParam(required = false) @Size(max = 100) @Nullable String correlationId,
			@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "" + PageQuery.DEFAULT_SIZE) int size,
			@RequestParam(required = false) @Size(max = 40) @Nullable String sort) {
		return new PagedModel<>(this.service.search(
				new AuditFilter(actorEmail, action, entityType, entityId, from, to, origin, correlationId),
				PageQuery.of(page, size, sort, AuditQueryService.SORTABLE, AuditQueryService.DEFAULT_SORT)));
	}

	/**
	 * Daily counts for the dashboard chart. {@code zone} is the viewer's IANA time zone (for example
	 * America/Sao_Paulo) so days start at local midnight; an unknown zone is a 400.
	 */
	@GetMapping("/api/audit/activity")
	List<AuditActivityDay> activity(
			@RequestParam(defaultValue = "30") @Min(1) @Max(AuditQueryService.MAX_ACTIVITY_DAYS) int days,
			@RequestParam(defaultValue = "UTC") @Size(max = 64) String zone) {
		ZoneId zoneId;
		try {
			zoneId = ZoneId.of(zone);
		}
		catch (DateTimeException ex) {
			throw new DomainRuleException("Fuso horário desconhecido");
		}
		return this.service.activity(days, zoneId);
	}

	@GetMapping(value = "/api/audit/events.csv", produces = "text/csv")
	void export(@RequestParam(required = false) @Size(max = 320) @Nullable String actorEmail,
			@RequestParam(required = false) @Size(max = 100) @Nullable String action,
			@RequestParam(required = false) @Size(max = 100) @Nullable String entityType,
			@RequestParam(required = false) @Size(max = 100) @Nullable String entityId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) @Nullable Instant from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) @Nullable Instant to,
			@RequestParam(required = false) @Size(max = 3) @Nullable Set<AuditOrigin> origin,
			@RequestParam(required = false) @Size(max = 100) @Nullable String correlationId,
			HttpServletResponse response) throws IOException {
		response.setContentType("text/csv; charset=UTF-8");
		response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"auditoria.csv\"");
		response.setHeader("X-Content-Type-Options", "nosniff");
		this.service.exportCsv(
				new AuditFilter(actorEmail, action, entityType, entityId, from, to, origin, correlationId),
				response.getWriter());
	}

}
