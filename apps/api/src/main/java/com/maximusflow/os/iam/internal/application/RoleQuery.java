package com.maximusflow.os.iam.internal.application;

import java.util.ArrayList;
import java.util.List;

import com.maximusflow.os.common.paging.PageQuery;
import com.maximusflow.os.iam.internal.domain.Role;

import jakarta.persistence.criteria.Predicate;

import org.jspecify.annotations.Nullable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

/** Filters of the roles listing: text in the name or description, and system or custom roles. */
public record RoleQuery(@Nullable String q, @Nullable Boolean system) {

	Specification<Role> toSpecification() {
		return (root, query, cb) -> {
			List<Predicate> predicates = new ArrayList<>();
			if (StringUtils.hasText(this.q)) {
				String pattern = PageQuery.contains(this.q);
				predicates.add(cb.or(cb.like(cb.lower(root.get("name")), pattern, PageQuery.LIKE_ESCAPE),
						cb.like(cb.lower(cb.coalesce(root.get("description"), "")), pattern, PageQuery.LIKE_ESCAPE)));
			}
			if (this.system != null) {
				predicates.add(cb.equal(root.get("system"), this.system));
			}
			return cb.and(predicates.toArray(Predicate[]::new));
		};
	}

}
