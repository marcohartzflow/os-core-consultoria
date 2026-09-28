package com.maximusflow.os.iam.internal.web;

import java.util.List;
import java.util.UUID;

import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.MfaSession;
import com.maximusflow.os.iam.MfaStatus;
import com.maximusflow.os.iam.internal.application.MfaService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
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

	record DisableRequest(@NotBlank @Size(max = 128) String currentPassword, @NotBlank @Size(max = 20) String code) {
	}

	record RecoveryCodes(List<String> recoveryCodes) {
	}

	private final MfaService service;

	private final CurrentUser currentUser;

	MfaController(MfaService service, CurrentUser currentUser) {
		this.service = service;
		this.currentUser = currentUser;
	}

	@GetMapping("/api/me/mfa")
	MfaStatus status() {
		return this.service.status(this.currentUser.require().getId());
	}

	@PostMapping("/api/me/mfa/setup")
	MfaService.Setup setup() {
		return this.service.beginSetup();
	}

	/** Enabling in this session also counts as having passed the factor for this session. */
	@PostMapping("/api/me/mfa/confirm")
	RecoveryCodes confirm(@Valid @RequestBody CodeRequest body, HttpServletRequest request) {
		List<String> codes = this.service.confirmSetup(body.code());
		HttpSession session = request.getSession(false);
		if (session != null) {
			session.setAttribute(MfaSession.VERIFIED, Boolean.TRUE);
		}
		return new RecoveryCodes(codes);
	}

	@PostMapping("/api/me/mfa/disable")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void disable(@Valid @RequestBody DisableRequest body) {
		this.service.disable(body.currentPassword(), body.code());
	}

	@PostMapping("/api/iam/users/{id}/mfa/reset")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void reset(@PathVariable UUID id) {
		this.service.reset(id);
	}

}
