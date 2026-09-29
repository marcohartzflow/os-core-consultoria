package com.maximusflow.os.auth.internal;

import com.maximusflow.os.common.logging.Sanitize;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Component;

/**
 * Lists and terminates a user's sessions in the session store. Session ids are secrets (they are the
 * cookie value), so callers only ever see an opaque hash of them.
 */
@Component
public class SessionTerminator {

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	public record SessionInfo(String id, Instant createdAt, Instant lastAccessedAt, boolean current) {
	}

	private final FindByIndexNameSessionRepository<? extends Session> sessions;

	SessionTerminator(FindByIndexNameSessionRepository<? extends Session> sessions) {
		this.sessions = sessions;
	}

	public List<SessionInfo> list(String email, @Nullable String currentSessionId) {
		String current = (currentSessionId != null) ? opaque(currentSessionId) : null;
		return this.sessions.findByPrincipalName(email).values().stream()
			.map((session) -> new SessionInfo(opaque(session.getId()), session.getCreationTime(),
					session.getLastAccessedTime(), opaque(session.getId()).equals(current)))
			.sorted(Comparator.comparing(SessionInfo::createdAt).reversed())
			.toList();
	}

	public int terminateAll(String email) {
		return terminate(email, (session) -> true);
	}

	public int terminateOthers(String email, String currentSessionId) {
		return terminate(email, (session) -> !session.getId().equals(currentSessionId));
	}

	public boolean terminateOne(String email, String opaqueId) {
		return terminate(email, (session) -> opaque(session.getId()).equals(opaqueId)) > 0;
	}

	private int terminate(String email, java.util.function.Predicate<Session> which) {
		Map<String, ? extends Session> found = this.sessions.findByPrincipalName(email);
		int count = 0;
		for (Session session : found.values()) {
			if (which.test(session)) {
				this.sessions.deleteById(session.getId());
				count++;
			}
		}
		if (count > 0) {
			security.info("terminated {} session(s) of {}", count, Sanitize.forLog(email));
		}
		return count;
	}

	static String opaque(String sessionId) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(sessionId.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest, 0, 16);
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
