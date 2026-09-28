package com.maximusflow.os.common.audit;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.repository.ListCrudRepository;

/** Only {@code save} and reads are used; the table is append-only by policy. */
interface AuditEventRepository extends ListCrudRepository<AuditEvent, UUID>, JpaSpecificationExecutor<AuditEvent> {

}
