package com.maximusflow.os.tasks.internal.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.maximusflow.os.common.privacy.PersonalDataContributor;
import com.maximusflow.os.tasks.internal.domain.Task;
import com.maximusflow.os.tasks.internal.domain.TaskStatus;
import com.maximusflow.os.tasks.internal.persistence.TaskRepository;

import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * The tasks a person created or is responsible for (LGPD art. 18 II: the export says what the portal
 * holds linked to them). Who else touched a task is left out: that is another person's data.
 *
 * <p>Erasure keeps the tasks. They are the company's work records, not the person's, and they point at
 * the person only by user id (created_by, updated_by, assignee_id); anonymizing the account
 * (iam {@code AccountDataContributor}) replaces the name and e-mail behind that id, so the id no longer
 * identifies anyone. Free text someone typed into a title or description is not scanned: if it names
 * the person, an administrator edits or deletes the task.
 */
@Component
class TasksDataContributor implements PersonalDataContributor {

	record TaskExport(UUID id, String title, @Nullable String description, TaskStatus status,
			@Nullable LocalDate dueDate, @Nullable Instant completedAt, Instant createdAt, Instant updatedAt,
			boolean createdByYou, boolean assignedToYou) {
	}

	private final TaskRepository tasks;

	TasksDataContributor(TaskRepository tasks) {
		this.tasks = tasks;
	}

	@Override
	public String key() {
		return "tasks";
	}

	@Override
	public List<TaskExport> export(UUID userId, String email) {
		return this.tasks.findAllByCreatedByOrAssigneeIdOrderByCreatedAtAsc(userId, userId)
			.stream()
			.map((task) -> export(task, userId))
			.toList();
	}

	private static TaskExport export(Task task, UUID userId) {
		return new TaskExport(task.getId(), task.getTitle(), task.getDescription(), task.getStatus(),
				task.getDueDate(), task.getCompletedAt(), task.getCreatedAt(), task.getUpdatedAt(),
				userId.equals(task.getCreatedBy()), userId.equals(task.getAssigneeId()));
	}

	@Override
	public void erase(UUID userId, String email) {
		// Kept on purpose; see class comment.
	}

}
