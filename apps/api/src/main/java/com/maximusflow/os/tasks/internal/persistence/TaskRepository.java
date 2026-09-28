package com.maximusflow.os.tasks.internal.persistence;

import java.util.List;
import java.util.UUID;

import com.maximusflow.os.tasks.internal.domain.Task;
import com.maximusflow.os.tasks.internal.domain.TaskStatus;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskRepository extends JpaRepository<Task, UUID> {

	List<Task> findAllByOrderByStatusAscDueDateAscCreatedAtAsc();

	List<Task> findAllByStatusOrderByDueDateAscCreatedAtAsc(TaskStatus status);

	List<Task> findAllByAssigneeIdOrderByStatusAscDueDateAscCreatedAtAsc(UUID assigneeId);

	List<Task> findAllByStatusAndAssigneeIdOrderByDueDateAscCreatedAtAsc(TaskStatus status, UUID assigneeId);

}
