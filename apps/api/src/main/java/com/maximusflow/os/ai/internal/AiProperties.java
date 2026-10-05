package com.maximusflow.os.ai.internal;

import java.time.Duration;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

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
		@DefaultValue("4000") @Min(1) @Max(MAX_USER_MESSAGE_LENGTH_CEILING) int maxUserMessageLength,
		/**
		 * Models a person may pick, in the order the picker shows them. The first one whose provider has
		 * an API key is the default. Only these ids are ever sent to a provider: the request names one,
		 * it never supplies an arbitrary model.
		 */
		@NotEmpty List<@Valid Model> models,
		/**
		 * Whether a person may let low-risk actions run without asking, for good ("Permitir sempre").
		 * A company that wants every action confirmed turns it off; existing grants stop working at once.
		 */
		@DefaultValue("true") boolean allowAlways,
		/** How long "Permitir sempre" lasts before the assistant asks again. */
		@DefaultValue("30d") Duration allowAlwaysFor,
		/**
		 * Actions one turn may run without asking; beyond it the rest ask again, so an injected "do it
		 * for every record" stops at the person.
		 */
		@DefaultValue("5") @Min(0) int maxAutoActionsPerTurn) {

	/** Upper bound for {@code os.ai.max-user-message-length}; the REST body is validated against it. */
	public static final int MAX_USER_MESSAGE_LENGTH_CEILING = 32_000;

	/**
	 * One entry of the picker. {@code context} is a label ("1M", "200K"), not a limit the server enforces.
	 */
	public record Model(@NotBlank @Size(max = 100) @Pattern(regexp = "[A-Za-z0-9._-]+") String id,
			@NotNull AiProvider provider, @NotBlank String name, @NotBlank String description, @NotBlank String context) {
	}

	@AssertTrue(message = "os.ai.models must not repeat an id")
	boolean isModelIdsUnique() {
		return this.models == null || this.models.stream().map(Model::id).distinct().count() == this.models.size();
	}

}
