package com.maximusflow.os;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The bootstrap administrator's password came from configuration, so the first session can only
 * read the profile, set a new password and log out until that is done. Own context: the flag is
 * set at bootstrap, which only runs on an empty database.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "os.iam.bootstrap.require-password-change=true")
class PasswordChangeGateTests {

	@Autowired
	MockMvc mvc;

	@Test
	void bootstrapAdministratorMustChangePasswordBeforeAnythingElse() throws Exception {
		MvcResult csrf = this.mvc.perform(get("/api/auth/csrf")).andReturn();
		Cookie xsrf = csrf.getResponse().getCookie("XSRF-TOKEN");
		MvcResult login = this.mvc
			.perform(post("/api/auth/login").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"admin@example.com\",\"password\":\"Admin-Password-2026\"}"))
			.andExpect(status().isOk())
			.andReturn();
		Cookie session = login.getResponse().getCookie("OS_SESSION");

		this.mvc.perform(get("/api/me").cookie(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.passwordChangeRequired").value(true));
		this.mvc.perform(get("/api/iam/users").cookie(session))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.type").value("urn:os:problem:password-change-required"));
		this.mvc.perform(get("/api/ai/tools").cookie(session)).andExpect(status().isForbidden());

		this.mvc.perform(post("/api/me/password").cookie(session, xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"Admin-Password-2026\",\"newPassword\":\"Chosen-By-Me-2026!\"}"))
			.andExpect(status().isNoContent());

		this.mvc.perform(get("/api/me").cookie(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.passwordChangeRequired").value(false));
		this.mvc.perform(get("/api/iam/users").cookie(session)).andExpect(status().isOk());
	}

}
