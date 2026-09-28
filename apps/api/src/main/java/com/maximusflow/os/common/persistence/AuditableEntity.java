package com.maximusflow.os.common.persistence;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;

import org.jspecify.annotations.Nullable;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/** Row-level audit columns filled by Spring Data auditing with the current user's id. */
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class AuditableEntity {

	@CreatedDate
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@CreatedBy
	@Column(name = "created_by", updatable = false)
	private @Nullable UUID createdBy;

	@LastModifiedDate
	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@LastModifiedBy
	@Column(name = "updated_by")
	private @Nullable UUID updatedBy;

	public Instant getCreatedAt() {
		return this.createdAt;
	}

	public @Nullable UUID getCreatedBy() {
		return this.createdBy;
	}

	public Instant getUpdatedAt() {
		return this.updatedAt;
	}

	public @Nullable UUID getUpdatedBy() {
		return this.updatedBy;
	}

}
