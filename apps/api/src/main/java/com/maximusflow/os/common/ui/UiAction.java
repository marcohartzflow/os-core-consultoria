package com.maximusflow.os.common.ui;

/**
 * A hint from a use case to the portal about what to show next, emitted while the use case runs as
 * an agent tool. Typed data only: the front end interprets it, never renders it as markup. Produced
 * by our code, not by the model, so it cannot be forged through the conversation.
 */
public sealed interface UiAction {

	/** Take the person to an internal portal path, e.g. the entity the tool just created. */
	record Navigate(String path, String label) implements UiAction {
		public Navigate {
			if (!path.startsWith("/") || path.startsWith("//")) {
				throw new IllegalArgumentException("UiAction paths are internal and start with a single slash");
			}
		}
	}

}
