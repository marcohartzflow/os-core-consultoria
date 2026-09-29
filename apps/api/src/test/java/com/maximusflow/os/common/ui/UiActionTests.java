package com.maximusflow.os.common.ui;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** Navigation hints must never become an external or protocol-relative URL in the browser. */
class UiActionTests {

	@Test
	void plainInternalPathsAreAccepted() {
		assertThat(new UiAction.Navigate("/tasks", "Tarefas").path()).isEqualTo("/tasks");
		assertThat(new UiAction.Navigate("/settings/users/0b0e-1f", "Ana").path()).isEqualTo("/settings/users/0b0e-1f");
		assertThat(new UiAction.Navigate("/", "Início").path()).isEqualTo("/");
	}

	@ParameterizedTest
	@ValueSource(strings = { "//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", "/tasks?next=//x",
			"/tasks#x", "/a\r\nSet-Cookie:x", "/a b", "javascript:alert(1)" })
	void anythingElseIsRefused(String path) {
		assertThatIllegalArgumentException().isThrownBy(() -> new UiAction.Navigate(path, "x"));
	}

	@Test
	void longLabelsAreCut() {
		assertThat(new UiAction.Navigate("/tasks", "x".repeat(500)).label()).hasSize(200);
	}

}
