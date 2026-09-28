package com.maximusflow.os.iam.internal.web;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.iam.internal.application.RoleService;
import com.maximusflow.os.iam.internal.application.RoleSummary;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/iam/roles")
class RoleController {

	record RoleRequest(@NotBlank @Size(max = 100) String name, @Nullable @Size(max = 500) String description,
			@NotNull Set<String> permissions) {
	}

	private final RoleService service;

	RoleController(RoleService service) {
		this.service = service;
	}

	@GetMapping
	List<RoleSummary> list() {
		return this.service.list();
	}

	@GetMapping("/{id}")
	RoleSummary get(@PathVariable UUID id) {
		return this.service.get(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	RoleSummary create(@Valid @RequestBody RoleRequest request) {
		return this.service.create(request.name(), request.description(), request.permissions());
	}

	@PutMapping("/{id}")
	RoleSummary update(@PathVariable UUID id, @Valid @RequestBody RoleRequest request) {
		return this.service.update(id, request.name(), request.description(), request.permissions());
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@PathVariable UUID id) {
		this.service.delete(id);
	}

}
