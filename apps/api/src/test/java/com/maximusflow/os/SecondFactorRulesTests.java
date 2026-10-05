package com.maximusflow.os;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.maximusflow.os.iam.internal.application.Totp;

import jakarta.servlet.http.Cookie;
import org.bouncycastle.util.encoders.Base32;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The rules built on Spring Security's multi-factor model: the concurrent-session limit counts only
 * complete logins, removing someone's second factor needs a recent one (step-up), and that removal
 * proves as much as enrolment did (OWASP ASVS 5.0 6.4.4). Own context with a clock the test moves.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.class })
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "os.iam.mfa.require-for-system-role=true")
class SecondFactorRulesTests {

	private static final String ADMIN_PASSWORD = "Bootstrap-Secret-2026";

	@Autowired
	MockMvc mvc;

	@Autowired
	Clock clock;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void passwordOnlyLoginsDoNotEndVerifiedSessionsAndRemovingAFactorNeedsARecentOne() throws Exception {
		// The administrator enrols; the enrolling session counts as verified.
		Session admin = login("admin@example.com", ADMIN_PASSWORD);
		// Session ids carry 256 random bits (43 Base64url characters), not a 122-bit UUID (ASVS 7.2.3).
		String sessionId = new String(java.util.Base64.getDecoder().decode(admin.cookie().getValue()));
		assertThat(sessionId).hasSize(43).matches("[A-Za-z0-9_-]+");
		MvcResult setup = this.mvc.perform(withCsrf(post("/api/me/mfa/setup"), admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"currentPassword\":\"" + ADMIN_PASSWORD + "\"}"))
			.andExpect(status().isOk()).andReturn();
		admin = renewed(setup, admin);
		byte[] secret = Base32.decode(firstMatch(setup, "\"secret\"\\s*:\\s*\"([^\"]+)\""));
		admin = renewed(this.mvc.perform(withCsrf(post("/api/me/mfa/confirm"), admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + nextCode(secret) + "\"}"))
			.andExpect(status().isOk()).andReturn(), admin);

		// Three verified sessions (the limit), then three logins that stop at the password.
		Session second = verify(login("admin@example.com", ADMIN_PASSWORD), secret);
		Session third = verify(login("admin@example.com", ADMIN_PASSWORD), secret);
		for (int i = 0; i < 3; i++) {
			login("admin@example.com", ADMIN_PASSWORD);
		}
		for (Session verified : List.of(admin, second, third)) {
			this.mvc.perform(get("/api/iam/users").cookie(verified.cookie())).andExpect(status().isOk());
		}
		// A fourth verified login is over the limit: the least recently used verified session ends.
		Session fourth = verify(login("admin@example.com", ADMIN_PASSWORD), secret);
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie())).andExpect(status().isUnauthorized());
		admin = fourth;

		// Someone to reset: invited, active, logged in.
		MvcResult invited = this.mvc.perform(withCsrf(post("/api/iam/users"), admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"ruth@example.com\",\"name\":\"Ruth\"}"))
			.andExpect(status().isCreated()).andReturn();
		String link = firstMatch(invited, "\"invitationLink\"\\s*:\\s*\"([^\"]+)\"");
		String ruthId = firstMatch(invited, "\"id\"\\s*:\\s*\"([^\"]+)\"");
		this.mvc.perform(withCsrf(post("/api/iam/invitations/accept"), anonymous())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + link.substring(link.lastIndexOf('/') + 1)
					+ "\",\"password\":\"Htur-Passphrase-2026\"}"))
			.andExpect(status().isNoContent());
		Session ruth = login("ruth@example.com", "Htur-Passphrase-2026");
		this.mvc.perform(get("/api/me").cookie(ruth.cookie())).andExpect(status().isOk());

		// Sixteen minutes later the factor still opens the portal, but not the reset.
		MovableClock.advance(Duration.ofMinutes(16));
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie())).andExpect(status().isOk());
		this.mvc.perform(withCsrf(post("/api/iam/users/" + ruthId + "/mfa/reset"), admin))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.type").value("urn:os:problem:mfa-reverification-required"));
		admin = verify(admin, secret);
		this.mvc.perform(withCsrf(post("/api/iam/users/" + ruthId + "/mfa/reset"), admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.emailed").value(false))
			.andExpect(jsonPath("$.link").doesNotExist());

		// Ending sessions and changing factors also need a recent factor (ASVS 7.5.1, 7.5.2), and
		// enrolling another factor in an old session does not count as one.
		MovableClock.advance(Duration.ofMinutes(16));
		this.mvc.perform(withCsrf(delete("/api/me/sessions"), admin))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.type").value("urn:os:problem:mfa-reverification-required"));
		this.mvc.perform(withCsrf(post("/api/me/passkeys/options"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"" + ADMIN_PASSWORD + "\"}"))
			.andExpect(jsonPath("$.type").value("urn:os:problem:mfa-reverification-required"));
		admin = verify(admin, secret);
		this.mvc.perform(withCsrf(delete("/api/me/sessions"), admin)).andExpect(status().isNoContent());

		// The reset ends her sessions, voids her password and mails her a reset link.
		Session ended = ruth;
		eventually(() -> statusOf(get("/api/me").cookie(ended.cookie())) == 401);
		this.mvc.perform(withCsrf(post("/api/auth/login"), anonymous()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"ruth@example.com\",\"password\":\"Htur-Passphrase-2026\"}"))
			.andExpect(status().isUnauthorized());
		eventually(() -> this.jdbc.queryForObject("SELECT count(*) FROM account_tokens t JOIN users u ON u.id = "
				+ "t.user_id WHERE u.email = 'ruth@example.com' AND t.type = 'PASSWORD_RESET'", Integer.class) == 1);
	}

	// helpers

	record Session(Cookie cookie, Cookie xsrf) {
	}

	private Session login(String email, String password) throws Exception {
		Session anonymous = anonymous();
		MvcResult login = this.mvc.perform(withCsrf(post("/api/auth/login"), anonymous)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
			.andExpect(status().isOk())
			.andReturn();
		return renewed(login, new Session(login.getResponse().getCookie("OS_SESSION"), anonymous.xsrf()));
	}

	private Session anonymous() throws Exception {
		Cookie xsrf = this.mvc.perform(get("/api/auth/csrf")).andReturn().getResponse().getCookie("XSRF-TOKEN");
		return new Session(new Cookie("unused", "x"), xsrf);
	}

	private Session verify(Session session, byte[] secret) throws Exception {
		return renewed(this.mvc.perform(withCsrf(post("/api/auth/mfa"), session)
			.contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + nextCode(secret) + "\"}"))
			.andExpect(status().isNoContent()).andReturn(), session);
	}

	/** Each TOTP step is accepted once: the clock moves to the next step before every code. */
	private String nextCode(byte[] secret) {
		MovableClock.advance(Duration.ofSeconds(30));
		return Totp.code(secret, Totp.stepAt(this.clock.instant()));
	}

	private int statusOf(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request)
			throws Exception {
		return this.mvc.perform(request).andReturn().getResponse().getStatus();
	}

	private static void eventually(BooleanSupplierWithException condition) throws Exception {
		for (int i = 0; i < 50; i++) {
			if (condition.getAsBoolean()) {
				return;
			}
			Thread.sleep(100);
		}
		assertThat(condition.getAsBoolean()).as("condition within 5 s").isTrue();
	}

	@FunctionalInterface
	interface BooleanSupplierWithException {

		boolean getAsBoolean() throws Exception;

	}

	private static Session renewed(MvcResult result, Session before) {
		Cookie cookie = result.getResponse().getCookie("OS_SESSION");
		Cookie xsrf = result.getResponse().getCookie("XSRF-TOKEN");
		return new Session((cookie != null) ? cookie : before.cookie(),
				(xsrf != null && !xsrf.getValue().isEmpty()) ? xsrf : before.xsrf());
	}

	private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder withCsrf(
			org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder, Session session) {
		return builder.cookie(session.cookie(), session.xsrf()).header("X-XSRF-TOKEN", session.xsrf().getValue());
	}

	private static String firstMatch(MvcResult result, String regex) throws Exception {
		Matcher matcher = Pattern.compile(regex).matcher(result.getResponse().getContentAsString());
		assertThat(matcher.find()).as("pattern %s", regex).isTrue();
		return matcher.group(1);
	}

}
