package com.maximusflow.os;

import java.time.Clock;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.maximusflow.os.iam.internal.application.AccountNotifier;
import com.maximusflow.os.iam.internal.application.Totp;

import jakarta.servlet.http.Cookie;

import org.bouncycastle.util.encoders.Base32;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Second factor end to end: policy forces administrators to enrol, enrolment needs a valid code,
 * later sessions are gated until a code (TOTP once, or a recovery code once) is accepted, and five
 * failures end the session. Own context: the policy is on here and off in the other flow tests.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.class })
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = { "os.iam.mfa.require-for-system-role=true", "os.iam.lockout.max-attempts=3" })
class MfaTests {

	@Autowired
	MockMvc mvc;

	@Autowired
	Clock clock;

	@MockitoSpyBean
	AccountNotifier notifier;

	@Test
	void administratorEnrolsThenEverySessionNeedsTheSecondFactor() throws Exception {
		Session admin = login();

		// Policy: enrolment required, everything else gated.
		this.mvc.perform(get("/api/me").cookie(admin.cookie()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mfa.required").value(true))
			.andExpect(jsonPath("$.mfa.enabled").value(false));
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie()))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.type").value("urn:os:problem:mfa-enrolment-required"));

		// Enrolment: wrong code refused, right code accepted, recovery codes returned once.
		// Starting enrolment needs the password again: a hijacked session cannot bind its own authenticator.
		this.mvc.perform(withCsrf(post("/api/me/mfa/setup"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"wrong-password-123\"}")).andExpect(status().is(422));
		MvcResult setup = this.mvc.perform(withCsrf(post("/api/me/mfa/setup"), admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"currentPassword\":\"Bootstrap-Secret-2026\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.otpauthUri").value(org.hamcrest.Matchers.startsWith("otpauth://totp/OS:admin%40example.com?secret=")))
			.andReturn();
		// Typing the password again is a re-authentication: the session id changes (ASVS 7.2.4).
		this.mvc.perform(get("/api/me").cookie(admin.cookie())).andExpect(status().isUnauthorized());
		admin = renewed(setup, admin);
		byte[] secret = Base32.decode(firstMatch(setup, "\"secret\"\\s*:\\s*\"([^\"]+)\""));
		this.mvc.perform(withCsrf(post("/api/me/mfa/confirm"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"000000\"}")).andExpect(status().is(422));
		MvcResult confirmed = this.mvc
			.perform(withCsrf(post("/api/me/mfa/confirm"), admin).contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"" + currentCode(secret) + "\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.recoveryCodes.length()").value(10))
			.andReturn();
		List<String> recovery = allMatches(confirmed, "\"([a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5})\"");
		assertThat(recovery).hasSize(10);
		// More privilege, new session id: the one from before enrolment no longer works.
		this.mvc.perform(get("/api/me").cookie(admin.cookie())).andExpect(status().isUnauthorized());
		admin = renewed(confirmed, admin);

		// The enrolling session counts as verified; the trail names the person.
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie())).andExpect(status().isOk());
		this.mvc.perform(get("/api/me/mfa").cookie(admin.cookie()))
			.andExpect(jsonPath("$.enabled").value(true))
			.andExpect(jsonPath("$.recoveryCodesLeft").value(10));

