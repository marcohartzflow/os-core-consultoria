package com.maximusflow.os.iam.internal.application;

/**
 * Delivers invitation and password-reset links to people. The core ships a logging implementation;
 * a client fork provides an e-mail implementation as a bean and the logging one backs off.
 */
public interface AccountNotifier {

	void sendInvitation(String email, String name, String link);

	void sendPasswordReset(String email, String name, String link);

	/**
	 * True when this notifier cannot reach the person, so the use case hands the link to the
	 * administrator instead. Once e-mail delivery is configured the link never leaves the server:
	 * whoever holds it can complete the invitation and act as that person.
	 */
	default boolean handsLinksToAdministrator() {
		return false;
	}

}
