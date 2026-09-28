package com.maximusflow.os.iam.internal.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.maximusflow.os.iam.internal.domain.Role;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RoleRepository extends JpaRepository<Role, UUID> {

	Optional<Role> findByName(String name);

	Optional<Role> findFirstBySystemTrue();

	List<Role> findAllByOrderByNameAsc();

	boolean existsByNameAndIdNot(String name, UUID id);

}
