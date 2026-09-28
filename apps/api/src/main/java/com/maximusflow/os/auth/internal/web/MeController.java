package com.maximusflow.os.auth.internal.web;

import java.util.List;
import java.util.UUID;

import com.maximusflow.os.auth.internal.SessionAdminService;
import com.maximusflow.os.auth.internal.SessionTerminator;
import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.privacy.PersonalDataService;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.UserDirectory;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The authenticated user's own account and sessions. */
@RestController
class MeController {

	record ChangePasswordRequest(@NotBlank @Size(max = 128) String currentPassword,
			@NotBlank @Size(max = 128) String newPassword) {
	}

	private final CurrentUser currentUser;

	private final UserDirectory userDirectory;

	private final SessionTerminator sessions;

	private final SessionAdminService sessionAdmin;

	private final AuditRecorder audit;

	private final PersonalDataService personalData;

	MeController(CurrentUser currentUser, UserDirectory userDirectory, SessionTerminator sessions,
			SessionAdminService sessionAdmin, AuditRecorder audit, PersonalDataService personalData) {
		this.personalData = personalData;
		this.currentUser = currentUser;
		this.userDirectory = userDirectory;
		this.sessions = sessions;
		this.sessionAdmin = sessionAdmin;
		this.audit = audit;
	}

	@GetMapping("/api/me")
	MeResponse me() {
		OsPrincipal principal = this.currentUser.require();
		return this.userDirectory.findById(principal.getId()).map(MeResponse::of)
			.orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
	}

	/** LGPD art. 18 II: everything the portal holds about the person, as a downloadable JSON document. */
	@GetMapping(value = "/api/me/data", produces = "application/json")
	org.springframework.http.ResponseEntity<java.util.Map<String, Object>> exportData() {
		OsPrincipal principal = this.currentUser.require();
		return org.springframework.http.ResponseEntity.ok()
			.header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"meus-dados.json\"")
			.header("X-Content-Type-Options", "nosniff")
			.body(this.personalData.export(principal.getId(), principal.getEmail()));
	}

	/** Changes the password, keeps this session and terminates every other one (ASVS 7.4.3). */
	@PostMapping("/api/me/password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void changePassword(@Valid @RequestBody ChangePasswordRequest body, HttpServletRequest request) {
		OsPrincipal principal = this.currentUser.require();
		this.userDirectory.changePassword(principal.getId(), body.currentPassword(), body.newPassword());
		this.sessions.terminateOthers(principal.getEmail(), requireSessionId(request));
	}

	@GetMapping("/api/me/sessions")
	List<SessionTerminator.SessionInfo> sessions(HttpServletRequest request) {
		return this.sessions.list(this.currentUser.require().getEmail(), sessionId(request));
	}

	@DeleteMapping("/api/me/sessions")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void terminateOtherSessions(HttpServletRequest request) {
		OsPrincipal principal = this.currentUser.require();
		int count = this.sessions.terminateOthers(principal.getEmail(), requireSessionId(request));
		this.audit.record("auth.sessions.terminated_others", "user", principal.getId().toString(),
				java.util.Map.of("count", count));
	}

	@DeleteMapping("/api/me/sessions/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void terminateSession(@PathVariable String id) {
		OsPrincipal principal = this.currentUser.require();
		if (!this.sessions.terminateOne(principal.getEmail(), id)) {
			throw new NotFoundException("Sessão não encontrada");
		}
		this.audit.record("auth.session.terminated", "user", principal.getId().toString(), java.util.Map.of("session", id));
	}

	@DeleteMapping("/api/iam/users/{id}/sessions")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void terminateUserSessions(@PathVariable UUID id) {
		this.sessionAdmin.terminateAll(id);
	}

	private static @Nullable String sessionId(HttpServletRequest request) {
		HttpSession session = request.getSession(false);
		return (session != null) ? session.getId() : null;
	}

	private static String requireSessionId(HttpServletRequest request) {
		String id = sessionId(request);
		if (id == null) {
			throw new IllegalStateException("Authenticated request without session");
		}
		return id;
	}

}
