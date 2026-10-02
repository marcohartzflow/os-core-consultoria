package com.maximusflow.os.iam.internal.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.Role;

import org.springframework.data.jpa.repository.JpaRepository;
import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface RoleRepository extends JpaRepository<Role, UUID>, JpaSpecificationExecutor<Role> {

	Optional<Role> findByName(String name);

	Optional<Role> findFirstBySystemTrue();

	/**
	 * The system role locked until the transaction ends. Changes that can lower the number of
	 * administrators take it first, so two of them cannot both pass the minimum check at once.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select r from Role r where r.system = true order by r.id limit 1")
	Optional<Role> lockSystemRole();

	List<Role> findAllByOrderByNameAsc();

	boolean existsByNameAndIdNot(String name, UUID id);

	/** One row per role that has members: the role id and how many users hold it. */
	@Query("select r.id as roleId, count(u) as users from User u join u.roles r group by r.id")
	List<RoleMembership> countMembers();

	interface RoleMembership {

		UUID getRoleId();

		long getUsers();

	}

}
