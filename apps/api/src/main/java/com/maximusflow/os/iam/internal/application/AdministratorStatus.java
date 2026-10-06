package com.maximusflow.os.iam.internal.application;

/** Active system administrators against the minimum the portal keeps ({@code os.iam.administrators.minimum}). */
public record AdministratorStatus(long active, int minimum, boolean belowMinimum) {

	static AdministratorStatus of(long active, int minimum) {
		return new AdministratorStatus(active, minimum, active < minimum);
	}

}