		// A new session is gated until a code is accepted; a TOTP step is accepted once.
		Session second = login();
		this.mvc.perform(get("/api/me").cookie(second.cookie())).andExpect(jsonPath("$.mfa.verified").value(false));
		this.mvc.perform(get("/api/iam/users").cookie(second.cookie()))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.type").value("urn:os:problem:mfa-required"));
		// Enrolment consumed the current step: a real person waits for the next code, the test moves the clock.
		String code = currentCode(secret);
		MvcResult passed = this.mvc.perform(withCsrf(post("/api/auth/mfa"), second)
			.contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
			.andExpect(status().isNoContent()).andReturn();
		this.mvc.perform(get("/api/me").cookie(second.cookie())).andExpect(status().isUnauthorized());
		second = renewed(passed, second);
		this.mvc.perform(get("/api/iam/users").cookie(second.cookie())).andExpect(status().isOk());
		Session third = login();
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), third).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"" + code + "\"}")).andExpect(status().is(422));

		// Recovery code works once.
		third = renewed(this.mvc.perform(withCsrf(post("/api/auth/mfa"), third).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"" + recovery.getFirst() + "\"}")).andExpect(status().isNoContent()).andReturn(), third);
		this.mvc.perform(get("/api/me/mfa").cookie(third.cookie())).andExpect(jsonPath("$.recoveryCodesLeft").value(9));
		// Account recovery notifies the person, after commit (NIST SP 800-63B-4).
		verify(this.notifier, timeout(10_000)).sendSecurityNotice(eq("admin@example.com"), anyString(),
				contains("código de recuperação foi usado"));
		Session fourth = login();
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), fourth).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"" + recovery.getFirst() + "\"}")).andExpect(status().is(422));

		// Policy forbids the administrator from turning it off; an administrator cannot reset their own.
		this.mvc.perform(withCsrf(post("/api/me/mfa/disable"), second).contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"Bootstrap-Secret-2026\"}"))
			.andExpect(status().is(422));
		MvcResult me = this.mvc.perform(get("/api/me").cookie(second.cookie())).andReturn();
		this.mvc.perform(withCsrf(post("/api/iam/users/" + firstMatch(me, "\"id\"\\s*:\\s*\"([^\"]+)\"") + "/mfa/reset"), second))
			.andExpect(status().is(422));

		// Logging in inside a verified session starts over: the new session is gated, the old one is gone.
		MvcResult relogin = this.mvc
			.perform(withCsrf(post("/api/auth/login"), second).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"admin@example.com\",\"password\":\"Bootstrap-Secret-2026\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mfa.verified").value(false))
			.andReturn();
		Cookie fresh = relogin.getResponse().getCookie("OS_SESSION");
		assertThat(fresh.getValue()).isNotEqualTo(second.cookie().getValue());
		this.mvc.perform(get("/api/iam/users").cookie(fresh))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.type").value("urn:os:problem:mfa-required"));
		this.mvc.perform(get("/api/me").cookie(second.cookie())).andExpect(status().isUnauthorized());
		Session verified = renewed(relogin, new Session(fresh, second.xsrf()));
		verified = renewed(this.mvc.perform(withCsrf(post("/api/auth/mfa"), verified)
			.contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + recovery.get(1) + "\"}"))
			.andExpect(status().isNoContent()).andReturn(), verified);
		fresh = verified.cookie();

		// Failed codes count against the account (lockout after 3 here), not only the session, and a
		// new password login does not start the count over (it did once: log in, guess, log in again).
		Session fifth = login();
		for (int i = 0; i < 2; i++) {
			this.mvc.perform(withCsrf(post("/api/auth/mfa"), fifth).contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"111111\"}")).andExpect(status().is(422));
		}
		Session sixth = login();
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), sixth).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"111111\"}")).andExpect(status().is(422));
		// Locked now: even a valid recovery code is refused.
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), sixth).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"" + recovery.get(2) + "\"}")).andExpect(status().is(422));
		// Five failures in one session end it.
		for (int i = 0; i < 2; i++) {
			this.mvc.perform(withCsrf(post("/api/auth/mfa"), sixth).contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"111111\"}")).andExpect(status().is(422));
		}
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), sixth).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"111111\"}")).andExpect(status().isUnauthorized());
		this.mvc.perform(get("/api/me").cookie(sixth.cookie())).andExpect(status().isUnauthorized());
		MvcResult csrf = this.mvc.perform(get("/api/auth/csrf")).andReturn();
		Cookie xsrf = csrf.getResponse().getCookie("XSRF-TOKEN");
		this.mvc.perform(post("/api/auth/login").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"admin@example.com\",\"password\":\"Bootstrap-Secret-2026\"}"))
			.andExpect(status().isUnauthorized());
		// The verified session keeps working: the lock stops new logins and code checks, not open sessions.
		this.mvc.perform(get("/api/iam/users").cookie(fresh)).andExpect(status().isOk());
	}

	/**
	 * The session after a response that changed its id (second factor passed, login) and possibly
	 * its CSRF token.
	 */
	private static Session renewed(MvcResult result, Session before) {
		Cookie cookie = result.getResponse().getCookie("OS_SESSION");
		Cookie xsrf = result.getResponse().getCookie("XSRF-TOKEN");
		return new Session((cookie != null) ? cookie : before.cookie(),
				(xsrf != null && !xsrf.getValue().isEmpty()) ? xsrf : before.xsrf());
	}

	/** The next code: each TOTP step is accepted once and only during its own 30 s, so the clock moves on. */
	private String currentCode(byte[] secret) {
		MovableClock.advance(java.time.Duration.ofSeconds(30));
		return Totp.code(secret, Totp.stepAt(this.clock.instant()));
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
		return allMatches(result, regex).getFirst();
	}

	private static List<String> allMatches(MvcResult result, String regex) throws Exception {
		String body = result.getResponse().getContentAsString();
		Matcher matcher = Pattern.compile(regex).matcher(body);
		List<String> found = new java.util.ArrayList<>();
		while (matcher.find()) {
			found.add(matcher.group(1));
		}
		assertThat(found).as("pattern %s in %s", regex, body).isNotEmpty();
		return found;
	}

}
