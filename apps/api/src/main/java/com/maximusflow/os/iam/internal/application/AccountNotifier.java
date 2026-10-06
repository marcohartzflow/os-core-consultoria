package com.maximusflow.os.iam.internal.application;

/**
 * Delivers invitation and password-reset links to people. The core ships a logging implementation;
 * a client fork provides an e-mail implementation as a bean and the logging one backs off.
 */
public interface AccountNotifier {

	void sendInvitation(String email, String name, String link);

	void sendPasswordReset(String email, String name, String link);

	/**
	 * Tells the person that an administrator removed their second factor and gives them the link to
	 * choose a new password, after which they enrol a factor again.
	 */
	void sendSecondFactorReset(String email, String name, String link);

	/** Tells the person that one of their second factors changed ({@code change} describes it). No link. */
	void sendSecondFactorChanged(String email, String name, String change);

	/**
	 * A security notice with no link: the password was changed or reset, a recovery code was used,
	 * the second notification address changed ({@code notice} describes it). Sent to every address
	 * of the account (NIST SP 800-63B-4: account recovery and changes notify the subscriber).
	 */
	void sendSecurityNotice(String email, String name, String notice);

	/** Tells an administrator that someone else just became an administrator. No link, no secret. */
	void sendAdministratorGranted(String email, String name, String granteeName, String granteeEmail,
			String grantedByName);

	/**
	 * True when this notifier cannot reach the person, so the use case hands the link to the
	 * administrator instead. Once e-mail delivery is configured the link never leaves the server:
	 * whoever holds it can complete the invitation and act as that person.
	 */
	default boolean handsLinksToAdministrator() {
		return false;
	}

}
