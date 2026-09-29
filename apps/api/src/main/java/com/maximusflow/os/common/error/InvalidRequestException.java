package com.maximusflow.os.common.error;

/** A request with parameters outside what the endpoint accepts (page size, sort field). Mapped to HTTP 400. */
public class InvalidRequestException extends RuntimeException {

	public InvalidRequestException(String message) {
		super(message);
	}

}
