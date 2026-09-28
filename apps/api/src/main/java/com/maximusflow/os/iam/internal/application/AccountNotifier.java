package com.maximusflow.os.iam.internal.application;

/**
 * Delivers invitation and password-reset links to people. The core ships a logging implementation;
 * a client fork provides an e-mail implementation as a bean and the logging one backs off.
 */
public interface AccountNotifier {

	void sendInvitation(String email, String name, String link);

	void sendPasswordReset(String email, String name, String link);

}
