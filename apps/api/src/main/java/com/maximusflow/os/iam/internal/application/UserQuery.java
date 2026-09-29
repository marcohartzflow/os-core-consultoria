package com.maximusflow.os.iam.internal.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.common.paging.PageQuery;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.domain.UserMfa;

import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;

import org.jspecify.annotations.Nullable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

/**
 * Filters of the users listing. Every criterion is ANDed; values inside one criterion are ORed.
 * {@code states} follow the badge precedence of the screen: anonymized, then locked, then status.
 */
public record UserQuery(@Nullable String q, Set<State> states, Set<UUID> roleIds, @Nullable Boolean mfa) {

	public enum State {

		ACTIVE, INVITED, LOCKED, DISABLED, ANONYMIZED

	}

	Specification<User> toSpecification(Instant now) {
		return (root, query, cb) -> {
			List<Predicate> predicates = new ArrayList<>();
			if (StringUtils.hasText(this.q)) {
				String pattern = PageQuery.contains(this.q);
				predicates.add(cb.or(cb.like(cb.lower(root.get("name")), pattern, PageQuery.LIKE_ESCAPE),
						cb.like(cb.lower(root.get("email")), pattern, PageQuery.LIKE_ESCAPE)));
			}
			if (!this.states.isEmpty()) {
				Predicate notAnonymized = cb.isNull(root.get("anonymizedAt"));
				Predicate unlocked = cb.or(cb.isNull(root.get("lockedUntil")),
						cb.lessThanOrEqualTo(root.get("lockedUntil"), now));
				List<Predicate> any = new ArrayList<>();
				for (State state : this.states) {
					any.add(switch (state) {
						case ANONYMIZED -> cb.isNotNull(root.get("anonymizedAt"));
						case LOCKED -> cb.and(notAnonymized, cb.greaterThan(root.get("lockedUntil"), now));
						case ACTIVE -> cb.and(notAnonymized, unlocked, cb.equal(root.get("status"), AccountStatus.ACTIVE));
						case INVITED -> cb.and(notAnonymized, unlocked, cb.equal(root.get("status"), AccountStatus.INVITED));
						case DISABLED -> cb.and(notAnonymized, unlocked, cb.equal(root.get("status"), AccountStatus.DISABLED));
					});
				}
				predicates.add(cb.or(any.toArray(Predicate[]::new)));
			}
			if (!this.roleIds.isEmpty()) {
				Subquery<UUID> holders = query.subquery(UUID.class);
				Root<User> holder = holders.from(User.class);
				Join<User, Role> role = holder.join("roles");
				holders.select(holder.get("id")).where(role.get("id").in(this.roleIds));
				predicates.add(root.get("id").in(holders));
			}
			if (this.mfa != null) {
				Subquery<UUID> enrolled = query.subquery(UUID.class);
				Root<UserMfa> enrolment = enrolled.from(UserMfa.class);
				enrolled.select(enrolment.get("userId")).where(cb.isNotNull(enrolment.get("enabledAt")));
				Predicate hasMfa = root.get("id").in(enrolled);
				predicates.add(this.mfa ? hasMfa : cb.not(hasMfa));
			}
			return cb.and(predicates.toArray(Predicate[]::new));
		};
	}

}
