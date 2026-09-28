package com.maximusflow.os.iam.internal.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Builds links into the web portal. */
@Component
class AppLinks {

	private final String baseUrl;

	AppLinks(@Value("${os.app.base-url}") String baseUrl) {
		this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
	}

	String invitation(String token) {
		return this.baseUrl + "/invite/" + token;
	}

	String passwordReset(String token) {
		return this.baseUrl + "/password-reset/" + token;
	}

}
