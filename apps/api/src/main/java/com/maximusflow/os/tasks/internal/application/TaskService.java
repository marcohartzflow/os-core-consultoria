package com.maximusflow.os.tasks.internal.application;

import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.Destructive;
import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.UserDirectory;
import com.maximusflow.os.tasks.internal.domain.Task;
import com.maximusflow.os.tasks.internal.domain.TaskStatus;
import com.maximusflow.os.tasks.internal.persistence.TaskRepository;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Use cases of the example module. Each public method is the single entry point for both the REST
 * controller and the AI agent: authorization, validation and audit live here, not in the callers.
 */
@Service
@Transactional
public class TaskService {

	private final TaskRepository tasks;

	private final UserDirectory users;

	private final AuditRecorder audit;

	private final Clock clock;

	TaskService(TaskRepository tasks, UserDirectory users, AuditRecorder audit, Clock clock) {
		this.tasks = tasks;
		this.users = users;
		this.audit = audit;
		this.clock = clock;
	}

	@Tool(name = "tasks_list",
			description = "Lista as tarefas da empresa com título, status (OPEN ou DONE), responsável e prazo. "
					+ "Filtre por status e/ou por id do responsável quando o usuário pedir.")
	@RequiresPermission(value = "tasks.task.read", description = "Ver tarefas")
	@Transactional(readOnly = true)
	public List<TaskSummary> list(
			@ToolParam(required = false, description = "Filtra por status: OPEN ou DONE") @Nullable TaskStatus status,
			@ToolParam(required = false, description = "Filtra por id (UUID) do responsável") @Nullable UUID assigneeId) {
		List<Task> found;
		if (status != null && assigneeId != null) {
			found = this.tasks.findAllByStatusAndAssigneeIdOrderByDueDateAscCreatedAtAsc(status, assigneeId);
		}
		else if (status != null) {
			found = this.tasks.findAllByStatusOrderByDueDateAscCreatedAtAsc(status);
		}
		else if (assigneeId != null) {
			found = this.tasks.findAllByAssigneeIdOrderByStatusAscDueDateAscCreatedAtAsc(assigneeId);
		}
		else {
			found = this.tasks.findAllByOrderByStatusAscDueDateAscCreatedAtAsc();
		}
		Map<UUID, Optional<TaskSummary.Assignee>> names = new HashMap<>();
		return found.stream().map((task) -> summary(task, names)).toList();
	}

	@Tool(name = "tasks_get", description = "Detalha uma tarefa pelo id.")
	@RequiresPermission(value = "tasks.task.read", description = "Ver tarefas")
	@Transactional(readOnly = true)
	public TaskSummary get(@ToolParam(description = "Id (UUID) da tarefa") UUID id) {
		return summary(load(id), new HashMap<>());
	}

	@Tool(name = "tasks_create",
			description = "Cria uma tarefa. Use quando o usuário pedir para anotar, criar ou delegar algo a fazer. "
					+ "O responsável é opcional e deve ser o id de um usuário ativo do portal (obtenha com iam_list_users).")
	@RequiresPermission(value = "tasks.task.create", description = "Criar tarefas")
	public TaskSummary create(@ToolParam(description = "Título curto da tarefa") String title,
			@ToolParam(required = false, description = "Detalhes da tarefa") @Nullable String description,
			@ToolParam(required = false, description = "Id (UUID) do usuário responsável") @Nullable UUID assigneeId,
			@ToolParam(required = false, description = "Prazo no formato AAAA-MM-DD") @Nullable LocalDate dueDate) {
		validate(title, description);
		Task task = this.tasks.save(Task.open(title, description, activeAssignee(assigneeId), dueDate));
		this.audit.record("tasks.task.created", "task", task.getId().toString(),
				Map.of("title", task.getTitle(), "assigneeId", String.valueOf(task.getAssigneeId())));
		return summary(task, new HashMap<>());
	}

	@RequiresPermission(value = "tasks.task.update", description = "Editar tarefas")
	public TaskSummary update(UUID id, String title, @Nullable String description, @Nullable UUID assigneeId,
			@Nullable LocalDate dueDate) {
		validate(title, description);
		Task task = load(id);
		task.update(title, description, activeAssignee(assigneeId), dueDate);
		this.audit.record("tasks.task.updated", "task", task.getId().toString(),
				Map.of("title", task.getTitle(), "assigneeId", String.valueOf(task.getAssigneeId())));
		return summary(task, new HashMap<>());
	}

	@Tool(name = "tasks_complete", description = "Marca uma tarefa como concluída (status DONE).")
	@RequiresPermission(value = "tasks.task.update", description = "Editar tarefas")
	public TaskSummary complete(@ToolParam(description = "Id (UUID) da tarefa") UUID id) {
		Task task = load(id);
		if (!task.complete(this.clock.instant())) {
			throw new DomainRuleException("A tarefa já está concluída");
		}
		this.audit.record("tasks.task.completed", "task", task.getId().toString(), null);
		return summary(task, new HashMap<>());
	}

	@RequiresPermission(value = "tasks.task.update", description = "Editar tarefas")
	public TaskSummary reopen(UUID id) {
		Task task = load(id);
		task.reopen();
		this.audit.record("tasks.task.reopened", "task", task.getId().toString(), null);
		return summary(task, new HashMap<>());
	}

	@Tool(name = "tasks_delete", description = "Exclui uma tarefa definitivamente. Exige confirmação da pessoa.")
	@Destructive("Exclui a tarefa definitivamente")
	@RequiresPermission(value = "tasks.task.delete", description = "Excluir tarefas")
	public void delete(@ToolParam(description = "Id (UUID) da tarefa") UUID id) {
		Task task = load(id);
		this.tasks.delete(task);
		this.audit.record("tasks.task.deleted", "task", id.toString(), Map.of("title", task.getTitle()));
	}

	private Task load(UUID id) {
		return this.tasks.findById(id).orElseThrow(() -> new NotFoundException("Tarefa não encontrada"));
	}

	/** Bean Validation covers the REST request; the model's JSON is validated here so both paths share the rule. */
	private static void validate(String title, @Nullable String description) {
		if (title.isBlank() || title.strip().length() > 200) {
			throw new DomainRuleException("O título deve ter entre 1 e 200 caracteres");
		}
		if (description != null && description.length() > 2000) {
			throw new DomainRuleException("A descrição deve ter no máximo 2000 caracteres");
		}
	}

	/** A task can only be assigned to an existing user who is not disabled. */
	private @Nullable UUID activeAssignee(@Nullable UUID assigneeId) {
		if (assigneeId == null) {
			return null;
		}
		AccountSnapshot account = this.users.findById(assigneeId)
			.orElseThrow(() -> new DomainRuleException("Responsável não encontrado"));
		if (account.status() == AccountStatus.DISABLED) {
			throw new DomainRuleException("O responsável está desativado");
		}
		return account.id();
	}

	private TaskSummary summary(Task task, Map<UUID, Optional<TaskSummary.Assignee>> cache) {
		UUID assigneeId = task.getAssigneeId();
		if (assigneeId == null) {
			return TaskSummary.of(task, null);
		}
		Optional<TaskSummary.Assignee> assignee = cache.computeIfAbsent(assigneeId, (id) -> this.users.findById(id)
			.map((account) -> new TaskSummary.Assignee(account.id(), account.name())));
		return TaskSummary.of(task, assignee.orElse(null));
	}

}
