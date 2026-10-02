package com.maximusflow.os.iam.internal.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, UUID>, JpaSpecificationExecutor<User> {

	@EntityGraph(attributePaths = "roles")
	Optional<User> findByEmail(String email);

	@EntityGraph(attributePaths = "roles")
	Optional<User> findWithRolesById(UUID id);

	@EntityGraph(attributePaths = "roles")
	List<User> findAllByOrderByNameAsc(Limit limit);

	/** The row locked until the transaction ends (SELECT … FOR UPDATE), for read-modify-write counters. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select u from User u where u.id = :id")
	Optional<User> lockById(UUID id);

	boolean existsByEmail(String email);

	boolean existsByRolesContaining(Role role);

	long countByStatusAndRolesContaining(AccountStatus status, Role role);

	List<User> findAllByStatusAndRolesContaining(AccountStatus status, Role role);

}
