package com.maximusflow.os.common.audit;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;

import com.maximusflow.os.common.error.InvalidRequestException;

/**
 * Position in the audit trail: the (occurredAt, id) of one entry, the key of the listing order.
 * Opaque to clients (base64url). Paging by position instead of by page number keeps every page as
 * fast as the first however deep it is, and new events do not shift the pages being read.
 */
record AuditCursor(Instant occurredAt, UUID id) {

	static AuditCursor of(AuditEventView event) {
		return new AuditCursor(event.occurredAt(), event.id());
	}

	String encode() {
		// Microseconds: the precision PostgreSQL stores, so the value compares equal to the row's.
		long micros = ChronoUnit.MICROS.between(Instant.EPOCH, this.occurredAt);
		return Base64.getUrlEncoder()
			.withoutPadding()
			.encodeToString((micros + "_" + this.id).getBytes(StandardCharsets.US_ASCII));
	}

	static AuditCursor decode(String value) {
		try {
			String text = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.US_ASCII);
			int separator = text.indexOf('_');
			long micros = Long.parseLong(text.substring(0, separator));
			Instant occurredAt = Instant.EPOCH.plus(micros, ChronoUnit.MICROS);
			AuditFilter.requireStorable(occurredAt);
			return new AuditCursor(occurredAt, UUID.fromString(text.substring(separator + 1)));
		}
		catch (IllegalArgumentException | IndexOutOfBoundsException | ArithmeticException
				| java.time.DateTimeException ex) {
			throw new InvalidRequestException("Posição inválida na trilha de auditoria");
		}
	}

}
