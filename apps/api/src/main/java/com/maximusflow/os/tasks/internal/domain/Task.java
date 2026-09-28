package com.maximusflow.os.tasks.internal.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.maximusflow.os.common.persistence.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.jspecify.annotations.Nullable;

@Entity
@Table(name = "tasks")
public class Task extends AuditableEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(nullable = false, length = 200)
	private String title;

	@Column(length = 2000)
	private @Nullable String description;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private TaskStatus status;

	@Column(name = "assignee_id")
	private @Nullable UUID assigneeId;

	@Column(name = "due_date")
	private @Nullable LocalDate dueDate;

	@Column(name = "completed_at")
	private @Nullable Instant completedAt;

	protected Task() {
	}

	private Task(String title, @Nullable String description, @Nullable UUID assigneeId, @Nullable LocalDate dueDate) {
		this.title = title.strip();
		this.description = description;
		this.status = TaskStatus.OPEN;
		this.assigneeId = assigneeId;
		this.dueDate = dueDate;
	}

	public static Task open(String title, @Nullable String description, @Nullable UUID assigneeId,
			@Nullable LocalDate dueDate) {
		return new Task(title, description, assigneeId, dueDate);
	}

	public void update(String title, @Nullable String description, @Nullable UUID assigneeId,
			@Nullable LocalDate dueDate) {
		this.title = title.strip();
		this.description = description;
		this.assigneeId = assigneeId;
		this.dueDate = dueDate;
	}

	public boolean complete(Instant now) {
		if (this.status == TaskStatus.DONE) {
			return false;
		}
		this.status = TaskStatus.DONE;
		this.completedAt = now;
		return true;
	}

	public void reopen() {
		this.status = TaskStatus.OPEN;
		this.completedAt = null;
	}

	public UUID getId() {
		return this.id;
	}

	public String getTitle() {
		return this.title;
	}

	public @Nullable String getDescription() {
		return this.description;
	}

	public TaskStatus getStatus() {
		return this.status;
	}

	public @Nullable UUID getAssigneeId() {
		return this.assigneeId;
	}

	public @Nullable LocalDate getDueDate() {
		return this.dueDate;
	}

	public @Nullable Instant getCompletedAt() {
		return this.completedAt;
	}

}
