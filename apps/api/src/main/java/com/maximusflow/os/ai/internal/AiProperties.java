package com.maximusflow.os.ai.internal;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("os.ai")
public record AiProperties(@DefaultValue("5m") Duration pendingActionTtl, @DefaultValue("40") int maxMessages,
		@DefaultValue("4000") int maxUserMessageLength,
		/** Hard stop for one agent turn: the SSE response ends and the model stream is cancelled. */
		@DefaultValue("5m") Duration turnTimeout,
		/** Turns one person may have running at the same time; more get 429. */
		@DefaultValue("2") int maxConcurrentTurnsPerUser) {

}
