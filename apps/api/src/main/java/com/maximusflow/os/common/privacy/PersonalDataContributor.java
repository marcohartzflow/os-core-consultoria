package com.maximusflow.os.common.privacy;

import java.util.UUID;

/**
 * A module that stores personal data of portal users implements this once (LGPD art. 18: access
 * and elimination). {@link PersonalDataService} aggregates every implementation, so a client module
 * only needs to add a bean.
 */
public interface PersonalDataContributor {

	/** Section name in the export, e.g. {@code account}, {@code sessions}, {@code conversations}. */
	String key();

	/** Everything this module holds about the person, as a JSON-serializable value. */
	Object export(UUID userId, String email);

	/**
	 * Removes or anonymizes what this module holds about the person. Data kept under a legal
	 * obligation (audit trail) stays and the implementation documents why.
	 */
	void erase(UUID userId, String email);

}
