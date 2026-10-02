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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

		/** Security notices (no link) as "address: notice". */
		static final BlockingQueue<String> NOTICES = new LinkedBlockingQueue<>();

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
				public void sendSecondFactorChanged(String email, String name, String change) {
					NOTICES.add(email + ": " + change);
				}

				@Override
				public void sendSecurityNotice(String email, String name, String notice) {
					NOTICES.add(email + ": " + notice);
				}

				@Override
				public void sendSecondFactorReset(String email, String name, String link) {
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
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		this.mvc.perform(withCsrf(post("/api/iam/users"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"erin@example.com\",\"name\":\"Erin\"}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.invitationLink").doesNotExist());
		String token = tokenOf(nextLink());
		accept(token, "Nire-Passphrase-2026").andExpect(status().isNoContent());
		// Single use.
		accept(token, "Nire-Passphrase-2027").andExpect(status().is(422));
	}

	@Test
	void expiredInvitationIsRefusedLikeAnUnknownOne() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		this.mvc.perform(withCsrf(post("/api/iam/users"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"fred@example.com\",\"name\":\"Fred\"}"))
			.andExpect(status().isCreated());
		String token = tokenOf(nextLink());
		this.jdbc.update("UPDATE account_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = "
				+ "(SELECT id FROM users WHERE email = 'fred@example.com')");
		accept(token, "Derf-Passphrase-2026").andExpect(status().is(422))
			.andExpect(jsonPath("$.detail").value("Link inválido ou expirado"));
	}

	@Test
	void passwordResetEndsEverySessionAndSelfServiceChangeKillsPendingResetLinks() throws Exception {
		invite("gina@example.com", "Gina", "Anig-Passphrase-2026");
		Session before = login("gina@example.com", "Anig-Passphrase-2026");

		// Reset link, then a self-service change: the older link must no longer work.
		requestReset("gina@example.com");
		String stale = tokenOf(nextLink());
		MvcResult changed = this.mvc.perform(withCsrf(post("/api/me/password"), before)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"Anig-Passphrase-2026\",\"newPassword\":\"Anig-Passphrase-2027\"}"))
			.andExpect(status().isNoContent())
			.andReturn();
		// The session keeps going under a new id.
		before = new Session(changed.getResponse().getCookie("OS_SESSION"), before.xsrf());
		this.mvc.perform(get("/api/me").cookie(before.cookie())).andExpect(status().isOk());
		confirmReset(stale, "Anig-Passphrase-2028").andExpect(status().is(422));

		// A fresh reset works and ends the sessions opened with the old password.
		requestReset("gina@example.com");
		confirmReset(tokenOf(nextLink()), "Anig-Passphrase-2029").andExpect(status().isNoContent());
		awaitUnauthorized(before);
		login("gina@example.com", "Anig-Passphrase-2029");

		// Unknown addresses get the same answer and no e-mail.
		requestReset("nobody@example.com");
		assertThat(Mailbox.LINKS.poll(500, TimeUnit.MILLISECONDS)).isNull();
	}

	@Test
	void theOldestSessionEndsWhenTheConcurrentLimitIsExceeded() throws Exception {
		invite("hugo@example.com", "Hugo", "Oguh-Passphrase-2026");
		Session first = login("hugo@example.com", "Oguh-Passphrase-2026");
		Session second = login("hugo@example.com", "Oguh-Passphrase-2026");
		Session third = login("hugo@example.com", "Oguh-Passphrase-2026");
		for (Session s : new Session[] { first, second, third }) {
			this.mvc.perform(get("/api/me").cookie(s.cookie())).andExpect(status().isOk());
		}
		Session fourth = login("hugo@example.com", "Oguh-Passphrase-2026");
		this.mvc.perform(get("/api/me").cookie(first.cookie())).andExpect(status().isUnauthorized());
		for (Session s : new Session[] { second, third, fourth }) {
			this.mvc.perform(get("/api/me").cookie(s.cookie())).andExpect(status().isOk());
		}
	}

	@Test
	void aLegacyBcryptHashIsReplacedByArgon2idAtTheNextLogin() throws Exception {
		invite("iris@example.com", "Iris", "Siri-Passphrase-2026");
		this.jdbc.update("UPDATE users SET password_hash = ? WHERE email = 'iris@example.com'",
				"{bcrypt}" + new BCryptPasswordEncoder().encode("Ycagel-Passphrase-2020"));
		login("iris@example.com", "Ycagel-Passphrase-2020");
		String hash = this.jdbc.queryForObject("SELECT password_hash FROM users WHERE email = 'iris@example.com'",
				String.class);
		assertThat(hash).startsWith("{argon2}");
		login("iris@example.com", "Ycagel-Passphrase-2020");
	}

	@Test
	void everyOtherAdministratorIsToldWhenSomeoneBecomesOne() throws Exception {
		invite("julia@example.com", "Julia", "Ailuj-Passphrase-2026");
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		String julia = this.jdbc.queryForObject("SELECT id FROM users WHERE email = 'julia@example.com'", String.class);
		String adminRole = this.jdbc.queryForObject("SELECT id FROM roles WHERE is_system", String.class);
		this.mvc.perform(withCsrf(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
			.put("/api/iam/users/" + julia + "/roles"), admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"roleIds\":[\"" + adminRole + "\"],\"currentPassword\":\"Bootstrap-Secret-2026\"}"))
			.andExpect(status().isOk());

		String notice = Mailbox.ADMIN_NOTICES.poll(10, TimeUnit.SECONDS);
		assertThat(notice).isEqualTo("admin@example.com <- julia@example.com by Admin");
		// Julia herself is not in the list; nobody else is an administrator yet.
		assertThat(Mailbox.ADMIN_NOTICES.poll(500, TimeUnit.MILLISECONDS)).isNull();
	}

	@Test
	void anInvalidFormNamesEachFieldWithoutEchoingTheValue() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
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

	@Test
	void wrongPasswordsTypedToConfirmAChangeCountTowardsTheLockout() throws Exception {
		invite("lia@example.com", "Lia", "Ail-Passphrase-2026");
		Session lia = login("lia@example.com", "Ail-Passphrase-2026");
		// A stolen session guessing the password through the change form: five tries, then locked.
		for (int i = 0; i < 5; i++) {
			changePassword(lia, "guess-number-" + i, "Ail-Passphrase-2027").andExpect(status().is(422));
		}
		changePassword(lia, "Ail-Passphrase-2026", "Ail-Passphrase-2027")
			.andExpect(status().is(422))
			.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("bloqueada")));
		this.mvc.perform(withCsrf(post("/api/auth/login"), anonymous()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"lia@example.com\",\"password\":\"Ail-Passphrase-2026\"}"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void aDisabledAccountCannotBeActivatedWithItsOldInvitation() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		MvcResult invited = this.mvc.perform(withCsrf(post("/api/iam/users"), admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"ivo@example.com\",\"name\":\"Ivo\"}"))
			.andExpect(status().isCreated())
			.andReturn();
		String token = tokenOf(nextLink());
		String id = com.jayway.jsonpath.JsonPath.read(invited.getResponse().getContentAsString(), "$.user.id");
		this.mvc.perform(withCsrf(post("/api/iam/users/" + id + "/disable"), admin)).andExpect(status().isOk());
		accept(token, "Ovi-Passphrase-2026").andExpect(status().is(422));
	}

	@Test
	void administratorsEndTheirOwnSessionsFromTheirAccountNotFromTheUsersScreen() throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
		MvcResult me = this.mvc.perform(get("/api/me").cookie(admin.cookie())).andReturn();
		String id = com.jayway.jsonpath.JsonPath.read(me.getResponse().getContentAsString(), "$.id");
		this.mvc.perform(withCsrf(delete("/api/iam/users/" + id + "/sessions"), admin)).andExpect(status().is(422));
		this.mvc.perform(get("/api/me").cookie(admin.cookie())).andExpect(status().isOk());
	}

	@Test
	void securityNoticesReachBothAddressesAndTheSecondOneNeedsThePassword() throws Exception {
		invite("nina@example.com", "Nina", "Anin-Passphrase-2026");
		Session nina = login("nina@example.com", "Anin-Passphrase-2026");

		// The second address needs the password, a real address, and one that is not the login e-mail.
		notificationEmail(nina, "", "nina.pessoal@example.org").andExpect(status().isBadRequest());
		notificationEmail(nina, "wrong-password-123", "nina.pessoal@example.org").andExpect(status().is(422));
		notificationEmail(nina, "Anin-Passphrase-2026", "not-an-address").andExpect(status().isBadRequest());
		MvcResult same = notificationEmail(nina, "Anin-Passphrase-2026", "NINA@example.com")
			.andExpect(status().is(422)).andReturn();
		nina = renewed(same, nina);
		MvcResult set = notificationEmail(nina, "Anin-Passphrase-2026", "Nina.Pessoal@example.org")
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.notificationEmail").value("nina.pessoal@example.org"))
			.andReturn();
		// Typing the password again renewed the session id (ASVS 7.2.4); the CSRF token still works.
		this.mvc.perform(get("/api/me").cookie(nina.cookie())).andExpect(status().isUnauthorized());
		nina = renewed(set, nina);
		awaitNotice("nina@example.com: O e-mail secundário que recebe os avisos de segurança da sua conta passou a ser nina.pessoal@example.org.");
		awaitNotice("nina.pessoal@example.org: O e-mail secundário que recebe os avisos de segurança da sua conta passou a ser nina.pessoal@example.org.");
		// The person's own data lists it.
		this.mvc.perform(get("/api/me/data").cookie(nina.cookie()))
			.andExpect(jsonPath("$.account.notificationEmail").value("nina.pessoal@example.org"));

		// Changing the password tells both addresses.
		nina = renewed(changePassword(nina, "Anin-Passphrase-2026", "Anin-Passphrase-2027").andExpect(status().isNoContent())
			.andReturn(), nina);
		awaitNotice("nina@example.com: A sua senha foi alterada");
		awaitNotice("nina.pessoal@example.org: A sua senha foi alterada");

		// A completed reset (account recovery) too; the link itself goes to the login e-mail only.
		requestReset("nina@example.com");
		confirmReset(tokenOf(nextLink()), "Anin-Passphrase-2028").andExpect(status().isNoContent());
		awaitNotice("nina@example.com: A sua senha foi redefinida");
		awaitNotice("nina.pessoal@example.org: A sua senha foi redefinida");

		// Replacing the second address tells the login e-mail, the new address and the old one.
		Session again = login("nina@example.com", "Anin-Passphrase-2028");
		notificationEmail(again, "Anin-Passphrase-2028", "nina.nova@example.org").andExpect(status().isOk());
		awaitNotice("nina@example.com: O e-mail secundário que recebe os avisos de segurança da sua conta passou a ser nina.nova@example.org.");
		awaitNotice("nina.nova@example.org: O e-mail secundário que recebe os avisos de segurança da sua conta passou a ser nina.nova@example.org.");
		awaitNotice("nina.pessoal@example.org: O e-mail secundário que recebe os avisos de segurança da sua conta passou a ser nina.nova@example.org.");
	}

	@Test
	void aSessionEndsAtOnceWhenItsAccountLosesThePassword() throws Exception {
		invite("olga@example.com", "Olga", "Aglo-Passphrase-2026");
		Session olga = login("olga@example.com", "Aglo-Passphrase-2026");
		this.mvc.perform(get("/api/me").cookie(olga.cookie())).andExpect(status().isOk());
		// What an administrator's second-factor reset leaves behind before the listener ends the
		// sessions: an active account without a password. The next request is already refused.
		this.jdbc.update("UPDATE users SET password_hash = NULL WHERE email = 'olga@example.com'");
		this.mvc.perform(get("/api/me").cookie(olga.cookie())).andExpect(status().isUnauthorized());
	}

	private org.springframework.test.web.servlet.ResultActions notificationEmail(Session session, String password,
			String email) throws Exception {
		return this.mvc.perform(withCsrf(put("/api/me/notification-email"), session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"" + password + "\",\"notificationEmail\":\"" + email + "\"}"));
	}

	/** Notices are mailed after commit, on another thread. */
	private static void awaitNotice(String prefix) throws InterruptedException {
		long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
		while (Mailbox.NOTICES.stream().noneMatch((notice) -> notice.startsWith(prefix))) {
			assertThat(System.nanoTime()).as("notice %s in %s", prefix, Mailbox.NOTICES).isLessThan(deadline);
			Thread.sleep(50);
		}
	}

	/** The session after a response that renewed its id; the CSRF token is not tied to the id. */
	private static Session renewed(MvcResult result, Session before) {
		Cookie cookie = result.getResponse().getCookie("OS_SESSION");
		return new Session((cookie != null) ? cookie : before.cookie(), before.xsrf());
	}

	private org.springframework.test.web.servlet.ResultActions changePassword(Session session, String current,
			String next) throws Exception {
		return this.mvc.perform(withCsrf(post("/api/me/password"), session).contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next + "\"}"));
	}

	// helpers

	record Session(Cookie cookie, Cookie xsrf) {
	}

	private void invite(String email, String name, String password) throws Exception {
		Session admin = login("admin@example.com", "Bootstrap-Secret-2026");
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
