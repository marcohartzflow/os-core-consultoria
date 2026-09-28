package com.maximusflow.os.ai.internal;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("os.ai")
public record AiProperties(@DefaultValue("5m") Duration pendingActionTtl, @DefaultValue("40") int maxMessages,
		@DefaultValue("4000") int maxUserMessageLength) {

}
