package com.maximusflow.os;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The audit trail is readable and exportable by whoever holds the permission, and reading it is audited. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuditTrailTests {

	@Autowired
	MockMvc mvc;

	@Test
	void administratorSeesTheLoginAndCanExportCsv() throws Exception {
		Cookie session = loginAsAdmin();

		this.mvc.perform(get("/api/audit/events").cookie(session).param("action", "auth.login.success").param("actorEmail", "ADMIN@example").param("page", "0"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.page.size").value(50))
			.andExpect(jsonPath("$.content[0].action").value("auth.login.success"))
			.andExpect(jsonPath("$.content[0].actorEmail").value("admin@example.com"))
			.andExpect(jsonPath("$.content[0].origin").value("REST"));

		MvcResult csv = this.mvc.perform(get("/api/audit/events.csv").cookie(session).param("entityType", "user"))
			.andExpect(status().isOk())
			.andExpect(header().string("Content-Disposition", "attachment; filename=\"auditoria.csv\""))
			.andReturn();
		assertThat(csv.getResponse().getContentType()).startsWith("text/csv");
		assertThat(csv.getResponse().getContentAsString()).startsWith("occurred_at,actor_email,origin,action")
			.contains("\"iam.user.bootstrapped\"");

		this.mvc.perform(get("/api/audit/events").cookie(session).param("action", "audit.exported"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[0].action").value("audit.exported"));

		this.mvc.perform(get("/api/audit/events").cookie(session).param("page", "-1")).andExpect(status().isBadRequest());
		this.mvc.perform(get("/api/audit/events")).andExpect(status().isUnauthorized());
	}

	private Cookie loginAsAdmin() throws Exception {
		MvcResult csrf = this.mvc.perform(get("/api/auth/csrf")).andReturn();
		Cookie xsrf = csrf.getResponse().getCookie("XSRF-TOKEN");
		MvcResult login = this.mvc
			.perform(post("/api/auth/login").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"admin@example.com\",\"password\":\"Admin-Password-2026\"}"))
			.andExpect(status().isOk())
			.andReturn();
		return login.getResponse().getCookie("OS_SESSION");
	}

}
