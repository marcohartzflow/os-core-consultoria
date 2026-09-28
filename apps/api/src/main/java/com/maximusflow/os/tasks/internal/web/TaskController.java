package com.maximusflow.os.tasks.internal.web;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.maximusflow.os.tasks.internal.application.TaskService;
import com.maximusflow.os.tasks.internal.application.TaskSummary;
import com.maximusflow.os.tasks.internal.domain.TaskStatus;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Thin adapter: maps HTTP to {@link TaskService}. Authorization and rules live in the service. */
@RestController
@RequestMapping("/api/tasks")
class TaskController {

	record TaskRequest(@NotBlank @Size(max = 200) String title, @Nullable @Size(max = 2000) String description,
			@Nullable UUID assigneeId, @Nullable LocalDate dueDate) {
	}

	private final TaskService service;

	TaskController(TaskService service) {
		this.service = service;
	}

	@GetMapping
	List<TaskSummary> list(@RequestParam(required = false) @Nullable TaskStatus status,
			@RequestParam(required = false) @Nullable UUID assigneeId) {
		return this.service.list(status, assigneeId);
	}

	@GetMapping("/{id}")
	TaskSummary get(@PathVariable UUID id) {
		return this.service.get(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	TaskSummary create(@Valid @RequestBody TaskRequest request) {
		return this.service.create(request.title(), request.description(), request.assigneeId(), request.dueDate());
	}

	@PutMapping("/{id}")
	TaskSummary update(@PathVariable UUID id, @Valid @RequestBody TaskRequest request) {
		return this.service.update(id, request.title(), request.description(), request.assigneeId(),
				request.dueDate());
	}

	@PostMapping("/{id}/complete")
	TaskSummary complete(@PathVariable UUID id) {
		return this.service.complete(id);
	}

	@PostMapping("/{id}/reopen")
	TaskSummary reopen(@PathVariable UUID id) {
		return this.service.reopen(id);
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@PathVariable UUID id) {
		this.service.delete(id);
	}

}
