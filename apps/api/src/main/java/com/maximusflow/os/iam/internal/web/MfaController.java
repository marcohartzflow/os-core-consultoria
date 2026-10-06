package com.maximusflow.os.iam.internal.web;

import java.util.List;
import java.util.UUID;

import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.SecondFactor;
import com.maximusflow.os.common.security.SecondFactorGrant;
import com.maximusflow.os.iam.MfaStatus;
import com.maximusflow.os.iam.internal.application.MfaService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Second factor: self-service enrolment under /api/me/mfa and administrative reset. */
@RestController
class MfaController {

	record CodeRequest(@NotBlank @Size(max = 20) String code) {
	}

	// Password fields: 512 UTF-16 units (4 × 128), so the password policy's 128 code points is the limit.
	record SetupRequest(@NotBlank @Size(max = 512) String currentPassword) {
	}

	record DisableRequest(@NotBlank @Size(max = 512) String currentPassword) {
	}

	record RecoveryCodes(List<String> recoveryCodes) {
	}

	private final MfaService service;

	private final CurrentUser currentUser;

	private final SecondFactorGrant secondFactor;

	MfaController(MfaService service, CurrentUser currentUser, SecondFactorGrant secondFactor) {
		this.service = service;
		this.secondFactor = secondFactor;
		this.currentUser = currentUser;
	}

	@GetMapping("/api/me/mfa")
	MfaStatus status() {
		return this.service.status(this.currentUser.require().getId());
	}

	@PostMapping("/api/me/mfa/setup")
	MfaService.Setup setup(@Valid @RequestBody SetupRequest body) {
		return this.service.beginSetup(body.currentPassword());
	}

	/** The account's first factor, enabled in this session, also counts as passed for this session. */
	@PostMapping("/api/me/mfa/confirm")
	RecoveryCodes confirm(@Valid @RequestBody CodeRequest body, HttpServletRequest request,
			HttpServletResponse response) {
		var added = this.service.confirmSetup(body.code());
		// Only the account's first factor proves this session; a factor added to an older session must
		// not refresh it, or enrolling one would stand in for the step-up.
		if (added.firstFactor()) {
			this.secondFactor.grant(SecondFactor.TOTP_AUTHORITY, request, response);
		}
		return new RecoveryCodes(added.recoveryCodes());
	}

	@PostMapping("/api/me/mfa/recovery-codes")
	RecoveryCodes regenerateRecoveryCodes(@Valid @RequestBody SetupRequest body) {
		return new RecoveryCodes(this.service.regenerateRecoveryCodes(body.currentPassword()));
	}

	@PostMapping("/api/me/mfa/disable")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void disable(@Valid @RequestBody DisableRequest body) {
		this.service.disable(body.currentPassword());
	}

	@PostMapping("/api/iam/users/{id}/mfa/reset")
	MfaService.SecondFactorReset reset(@PathVariable UUID id) {
		return this.service.reset(id);
	}

}
