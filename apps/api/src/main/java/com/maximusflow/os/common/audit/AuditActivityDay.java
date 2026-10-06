package com.maximusflow.os.common.audit;

import java.time.LocalDate;

/**
 * Audit events of one day, in the time zone the caller asked for: how many came from each origin
 * and how many were sign-ins that succeeded or failed. Feeds the activity chart of the dashboard.
 */
public record AuditActivityDay(LocalDate day, long rest, long aiTool, long system, long loginSuccess,
		long loginFailure) {

	static AuditActivityDay empty(LocalDate day) {
		return new AuditActivityDay(day, 0, 0, 0, 0, 0);
	}

}
