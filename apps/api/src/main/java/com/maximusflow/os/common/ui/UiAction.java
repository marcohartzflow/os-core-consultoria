package com.maximusflow.os.common.ui;

import java.util.regex.Pattern;

/**
 * A hint from a use case to the portal about what to show next, emitted while the use case runs as
 * an agent tool. Typed data only: the front end interprets it, never renders it as markup. Produced
 * by our code, not by the model, so it cannot be forged through the conversation.
 */
public sealed interface UiAction {

	/**
	 * Take the person to an internal portal path, e.g. the entity the tool just created. The path is
	 * a plain absolute path: no scheme, host, query, fragment, backslash or control character, so it
	 * can never turn into an external or protocol-relative URL in the browser. The label is text the
	 * client renders as text.
	 */
	record Navigate(String path, String label) implements UiAction {

		private static final Pattern INTERNAL_PATH = Pattern.compile("/[A-Za-z0-9._~/-]{0,2047}");

		public Navigate {
			if (!INTERNAL_PATH.matcher(path).matches() || path.startsWith("//")) {
				throw new IllegalArgumentException("UiAction paths are internal: a single leading slash, no query or host");
			}
			if (label.length() > 200) {
				label = label.substring(0, 200);
			}
		}
	}

}
