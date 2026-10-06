package com.maximusflow.os.iam;

public enum AccountStatus {

	/** Invited, has not set a password yet. Cannot log in. */
	INVITED,

	/** Can log in. */
	ACTIVE,

	/** Blocked by an administrator. Cannot log in; existing sessions are terminated. */
	DISABLED

}
