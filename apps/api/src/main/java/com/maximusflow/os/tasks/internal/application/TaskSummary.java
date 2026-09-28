package com.maximusflow.os.tasks.internal.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.maximusflow.os.tasks.internal.domain.Task;
import com.maximusflow.os.tasks.internal.domain.TaskStatus;

import org.jspecify.annotations.Nullable;

public record TaskSummary(UUID id, String title, @Nullable String description, TaskStatus status,
		@Nullable Assignee assignee, @Nullable LocalDate dueDate, @Nullable Instant completedAt, Instant createdAt,
		Instant updatedAt) {

	public record Assignee(UUID id, String name) {
	}

	static TaskSummary of(Task task, @Nullable Assignee assignee) {
		return new TaskSummary(task.getId(), task.getTitle(), task.getDescription(), task.getStatus(), assignee,
				task.getDueDate(), task.getCompletedAt(), task.getCreatedAt(), task.getUpdatedAt());
	}

}
