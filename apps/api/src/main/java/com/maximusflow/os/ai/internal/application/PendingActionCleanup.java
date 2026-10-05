package com.maximusflow.os.ai.internal.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.ai.internal.domain.PendingAction;
import com.maximusflow.os.ai.internal.persistence.PendingActionRepository;
import com.maximusflow.os.ai.internal.persistence.ToolGrantRepository;
import com.maximusflow.os.common.audit.AuditRecorder;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Closes and then forgets the actions the assistant proposed (pattern of {@code AccountTokenCleanup}
 * and {@code EventPublicationCleanup}).
 *
 * <p>An action nobody confirmed or rejected used to stay PENDING forever; it only became EXPIRED when
 * someone tried it late ({@code PendingActionService}). Every few minutes the overdue ones are marked
 * EXPIRED with the same atomic statement and the same {@code ai.action.expired} audit entry (as the
 * system), so the trail closes every proposal and exactly one of the two paths records it.
 *
 * <p>After {@link #RETENTION} a resolved action (confirmed, rejected, expired, failed) is deleted with
 * its arguments. The assistant's conversations have no retention period of their own (they live until
 * the person deletes them or the account is anonymized), so the period is fixed here. An action whose
 * outcome note is still part of its conversation keeps the row, emptied of arguments and result: the
 * note is how the conversation hides the portal's sentence from the person ({@code ConversationService}),
 * and the row goes with the conversation (ON DELETE CASCADE). An action left EXECUTING by a crash is
 * kept as evidence. What happened stays in the audit trail.
 */
@Component
class PendingActionCleanup {

	/**
	 * How long a resolved action is kept: long enough to answer "what did the assistant propose last
	 * month" from the portal, short enough that tool arguments (which can carry personal data) do not
	 * pile up (LGPD art. 15 and 16: end of treatment once the purpose is met).
	 */
	static final Duration RETENTION = Duration.ofDays(90);

	/** Overdue actions expired per run; the next run picks up the rest. */
	static final int BATCH = 500;

	private static final Set<PendingAction.Status> RESOLVED = EnumSet.of(PendingAction.Status.CONFIRMED,
			PendingAction.Status.REJECTED, PendingAction.Status.EXPIRED, PendingAction.Status.FAILED);

	private static final Logger log = LoggerFactory.getLogger(PendingActionCleanup.class);

	private final PendingActionRepository actions;

	private final AuditRecorder audit;

	private final TransactionTemplate tx;

	private final Clock clock;

	private final ToolGrantRepository grants;

	PendingActionCleanup(PendingActionRepository actions, AuditRecorder audit,
			PlatformTransactionManager transactionManager, Clock clock, ToolGrantRepository grants) {
		this.grants = grants;
		this.actions = actions;
		this.audit = audit;
		this.tx = new TransactionTemplate(transactionManager);
		this.clock = clock;
	}

	@Scheduled(cron = "0 */5 * * * *")
	void expireOverdue() {
		int expired = 0;
		for (UUID id : this.actions.findOverdue(this.clock.instant(), Limit.of(BATCH))) {
			// One transaction per action: the EXPIRED mark and its audit entry commit together.
			if (Boolean.TRUE.equals(this.tx.execute((status) -> expire(id)))) {
				expired++;
			}
		}
		if (expired > 0) {
			log.info("Expired {} pending AI actions", expired);
		}
		// Approvals of a read that the assistant never made again: nothing else removes them.
		Long unused = this.tx.execute((status) -> this.grants.deleteBySingleUseTrueAndExpiresAtBefore(this.clock.instant()));
		if (unused != null && unused > 0) {
			log.info("Removed {} unused one-call approvals", unused);
		}
	}

	private boolean expire(UUID id) {
		return this.actions.findById(id).map((action) -> {
			if (this.actions.expire(id, this.clock.instant()) != 1) {
				return false;
			}
			this.audit.recordSystem("ai.action.expired", "ai_action", id.toString(),
					Map.of("tool", action.getToolName()));
			return true;
		}).orElse(false);
	}

	@Scheduled(cron = "0 41 3 * * *")
	void purgeResolved() {
		Instant before = this.clock.instant().minus(RETENTION);
		int[] counts = this.tx.execute((status) -> new int[] { this.actions.deleteResolvedBefore(RESOLVED, before),
				this.actions.scrubResolvedBefore(RESOLVED, before) });
		if (counts != null && (counts[0] > 0 || counts[1] > 0)) {
			log.info("Deleted {} resolved AI actions and emptied {} kept for their notes", counts[0], counts[1]);
		}
	}

}
