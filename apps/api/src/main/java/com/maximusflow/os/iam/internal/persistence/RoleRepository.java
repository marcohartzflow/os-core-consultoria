package com.maximusflow.os.iam.internal.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.Role;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface RoleRepository extends JpaRepository<Role, UUID>, JpaSpecificationExecutor<Role> {

	Optional<Role> findByName(String name);

	Optional<Role> findFirstBySystemTrue();

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
