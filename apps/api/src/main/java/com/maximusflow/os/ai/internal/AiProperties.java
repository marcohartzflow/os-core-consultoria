package com.maximusflow.os.ai.internal;

import java.time.Duration;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

@ConfigurationProperties("os.ai")
@Validated
public record AiProperties(@DefaultValue("5m") Duration pendingActionTtl, @DefaultValue("40") @Min(1) int maxMessages,
		/** Hard stop for one agent turn: the SSE response ends and the model stream is cancelled. */
		@DefaultValue("5m") Duration turnTimeout,
		/** Turns one person may have running at the same time; more get 429. */
		@DefaultValue("2") @Min(1) int maxConcurrentTurnsPerUser,
		/** Turns one person may start per minute (sliding window); more get 429 (OWASP LLM10). */
		@DefaultValue("20") @Min(1) int turnsPerMinute,
		/**
		 * Characters in one message to the assistant. A fork may change it up to
		 * {@link #MAX_USER_MESSAGE_LENGTH_CEILING}, which also bounds the request body validation.
		 */
		@DefaultValue("4000") @Min(1) @Max(MAX_USER_MESSAGE_LENGTH_CEILING) int maxUserMessageLength) {

	/** Upper bound for {@code os.ai.max-user-message-length}; the REST body is validated against it. */
	public static final int MAX_USER_MESSAGE_LENGTH_CEILING = 32_000;

}
