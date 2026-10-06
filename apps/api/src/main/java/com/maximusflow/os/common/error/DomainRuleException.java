package com.maximusflow.os.common.error;

/** A request that is well-formed but violates a business rule. Mapped to HTTP 422. */
public class DomainRuleException extends RuntimeException {

	public DomainRuleException(String message) {
		super(message);
	}

}
