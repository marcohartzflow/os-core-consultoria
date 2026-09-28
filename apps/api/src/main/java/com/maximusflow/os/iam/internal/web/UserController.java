package com.maximusflow.os.iam.internal.web;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.iam.internal.application.UserService;
import com.maximusflow.os.iam.internal.application.UserSummary;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/iam/users")
class UserController {

	record InviteUserRequest(@NotBlank @Email @Size(max = 320) String email, @NotBlank @Size(max = 200) String name,
			@Nullable Set<UUID> roleIds) {
	}

	/** {@code roleIds} is the full new set; it is required so a partial payload can never wipe roles by accident. */
	record UpdateUserRequest(@NotBlank @Size(max = 200) String name, @NotNull Set<UUID> roleIds) {
	}

	private final UserService service;

	UserController(UserService service) {
		this.service = service;
	}

	@GetMapping
	List<UserSummary> list() {
		return this.service.list();
	}

	@GetMapping("/{id}")
	UserSummary get(@PathVariable UUID id) {
		return this.service.get(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	UserService.InvitationIssued invite(@Valid @RequestBody InviteUserRequest request) {
		return this.service.invite(request.email(), request.name(), orEmpty(request.roleIds()));
	}

	@PostMapping("/{id}/invitations")
	UserService.InvitationIssued resendInvitation(@PathVariable UUID id) {
		return this.service.resendInvitation(id);
	}

	@PatchMapping("/{id}")
	UserSummary update(@PathVariable UUID id, @Valid @RequestBody UpdateUserRequest request) {
		return this.service.update(id, request.name(), request.roleIds());
	}

	@PostMapping("/{id}/disable")
	UserSummary disable(@PathVariable UUID id) {
		return this.service.disable(id);
	}

	@PostMapping("/{id}/enable")
	UserSummary enable(@PathVariable UUID id) {
		return this.service.enable(id);
	}

	@PostMapping("/{id}/anonymize")
	UserSummary anonymize(@PathVariable UUID id) {
		return this.service.anonymize(id);
	}

	private static Set<UUID> orEmpty(@Nullable Set<UUID> ids) {
		return (ids != null) ? ids : Set.of();
	}

}
