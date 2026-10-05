package com.maximusflow.os.ai.internal.application;

import com.maximusflow.os.ai.internal.persistence.ConversationRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Removes chat memory left without its conversation, once a day. Deleting a conversation or erasing a
 * person's data clears the memory in the same transaction; this catches what bypasses that path (rows
 * deleted directly in the database), so no message text outlives its conversation (LGPD art. 15 and 16).
 */
@Component
class ChatMemoryCleanup {

	private static final Logger log = LoggerFactory.getLogger(ChatMemoryCleanup.class);

	private final ConversationRepository conversations;

	ChatMemoryCleanup(ConversationRepository conversations) {
		this.conversations = conversations;
	}

	@Scheduled(cron = "0 47 3 * * *")
	@Transactional
	void deleteOrphans() {
		int removed = this.conversations.deleteOrphanMemory();
		if (removed > 0) {
			log.info("Removed {} chat memory rows without a conversation", removed);
		}
	}

}
