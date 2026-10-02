package com.maximusflow.os;

import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** LGPD art. 18: a person exports their own data; an administrator anonymizes a disabled account. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PrivacyTests {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void personExportsEverythingThePortalHoldsAboutThem() throws Exception {
		Session admin = login();
		this.mvc.perform(get("/api/me/data").cookie(admin.cookie()))
			.andExpect(status().isOk())
			.andExpect(header().string("Content-Disposition", "attachment; filename=\"meus-dados.json\""))
			.andExpect(jsonPath("$.account.email").value("admin@example.com"))
			.andExpect(jsonPath("$.account.roles[0]").value("Administrador"))
			.andExpect(jsonPath("$.sessions").isArray())
			.andExpect(jsonPath("$.sessions.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
			.andExpect(jsonPath("$.conversations").isArray())
			.andExpect(jsonPath("$.audit.events").isArray())
			.andExpect(jsonPath("$.audit.events[?(@.action == 'auth.login.success')]").isNotEmpty())
			.andExpect(jsonPath("$.audit.truncated").value(false));
		// The export itself is in the trail (it once joined a read-only transaction and was never written).
		Integer exported = this.jdbc.queryForObject(
				"SELECT count(*) FROM audit_event WHERE action = 'privacy.data.exported' AND actor_email = ?",
				Integer.class, "admin@example.com");
		org.assertj.core.api.Assertions.assertThat(exported).isGreaterThanOrEqualTo(1);
	}

	@Test
	void disabledAccountCanBeAnonymizedOnceAndNeverReactivated() throws Exception {
		Session admin = login();
		MvcResult invited = this.mvc
			.perform(withCsrf(post("/api/iam/users"), admin).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"dora@example.com\",\"name\":\"Dora\",\"roleIds\":[]}"))
			.andExpect(status().isCreated())
			.andReturn();
		String id = firstMatch(invited, "\"id\"\\s*:\\s*\"([^\"]+)\"");

		// Must be disabled first.
		this.mvc.perform(withCsrf(post("/api/iam/users/" + id + "/anonymize"), admin)).andExpect(status().is(422));
		this.mvc.perform(withCsrf(post("/api/iam/users/" + id + "/disable"), admin)).andExpect(status().isOk());

		// Personal data held elsewhere: a second notification address, a second factor, recovery codes,
		// a conversation with memory.
		UUID userId = UUID.fromString(id);
		this.jdbc.update("UPDATE users SET notification_email = 'dora.pessoal@example.org' WHERE id = ?", userId);
		UUID conversation = UUID.randomUUID();
		this.jdbc.update("INSERT INTO user_mfa (user_id, secret, created_at, updated_at) VALUES (?, 'x', now(), now())",
				userId);
		this.jdbc.update("INSERT INTO user_mfa_recovery_code (id, user_id, code_hash, created_at) VALUES (?, ?, ?, now())",
				UUID.randomUUID(), userId, "h-" + id.substring(0, 20));
		this.jdbc.update("INSERT INTO ai_conversation (id, user_id, title, created_at, updated_at) VALUES (?, ?, 'x', now(), now())",
				conversation, userId);
		this.jdbc.update("INSERT INTO SPRING_AI_CHAT_MEMORY (conversation_id, content, type, \"timestamp\", sequence_id)"
				+ " VALUES (?, 'meu CPF', 'USER', now(), 1)", conversation.toString());

		this.mvc.perform(withCsrf(post("/api/iam/users/" + id + "/anonymize"), admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value("anonymized-" + id + "@invalid"))
			.andExpect(jsonPath("$.name").value("Titular removido"))
			.andExpect(jsonPath("$.status").value("DISABLED"))
			.andExpect(jsonPath("$.anonymizedAt").isNotEmpty());

		this.mvc.perform(withCsrf(post("/api/iam/users/" + id + "/anonymize"), admin)).andExpect(status().is(422));
		this.mvc.perform(withCsrf(post("/api/iam/users/" + id + "/enable"), admin)).andExpect(status().is(422));

		// Nothing personal is left behind: credentials, tokens, second factor, conversations, memory.
		for (String table : new String[] { "account_tokens", "user_mfa", "user_mfa_recovery_code", "ai_conversation" }) {
			assertThat(this.jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE user_id = ?", Integer.class,
					userId)).as(table).isZero();
		}
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM SPRING_AI_CHAT_MEMORY WHERE conversation_id = ?",
				Integer.class, conversation.toString())).isZero();
		assertThat(this.jdbc.queryForObject("SELECT password_hash FROM users WHERE id = ?", String.class, userId))
			.isNull();
		assertThat(this.jdbc.queryForObject("SELECT notification_email FROM users WHERE id = ?", String.class, userId))
			.isNull();

		// The audit row names only the id, never the person.
		this.mvc.perform(get("/api/audit/events").cookie(admin.cookie()).param("action", "iam.user.anonymized"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[0].entityId").value(id))
			.andExpect(jsonPath("$.content[0].details").doesNotExist());

		// The administrator cannot anonymize themself.
		MvcResult me = this.mvc.perform(get("/api/me").cookie(admin.cookie())).andReturn();
		String adminId = firstMatch(me, "\"id\"\\s*:\\s*\"([^\"]+)\"");
		this.mvc.perform(withCsrf(post("/api/iam/users/" + adminId + "/anonymize"), admin)).andExpect(status().is(422));
	}

	record Session(Cookie cookie, Cookie xsrf) {
	}

	private Session login() throws Exception {
		MvcResult csrf = this.mvc.perform(get("/api/auth/csrf")).andReturn();
		Cookie xsrf = csrf.getResponse().getCookie("XSRF-TOKEN");
		MvcResult login = this.mvc
			.perform(post("/api/auth/login").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"admin@example.com\",\"password\":\"Bootstrap-Secret-2026\"}"))
			.andExpect(status().isOk())
			.andReturn();
		return new Session(login.getResponse().getCookie("OS_SESSION"), xsrf);
	}

	private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder withCsrf(
			org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder, Session session) {
		return builder.cookie(session.cookie(), session.xsrf()).header("X-XSRF-TOKEN", session.xsrf().getValue());
	}

	private static String firstMatch(MvcResult result, String regex) throws Exception {
		String body = result.getResponse().getContentAsString();
		Matcher matcher = Pattern.compile(regex).matcher(body);
		assertThat(matcher.find()).as("pattern %s in %s", regex, body).isTrue();
		return matcher.group(1);
	}

}
