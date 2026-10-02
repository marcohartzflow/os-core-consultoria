package com.maximusflow.os.iam.internal.application;

import java.time.Clock;

import com.maximusflow.os.iam.internal.persistence.AccountTokenRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Deletes invitation and reset tokens once used or expired, as Spring Session JDBC does for expired
 * sessions. Only the hash is stored, but a row still says that someone was invited or asked for a
 * reset, and that is kept no longer than the link can be used.
 */
@Component
class AccountTokenCleanup {

	private static final Logger log = LoggerFactory.getLogger(AccountTokenCleanup.class);

	private final AccountTokenRepository tokens;

	private final Clock clock;

	AccountTokenCleanup(AccountTokenRepository tokens, Clock clock) {
		this.tokens = tokens;
		this.clock = clock;
	}

	@Scheduled(cron = "0 17 * * * *")
	@Transactional
	void deleteSpent() {
		int deleted = this.tokens.deleteSpent(this.clock.instant());
		if (deleted > 0) {
			log.info("Deleted {} used or expired account tokens", deleted);
		}
	}

}
