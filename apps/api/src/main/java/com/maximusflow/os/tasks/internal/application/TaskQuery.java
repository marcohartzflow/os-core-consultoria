package com.maximusflow.os.tasks.internal.application;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.common.paging.PageQuery;
import com.maximusflow.os.tasks.internal.domain.Task;
import com.maximusflow.os.tasks.internal.domain.TaskStatus;

import jakarta.persistence.criteria.Predicate;

import org.jspecify.annotations.Nullable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

/**
 * Filters of the tasks listing. Criteria are ANDed. The assignee criterion matches any of
 * {@code assigneeIds}, or tasks without an assignee when {@code unassigned} is true.
 * {@code dueBefore} keeps tasks whose due date is before that day (overdue, when combined with OPEN).
 */
public record TaskQuery(@Nullable String q, Set<TaskStatus> statuses, Set<UUID> assigneeIds, boolean unassigned,
		@Nullable LocalDate dueBefore) {

	Specification<Task> toSpecification() {
		return (root, query, cb) -> {
			List<Predicate> predicates = new ArrayList<>();
			if (StringUtils.hasText(this.q)) {
				// lower(column) exactly as indexed (tasks_*_trgm_idx); a null description is simply no match.
				String pattern = PageQuery.contains(this.q);
				predicates.add(cb.or(cb.like(cb.lower(root.get("title")), pattern, PageQuery.LIKE_ESCAPE),
						cb.like(cb.lower(root.get("description")), pattern, PageQuery.LIKE_ESCAPE)));
			}
			if (!this.statuses.isEmpty()) {
				predicates.add(root.get("status").in(this.statuses));
			}
			if (!this.assigneeIds.isEmpty() || this.unassigned) {
				List<Predicate> any = new ArrayList<>();
				if (!this.assigneeIds.isEmpty()) {
					any.add(root.get("assigneeId").in(this.assigneeIds));
				}
				if (this.unassigned) {
					any.add(cb.isNull(root.get("assigneeId")));
				}
				predicates.add(cb.or(any.toArray(Predicate[]::new)));
			}
			if (this.dueBefore != null) {
				predicates.add(cb.lessThan(root.get("dueDate"), this.dueBefore));
			}
			return cb.and(predicates.toArray(Predicate[]::new));
		};
	}

}
