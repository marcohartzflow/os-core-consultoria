package com.maximusflow.os.common.audit;

import java.io.IOException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import com.maximusflow.os.common.error.InvalidRequestException;
import com.maximusflow.os.common.paging.PageQuery;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import org.jspecify.annotations.Nullable;
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

	/**
	 * Newest first, a page at a time: without a position the newest page; {@code after} (the
	 * {@code next} of a page) the older page, {@code before} (the {@code previous}) the newer one,
	 * {@code oldest=true} the last page. {@code actorEmail} matches part of an address and needs at
	 * least 3 characters: shorter text cannot use the trigram index and would read the whole trail.
	 */
	@GetMapping("/api/audit/events")
	AuditEventPage search(
			@RequestParam(required = false) @Size(min = 3, max = 320) @Nullable String actorEmail,
			@RequestParam(required = false) @Nullable UUID actorId,
			@RequestParam(required = false) @Size(max = 100) @Nullable String action,
			@RequestParam(required = false) @Size(max = 100) @Nullable String entityType,
			@RequestParam(required = false) @Size(max = 100) @Nullable String entityId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) @Nullable Instant from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) @Nullable Instant to,
			@RequestParam(required = false) @Size(max = 3) @Nullable Set<AuditOrigin> origin,
			@RequestParam(required = false) @Size(max = 100) @Nullable String correlationId,
			@RequestParam(required = false) @Size(max = 100) @Nullable String after,
			@RequestParam(required = false) @Size(max = 100) @Nullable String before,
			@RequestParam(defaultValue = "false") boolean oldest,
			@RequestParam(defaultValue = "" + PageQuery.DEFAULT_SIZE) @Min(1) @Max(PageQuery.MAX_SIZE) int size) {
		if (Stream.of(after, before, oldest ? "" : null).filter(Objects::nonNull).count() > 1) {
			throw new InvalidRequestException("Use só um de after, before e oldest");
		}
		return this.service.search(
				new AuditFilter(actorEmail, actorId, action, entityType, entityId, from, to, origin, correlationId),
				(after != null) ? AuditCursor.decode(after) : null, (before != null) ? AuditCursor.decode(before) : null,
				oldest, size);
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
			throw new InvalidRequestException("Fuso horário desconhecido");
		}
		// Regions only (America/Sao_Paulo, UTC). PostgreSQL reads a bare offset such as +03:00 as a
		// POSIX zone, where the sign means the opposite, and would group the days six hours off.
		if (zoneId instanceof ZoneOffset || zoneId.getId().contains(":")) {
			throw new InvalidRequestException("Use o nome do fuso horário, por exemplo America/Sao_Paulo");
		}
		return this.service.activity(days, zoneId);
	}

	@GetMapping(value = "/api/audit/events.csv", produces = "text/csv")
	void export(@RequestParam(required = false) @Size(min = 3, max = 320) @Nullable String actorEmail,
			@RequestParam(required = false) @Nullable UUID actorId,
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
				new AuditFilter(actorEmail, actorId, action, entityType, entityId, from, to, origin, correlationId),
				response.getWriter());
	}

}
