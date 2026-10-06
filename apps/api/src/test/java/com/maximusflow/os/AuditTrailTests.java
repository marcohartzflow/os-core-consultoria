package com.maximusflow.os;

import jakarta.servlet.http.Cookie;

import java.util.List;

import com.jayway.jsonpath.JsonPath;
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

		this.mvc.perform(get("/api/audit/events").cookie(session).param("action", "auth.login.success").param("actorEmail", "ADMIN@example"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalExact").value(true))
			.andExpect(jsonPath("$.previous").doesNotExist())
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
			.andExpect(jsonPath("$.total").value(0));
		this.mvc.perform(get("/api/audit/events").cookie(session).param("actorEmail", "___"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.total").value(0));
		// Under 3 characters a "contains" search cannot use the trigram index.
		this.mvc.perform(get("/api/audit/events").cookie(session).param("actorEmail", "ad"))
			.andExpect(status().isBadRequest());

		this.mvc.perform(get("/api/audit/events").cookie(session).param("size", "0")).andExpect(status().isBadRequest());
		this.mvc.perform(get("/api/audit/events").cookie(session).param("after", "not-a-position"))
			.andExpect(status().isBadRequest());
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
	void eventsFilterByExactActorAndIgnoreCaseInActionAndEntityType() throws Exception {
		Cookie session = loginAsAdmin();
		String adminId = this.jdbc.queryForObject("SELECT id::text FROM users WHERE email = 'admin@example.com'",
				String.class);

		// By id, only this person: a part of the address would also match others (ana@ in joana@).
		this.mvc.perform(get("/api/audit/events").cookie(session).param("actorId", adminId))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content").isNotEmpty())
			.andExpect(jsonPath("$.content[*].actorId").value(org.hamcrest.Matchers.everyItem(
					org.hamcrest.Matchers.is(adminId))));
		this.mvc.perform(get("/api/audit/events").cookie(session).param("actorId", "not-a-uuid"))
			.andExpect(status().isBadRequest());

		this.mvc.perform(get("/api/audit/events").cookie(session).param("action", "AUTH.LOGIN").param("entityType", "User"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content").isNotEmpty())
			.andExpect(jsonPath("$.content[*].entityType").value(org.hamcrest.Matchers.everyItem(
					org.hamcrest.Matchers.is("user"))));
	}

	@Test
	void pagesFollowEachOtherByPositionInBothDirections() throws Exception {
		Cookie session = loginAsAdmin();
		// Seven entries of one action, two of them at the same instant (the id breaks the tie). The
		// tied pair straddles the first page boundary (pages of 3: 6 5 4 | 4 3 2 | 1), so both
		// directions have to order by id inside one instant.
		for (int secs : new int[] { 1, 2, 3, 4, 4, 5, 6 }) {
			this.jdbc.update("INSERT INTO audit_event (id, occurred_at, origin, action) VALUES (uuidv7(), "
					+ "TIMESTAMPTZ '2020-01-01 00:00:00+00' + make_interval(secs => ?), 'SYSTEM', 'test.cursor')",
					secs);
		}

		String first = page(session, null, null, false);
		assertThat(JsonPath.<List<String>>read(first, "$.content[*].action")).hasSize(3);
		assertThat(JsonPath.<Object>read(first, "$.previous")).isNull();
		assertThat(JsonPath.<Integer>read(first, "$.total")).isEqualTo(7);
		String second = page(session, JsonPath.read(first, "$.next"), null, false);
		String third = page(session, JsonPath.read(second, "$.next"), null, false);
		assertThat(JsonPath.<List<String>>read(third, "$.content[*].id")).hasSize(1);
		assertThat(JsonPath.<Object>read(third, "$.next")).isNull();

		List<String> ids = new java.util.ArrayList<>();
		for (String page : List.of(first, second, third)) {
			ids.addAll(JsonPath.<List<String>>read(page, "$.content[*].id"));
		}
		assertThat(ids).doesNotHaveDuplicates().hasSize(7);
		List<String> occurred = new java.util.ArrayList<>();
		for (String page : List.of(first, second, third)) {
			occurred.addAll(JsonPath.<List<String>>read(page, "$.content[*].occurredAt"));
		}
		assertThat(occurred).isSortedAccordingTo(java.util.Comparator.reverseOrder());

		// Back across the tie gives the first page again.
		String backToFirst = page(session, null, JsonPath.read(second, "$.previous"), false);
		assertThat(JsonPath.<List<String>>read(backToFirst, "$.content[*].id"))
			.isEqualTo(JsonPath.<List<String>>read(first, "$.content[*].id"));
		assertThat(JsonPath.<Object>read(backToFirst, "$.previous")).isNull();

		// Back from the third page gives the second again; the oldest page ends the trail.
		String back = page(session, null, JsonPath.read(third, "$.previous"), false);
		assertThat(JsonPath.<List<String>>read(back, "$.content[*].id"))
			.isEqualTo(JsonPath.<List<String>>read(second, "$.content[*].id"));
		String oldest = page(session, null, null, true);
		assertThat(JsonPath.<List<String>>read(oldest, "$.content[*].id")).isEqualTo(ids.subList(4, 7));
		assertThat(JsonPath.<Object>read(oldest, "$.next")).isNull();
		assertThat(JsonPath.<Object>read(oldest, "$.previous")).isNotNull();
	}

	private String page(Cookie session, String after, String before, boolean oldest) throws Exception {
		var request = get("/api/audit/events").cookie(session).param("action", "test.cursor").param("size", "3");
		if (after != null) {
			request.param("after", after);
		}
		if (before != null) {
			request.param("before", before);
		}
		if (oldest) {
			request.param("oldest", "true");
		}
		return this.mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	@Test
	void anExportRecordsTheFiltersAndTheRowsCopied() throws Exception {
		Cookie session = loginAsAdmin();

		this.mvc.perform(get("/api/audit/events.csv").cookie(session).param("entityType", "user")).andExpect(status().isOk());

		String details = this.jdbc.queryForObject(
				"SELECT details::text FROM audit_event WHERE action = 'audit.exported' ORDER BY occurred_at DESC LIMIT 1",
				String.class);
		assertThat(details).contains("\"entityType\": \"user\"").contains("\"rows\"").contains("\"truncated\": false");
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
			.andExpect(status().isBadRequest());
		// A bare offset would be read by PostgreSQL with the opposite sign: only region names.
		this.mvc.perform(get("/api/audit/activity").cookie(session).param("zone", "+03:00"))
			.andExpect(status().isBadRequest());
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
				.content("{\"email\":\"admin@example.com\",\"password\":\"Bootstrap-Secret-2026\"}"))
			.andExpect(status().isOk())
			.andReturn();
		return login.getResponse().getCookie("OS_SESSION");
	}

}
