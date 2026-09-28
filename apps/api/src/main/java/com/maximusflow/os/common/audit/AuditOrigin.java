package com.maximusflow.os.common.audit;

/** Where an audited action was triggered from. */
public enum AuditOrigin {

	/** A REST call made by a person through the portal. */
	REST,

	/** A tool executed by the AI agent on behalf of a person. */
	AI_TOOL,

	/** Background job, bootstrap or scheduled task. */
	SYSTEM

}
