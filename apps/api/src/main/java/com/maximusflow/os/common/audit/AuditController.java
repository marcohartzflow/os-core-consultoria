package com.maximusflow.os.common.audit;

import java.io.IOException;
import java.time.Instant;

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
			@RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page) {
		return new PagedModel<>(
				this.service.search(new AuditFilter(actorEmail, action, entityType, entityId, from, to), page));
	}

	@GetMapping(value = "/api/audit/events.csv", produces = "text/csv")
	void export(@RequestParam(required = false) @Size(max = 320) @Nullable String actorEmail,
			@RequestParam(required = false) @Size(max = 100) @Nullable String action,
			@RequestParam(required = false) @Size(max = 100) @Nullable String entityType,
			@RequestParam(required = false) @Size(max = 100) @Nullable String entityId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) @Nullable Instant from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) @Nullable Instant to,
			HttpServletResponse response) throws IOException {
		response.setContentType("text/csv; charset=UTF-8");
		response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"auditoria.csv\"");
		response.setHeader("X-Content-Type-Options", "nosniff");
		this.service.exportCsv(new AuditFilter(actorEmail, action, entityType, entityId, from, to),
				response.getWriter());
	}

}
