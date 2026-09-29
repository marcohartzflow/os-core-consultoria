package com.maximusflow.os.tasks.internal.persistence;

import java.util.List;
import java.util.UUID;

import com.maximusflow.os.tasks.internal.domain.Task;
import com.maximusflow.os.tasks.internal.domain.TaskStatus;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskRepository extends JpaRepository<Task, UUID> {

	List<Task> findAllByOrderByStatusAscDueDateAscCreatedAtAsc(Limit limit);

	List<Task> findAllByStatusOrderByDueDateAscCreatedAtAsc(TaskStatus status, Limit limit);

	List<Task> findAllByAssigneeIdOrderByStatusAscDueDateAscCreatedAtAsc(UUID assigneeId, Limit limit);

	List<Task> findAllByStatusAndAssigneeIdOrderByDueDateAscCreatedAtAsc(TaskStatus status, UUID assigneeId,
			Limit limit);

}
