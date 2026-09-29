package com.maximusflow.os.iam.internal.web;

import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.common.paging.PageQuery;
import com.maximusflow.os.iam.internal.application.AdministratorStatus;
import com.maximusflow.os.iam.internal.application.UserQuery;
import com.maximusflow.os.iam.internal.application.UserService;
import com.maximusflow.os.iam.internal.application.UserSummary;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.jspecify.annotations.Nullable;
import org.springframework.data.web.PagedModel;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/iam/users")
class UserController {

	/** {@code currentPassword} only when {@code roleIds} includes the system administrator role. */
	record InviteUserRequest(@NotBlank @Email @Size(max = 320) String email, @NotBlank @Size(max = 200) String name,
			@Nullable Set<UUID> roleIds, @Nullable @Size(max = 128) String currentPassword) {
	}

	record RenameUserRequest(@NotBlank @Size(max = 200) String name) {
	}

	/**
	 * {@code roleIds} is the full new set; it is required so a partial payload can never wipe roles by
	 * accident. {@code currentPassword} only when the system administrator role is being granted.
	 */
	record AssignRolesRequest(@NotNull Set<UUID> roleIds, @Nullable @Size(max = 128) String currentPassword) {
	}

	private final UserService service;

	UserController(UserService service) {
		this.service = service;
	}

	@GetMapping
	PagedModel<UserSummary> search(@RequestParam(required = false) @Size(max = 200) @Nullable String q,
			@RequestParam(required = false) @Size(max = 5) @Nullable Set<UserQuery.State> state,
			@RequestParam(required = false) @Size(max = 50) @Nullable Set<UUID> roleId,
			@RequestParam(required = false) @Nullable Boolean mfa, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "" + PageQuery.DEFAULT_SIZE) int size,
			@RequestParam(required = false) @Size(max = 40) @Nullable String sort) {
		return new PagedModel<>(this.service.search(new UserQuery(q, orEmpty(state), orEmpty(roleId), mfa),
				PageQuery.of(page, size, sort, UserService.SORTABLE, UserService.DEFAULT_SORT)));
	}

	@GetMapping("/{id}")
	UserSummary get(@PathVariable UUID id) {
		return this.service.get(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	UserService.InvitationIssued invite(@Valid @RequestBody InviteUserRequest request) {
		return this.service.invite(request.email(), request.name(), orEmpty(request.roleIds()),
				request.currentPassword());
	}

	@PostMapping("/{id}/invitations")
	UserService.InvitationIssued resendInvitation(@PathVariable UUID id) {
		return this.service.resendInvitation(id);
	}

	@PatchMapping("/{id}")
	UserSummary rename(@PathVariable UUID id, @Valid @RequestBody RenameUserRequest request) {
		return this.service.rename(id, request.name());
	}

	@PutMapping("/{id}/roles")
	UserSummary assignRoles(@PathVariable UUID id, @Valid @RequestBody AssignRolesRequest request) {
		return this.service.assignRoles(id, request.roleIds(), request.currentPassword());
	}

	/** Active system administrators and the minimum the portal keeps; the users screen warns below it. */
	@GetMapping("/administrators")
	AdministratorStatus administrators() {
		return this.service.administrators();
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

	private static <T> Set<T> orEmpty(@Nullable Set<T> ids) {
		return (ids != null) ? ids : Set.of();
	}

}
