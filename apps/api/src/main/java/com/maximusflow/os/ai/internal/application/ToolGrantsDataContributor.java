package com.maximusflow.os.ai.internal.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.ToolGrant;
import com.maximusflow.os.ai.internal.persistence.ToolGrantRepository;
import com.maximusflow.os.common.privacy.PersonalDataContributor;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The person's choices for the assistant's tools (LGPD art. 18): exported as they stand and erased
 * entirely. Changes to them stay in the audit trail, as every other change does.
 */
@Component
class ToolGrantsDataContributor implements PersonalDataContributor {

	record ToolGrantExport(String tool, ToolGrant.Mode mode, @Nullable UUID conversationId,
			@Nullable Instant expiresAt, Instant createdAt, @Nullable Instant lastUsedAt) {
	}

	private final ToolGrantRepository grants;

	ToolGrantsDataContributor(ToolGrantRepository grants) {
		this.grants = grants;
	}

	@Override
	public String key() {
		return "assistantToolPermissions";
	}

	@Override
	@Transactional(readOnly = true)
	public List<ToolGrantExport> export(UUID userId, String email) {
		return this.grants.findByUserId(userId).stream()
			.map((g) -> new ToolGrantExport(g.getToolName(), g.getMode(), g.getConversationId(), g.getExpiresAt(),
					g.getCreatedAt(), g.getLastUsedAt()))
			.toList();
	}

	@Override
	@Transactional
	public void erase(UUID userId, String email) {
		this.grants.deleteByUserId(userId);
	}

}
