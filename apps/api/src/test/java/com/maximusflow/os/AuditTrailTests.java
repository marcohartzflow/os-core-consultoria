package com.maximusflow.os;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
	JdbcTemplate jdbc;

	@Test
	void theTrailIsAppendOnlyAtTheDatabase() {
		assertThatThrownBy(() -> this.jdbc.update("DELETE FROM audit_event")).hasStackTraceContaining("append-only");
		assertThatThrownBy(() -> this.jdbc.update("UPDATE audit_event SET action = 'x'"))
			.hasStackTraceContaining("append-only");
		assertThatThrownBy(() -> this.jdbc.execute("TRUNCATE audit_event")).hasStackTraceContaining("append-only");
	}

	@Autowired
	MockMvc mvc;

	@Test
	void administratorSeesTheLoginAndCanExportCsv() throws Exception {
		Cookie session = loginAsAdmin();

		this.mvc.perform(get("/api/audit/events").cookie(session).param("action", "auth.login.success").param("actorEmail", "ADMIN@example").param("page", "0"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.page.size").value(20))
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

		// Wildcards typed in a search box are plain characters, not a way to match everything.
		this.mvc.perform(get("/api/audit/events").cookie(session).param("action", "%"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.page.totalElements").value(0));
		this.mvc.perform(get("/api/audit/events").cookie(session).param("actorEmail", "_"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.page.totalElements").value(0));

		this.mvc.perform(get("/api/audit/events").cookie(session).param("page", "-1")).andExpect(status().isBadRequest());
		this.mvc.perform(get("/api/audit/events")).andExpect(status().isUnauthorized());
	}

	@Test
	void eventsFilterByOriginAndCorrelationId() throws Exception {
		Cookie session = loginAsAdmin();

		this.mvc.perform(get("/api/audit/events").cookie(session).param("origin", "SYSTEM"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[*].origin").value(org.hamcrest.Matchers.everyItem(
					org.hamcrest.Matchers.is("SYSTEM"))))
			.andExpect(jsonPath("$.content[?(@.action == 'iam.user.bootstrapped')]").isNotEmpty());
		this.mvc.perform(get("/api/audit/events").cookie(session).param("origin", "REST").param("origin", "AI_TOOL"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[*].origin").value(org.hamcrest.Matchers.everyItem(
					org.hamcrest.Matchers.oneOf("REST", "AI_TOOL"))))
			.andExpect(jsonPath("$.content[?(@.action == 'auth.login.success')]").isNotEmpty());
		this.mvc.perform(get("/api/audit/events").cookie(session).param("origin", "NOPE"))
			.andExpect(status().isBadRequest());

		MvcResult csv = this.mvc.perform(get("/api/audit/events.csv").cookie(session).param("origin", "SYSTEM"))
			.andExpect(status().isOk())
			.andReturn();
		assertThat(csv.getResponse().getContentAsString()).contains("\"SYSTEM\"").doesNotContain("\"REST\"");

		this.mvc.perform(get("/api/audit/events").cookie(session).param("correlationId", "no-such-correlation"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content").isEmpty());
	}

	@Test
	void dailyActivityCountsEveryDayInTheViewersTimeZone() throws Exception {
		Cookie session = loginAsAdmin();

		this.mvc.perform(get("/api/audit/activity").cookie(session).param("days", "7").param("zone", "America/Sao_Paulo"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(7))
			.andExpect(jsonPath("$[6].loginSuccess").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
			.andExpect(jsonPath("$[6].rest").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
			.andExpect(jsonPath("$[0].day").exists());

		this.mvc.perform(get("/api/audit/activity").cookie(session).param("zone", "Mars/Olympus"))
			.andExpect(status().is(422));
		this.mvc.perform(get("/api/audit/activity").cookie(session).param("days", "91")).andExpect(status().isBadRequest());
		this.mvc.perform(get("/api/audit/activity").cookie(session).param("days", "0")).andExpect(status().isBadRequest());
		this.mvc.perform(get("/api/audit/activity")).andExpect(status().isUnauthorized());
	}

	@Test
	void listingsCarryTheSecondFactorAndTheMembersOfEachRole() throws Exception {
		Cookie session = loginAsAdmin();

		this.mvc.perform(get("/api/iam/users").cookie(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[?(@.email == 'admin@example.com')].mfaEnabled").value(false));
		this.mvc.perform(get("/api/iam/roles").cookie(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[?(@.system == true)].userCount").value(org.hamcrest.Matchers.everyItem(
					org.hamcrest.Matchers.greaterThanOrEqualTo(1))));
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
