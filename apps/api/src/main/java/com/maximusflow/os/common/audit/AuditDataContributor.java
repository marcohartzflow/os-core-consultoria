package com.maximusflow.os.common.audit;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import com.maximusflow.os.common.privacy.PersonalDataContributor;

import org.springframework.stereotype.Component;

/**
 * The audit entries about the person. Never erased: the trail exists to meet a legal
 * obligation (LGPD art. 7 II and art. 16 I) and is append-only by policy.
 */
@Component
class AuditDataContributor implements PersonalDataContributor {

	private final AuditEventRepository repository;

	AuditDataContributor(AuditEventRepository repository) {
		this.repository = repository;
	}

	@Override
	public String key() {
		return "audit";
	}

	/**
	 * Everything in the trail that concerns the person (LGPD art. 18 II): what they did, what was done
	 * to their account, and the attempts made with their e-mail without a session (failed logins,
	 * reset requests). Newest first, up to {@value AuditQueryService#EXPORT_LIMIT} entries, with a
	 * flag when there were more. Entries someone else made about the account keep the action, the time,
	 * the origin and the actor id, but not that person's e-mail or IP, which are the administrator's
	 * personal data, not the subject's.
	 */
	@Override
	public Map<String, Object> export(UUID userId, String email) {
		String address = email.strip().toLowerCase(Locale.ROOT);
		List<AuditEvent> events = new ArrayList<>(this.repository.findBy(
				(root, query, cb) -> cb.or(cb.equal(root.get("actorId"), userId),
						cb.equal(root.get("entityId"), userId.toString()),
						cb.equal(cb.lower(root.get("actorEmail")), address)),
				(q) -> q.sortBy(AuditQueryService.NEWEST_FIRST).limit(AuditQueryService.EXPORT_LIMIT + 1).all()));
		boolean truncated = events.size() > AuditQueryService.EXPORT_LIMIT;
		if (truncated) {
			events.removeLast();
		}
		return Map.of("events", events.stream().map((event) -> forSubject(event, userId, address)).toList(),
				"truncated", truncated);
	}

	/** The entry as the subject sees it; {@code address} is their e-mail, stripped and lower case. */
	static AuditEventView forSubject(AuditEvent event, UUID userId, String address) {
		AuditEventView view = AuditEventView.of(event);
		String actorEmail = view.actorEmail();
		boolean ownAction = userId.equals(view.actorId())
				|| (actorEmail != null && address.equals(actorEmail.toLowerCase(Locale.ROOT)));
		if (ownAction) {
			return view;
		}
		return new AuditEventView(view.id(), view.occurredAt(), view.actorId(), null, view.origin(), view.action(),
				view.entityType(), view.entityId(), view.details(), null, view.correlationId());
	}

	@Override
	public void erase(UUID userId, String email) {
		// Kept on purpose; see class comment.
	}

}
