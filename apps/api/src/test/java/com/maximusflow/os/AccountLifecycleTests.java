package com.maximusflow.os;

import java.time.Duration;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import com.maximusflow.os.iam.internal.application.AccountNotifier;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Account flows that need to see the links the portal sends: e-mail delivery is replaced by a
 * recorder, so links never reach the administrator and the tests read them from the "mailbox".
 * Covers invitation hand-over, token expiry, password reset ending every session, reset links
 * dying with a self-service change, the concurrent-session cap and the upgrade of legacy hashes.
 */
@Import({ TestcontainersConfiguration.class, AccountLifecycleTests.Mailbox.class })
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountLifecycleTests {

	@TestConfiguration(proxyBeanMethods = false)
	static class Mailbox {

		static final BlockingQueue<String> LINKS = new LinkedBlockingQueue<>();

		static final BlockingQueue<String> ADMIN_NOTICES = new LinkedBlockingQueue<>();

		@Bean
		AccountNotifier recordingNotifier() {
			return new AccountNotifier() {
				@Override
				public void sendInvitation(String email, String name, String link) {
					LINKS.add(link);
				}

				@Override
				public void sendPasswordReset(String email, String name, String link) {
					LINKS.add(link);
				}

				@Override
				public void sendAdministratorGranted(String email, String name, String granteeName,
						String granteeEmail, String grantedByName) {
					ADMIN_NOTICES.add(email + " <- " + granteeEmail + " by " + grantedByName);
				}
			};
		}

	}

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void withEmailDeliveryTheInvitationLinkNeverReachesTheAdministrator() throws Exception {
		Session admin = login("admin@example.com", "Admin-Password-2026");
		this.mvc.perform(withCsrf(post("/api/iam/users"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"erin@example.com\",\"name\":\"Erin\"}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.invitationLink").doesNotExist());
		String token = tokenOf(nextLink());
		accept(token, "Erin-Password-2026").andExpect(status().isNoContent());
		// Single use.
		accept(token, "Erin-Password-2027").andExpect(status().is(422));
	}

	@Test
	void expiredInvitationIsRefusedLikeAnUnknownOne() throws Exception {
		Session admin = login("admin@example.com", "Admin-Password-2026");
		this.mvc.perform(withCsrf(post("/api/iam/users"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"fred@example.com\",\"name\":\"Fred\"}"))
			.andExpect(status().isCreated());
		String token = tokenOf(nextLink());
		this.jdbc.update("UPDATE account_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = "
				+ "(SELECT id FROM users WHERE email = 'fred@example.com')");
		accept(token, "Fred-Password-2026").andExpect(status().is(422))
			.andExpect(jsonPath("$.detail").value("Link inválido ou expirado"));
	}

	@Test
	void passwordResetEndsEverySessionAndSelfServiceChangeKillsPendingResetLinks() throws Exception {
		invite("gina@example.com", "Gina", "Gina-Password-2026");
		Session before = login("gina@example.com", "Gina-Password-2026");

		// Reset link, then a self-service change: the older link must no longer work.
		requestReset("gina@example.com");
		String stale = tokenOf(nextLink());
		this.mvc.perform(withCsrf(post("/api/me/password"), before).contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"Gina-Password-2026\",\"newPassword\":\"Gina-Password-2027\"}"))
			.andExpect(status().isNoContent());
		confirmReset(stale, "Gina-Password-2028").andExpect(status().is(422));

		// A fresh reset works and ends the sessions opened with the old password.
		requestReset("gina@example.com");
		confirmReset(tokenOf(nextLink()), "Gina-Password-2029").andExpect(status().isNoContent());
		awaitUnauthorized(before);
		login("gina@example.com", "Gina-Password-2029");

		// Unknown addresses get the same answer and no e-mail.
		requestReset("nobody@example.com");
		assertThat(Mailbox.LINKS.poll(500, TimeUnit.MILLISECONDS)).isNull();
	}

	@Test
	void theOldestSessionEndsWhenTheConcurrentLimitIsExceeded() throws Exception {
		invite("hugo@example.com", "Hugo", "Hugo-Password-2026");
		Session first = login("hugo@example.com", "Hugo-Password-2026");
		Session second = login("hugo@example.com", "Hugo-Password-2026");
		Session third = login("hugo@example.com", "Hugo-Password-2026");
		for (Session s : new Session[] { first, second, third }) {
			this.mvc.perform(get("/api/me").cookie(s.cookie())).andExpect(status().isOk());
		}
		Session fourth = login("hugo@example.com", "Hugo-Password-2026");
		this.mvc.perform(get("/api/me").cookie(first.cookie())).andExpect(status().isUnauthorized());
		for (Session s : new Session[] { second, third, fourth }) {
			this.mvc.perform(get("/api/me").cookie(s.cookie())).andExpect(status().isOk());
		}
	}

	@Test
	void aLegacyBcryptHashIsReplacedByArgon2idAtTheNextLogin() throws Exception {
		invite("iris@example.com", "Iris", "Iris-Password-2026");
		this.jdbc.update("UPDATE users SET password_hash = ? WHERE email = 'iris@example.com'",
				"{bcrypt}" + new BCryptPasswordEncoder().encode("Legacy-Password-2020"));
		login("iris@example.com", "Legacy-Password-2020");
		String hash = this.jdbc.queryForObject("SELECT password_hash FROM users WHERE email = 'iris@example.com'",
				String.class);
		assertThat(hash).startsWith("{argon2}");
		login("iris@example.com", "Legacy-Password-2020");
	}

	@Test
	void everyOtherAdministratorIsToldWhenSomeoneBecomesOne() throws Exception {
		invite("julia@example.com", "Julia", "Julia-Password-2026");
		Session admin = login("admin@example.com", "Admin-Password-2026");
		String julia = this.jdbc.queryForObject("SELECT id FROM users WHERE email = 'julia@example.com'", String.class);
		String adminRole = this.jdbc.queryForObject("SELECT id FROM roles WHERE is_system", String.class);
		this.mvc.perform(withCsrf(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
			.put("/api/iam/users/" + julia + "/roles"), admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"roleIds\":[\"" + adminRole + "\"],\"currentPassword\":\"Admin-Password-2026\"}"))
			.andExpect(status().isOk());

		String notice = Mailbox.ADMIN_NOTICES.poll(10, TimeUnit.SECONDS);
		assertThat(notice).isEqualTo("admin@example.com <- julia@example.com by Admin");
		// Julia herself is not in the list; nobody else is an administrator yet.
		assertThat(Mailbox.ADMIN_NOTICES.poll(500, TimeUnit.MILLISECONDS)).isNull();
	}

	@Test
	void anInvalidFormNamesEachFieldWithoutEchoingTheValue() throws Exception {
		Session admin = login("admin@example.com", "Admin-Password-2026");
		MvcResult result = this.mvc
			.perform(withCsrf(post("/api/iam/users"), admin).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"not-an-address-xyz\",\"name\":\"\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.title").value("Dados inválidos"))
			.andExpect(jsonPath("$.errors.email").isString())
			.andExpect(jsonPath("$.errors.name").isString())
			.andReturn();
		assertThat(result.getResponse().getContentAsString()).doesNotContain("not-an-address-xyz");
	}

	// helpers

	record Session(Cookie cookie, Cookie xsrf) {
	}

	private void invite(String email, String name, String password) throws Exception {
		Session admin = login("admin@example.com", "Admin-Password-2026");
		this.mvc.perform(withCsrf(post("/api/iam/users"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"" + email + "\",\"name\":\"" + name + "\"}"))
			.andExpect(status().isCreated());
		accept(tokenOf(nextLink()), password).andExpect(status().isNoContent());
	}

	private org.springframework.test.web.servlet.ResultActions accept(String token, String password) throws Exception {
		return this.mvc.perform(withCsrf(post("/api/iam/invitations/accept"), anonymous())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + token + "\",\"password\":\"" + password + "\"}"));
	}

	private void requestReset(String email) throws Exception {
		this.mvc.perform(withCsrf(post("/api/iam/password-reset/request"), anonymous())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"" + email + "\"}"))
			.andExpect(status().isAccepted());
	}

	private org.springframework.test.web.servlet.ResultActions confirmReset(String token, String password)
			throws Exception {
		return this.mvc.perform(withCsrf(post("/api/iam/password-reset/confirm"), anonymous())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + token + "\",\"password\":\"" + password + "\"}"));
	}

	/** Session termination runs in an event listener after the commit; give it a moment. */
	private void awaitUnauthorized(Session session) throws Exception {
		long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
		while (true) {
			int status = this.mvc.perform(get("/api/me").cookie(session.cookie())).andReturn().getResponse()
				.getStatus();
			if (status == 401) {
				return;
			}
			assertThat(System.nanoTime()).as("session still valid after the reset").isLessThan(deadline);
			Thread.sleep(100);
		}
	}

	private static String nextLink() throws InterruptedException {
		String link = Mailbox.LINKS.poll(10, TimeUnit.SECONDS);
		assertThat(link).as("a link was sent").isNotNull();
		return link;
	}

	private static String tokenOf(String link) {
		return link.substring(link.lastIndexOf('/') + 1);
	}

	private Session anonymous() throws Exception {
		MvcResult csrf = this.mvc.perform(get("/api/auth/csrf")).andReturn();
		Cookie xsrf = csrf.getResponse().getCookie("XSRF-TOKEN");
		return new Session(null, xsrf);
	}

	private Session login(String email, String password) throws Exception {
		Session anonymous = anonymous();
		MvcResult login = this.mvc
			.perform(withCsrf(post("/api/auth/login"), anonymous).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
			.andExpect(status().isOk())
			.andReturn();
		return new Session(login.getResponse().getCookie("OS_SESSION"), anonymous.xsrf());
	}

	private static MockHttpServletRequestBuilder withCsrf(MockHttpServletRequestBuilder builder, Session session) {
		if (session.cookie() != null) {
			builder.cookie(session.cookie());
		}
		return builder.cookie(session.xsrf()).header("X-XSRF-TOKEN", session.xsrf().getValue());
	}

}
