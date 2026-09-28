package com.maximusflow.os.common.audit;

import java.util.List;
import java.util.UUID;

import com.maximusflow.os.common.privacy.PersonalDataContributor;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

/**
 * The person's own actions in the audit trail. Never erased: the trail exists to meet a legal
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

	@Override
	public List<AuditEventView> export(UUID userId, String email) {
		return this.repository
			.findAll((root, query, cb) -> cb.equal(root.get("actorId"), userId),
					PageRequest.of(0, AuditQueryService.EXPORT_LIMIT, Sort.by(Sort.Direction.DESC, "occurredAt")))
			.map(AuditEventView::of)
			.getContent();
	}

	@Override
	public void erase(UUID userId, String email) {
		// Kept on purpose; see class comment.
	}

}
