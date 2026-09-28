package com.maximusflow.os.iam.internal.web;

import com.maximusflow.os.iam.internal.application.AccountRecoveryService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Public endpoints (no session) for invitation acceptance and password reset. */
@RestController
@RequestMapping("/api/iam")
class AccountRecoveryController {

	record TokenAndPassword(@NotBlank @Size(max = 200) String token, @NotBlank @Size(max = 128) String password) {
	}

	record EmailRequest(@NotBlank @Email @Size(max = 320) String email) {
	}

	private final AccountRecoveryService service;

	AccountRecoveryController(AccountRecoveryService service) {
		this.service = service;
	}

	@PostMapping("/invitations/accept")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void acceptInvitation(@Valid @RequestBody TokenAndPassword request) {
		this.service.acceptInvitation(request.token(), request.password());
	}

	@PostMapping("/password-reset/request")
	@ResponseStatus(HttpStatus.ACCEPTED)
	void requestPasswordReset(@Valid @RequestBody EmailRequest request) {
		this.service.requestPasswordReset(request.email());
	}

	@PostMapping("/password-reset/confirm")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void confirmPasswordReset(@Valid @RequestBody TokenAndPassword request) {
		this.service.confirmPasswordReset(request.token(), request.password());
	}

}
