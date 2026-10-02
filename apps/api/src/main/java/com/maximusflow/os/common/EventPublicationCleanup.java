package com.maximusflow.os.common;

import java.time.Duration;

import org.springframework.modulith.events.CompletedEventPublications;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Spring Modulith keeps completed event publications in the archive table and leaves purging them
 * to the application ("Purging Completed Event Publications" in its reference documentation). They
 * are kept for a month to diagnose deliveries, then deleted.
 */
@Component
class EventPublicationCleanup {

	private static final Duration RETENTION = Duration.ofDays(30);

	private final CompletedEventPublications completed;

	EventPublicationCleanup(CompletedEventPublications completed) {
		this.completed = completed;
	}

	@Scheduled(cron = "0 23 3 * * *")
	void purgeArchive() {
		this.completed.deletePublicationsOlderThan(RETENTION);
	}

}
