package com.maximusflow.os;

import java.time.Clock;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Second factor end to end: policy forces administrators to enrol, enrolment needs a valid code,
 * later sessions are gated until a code (TOTP once, or a recovery code once) is accepted, and five
 * failures end the session. Own context: the policy is on here and off in the other flow tests.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "os.iam.mfa.require-for-system-role=true")
class MfaTests {

	@Autowired
	MockMvc mvc;

	@Autowired
	Clock clock;

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
		MvcResult setup = this.mvc.perform(withCsrf(post("/api/me/mfa/setup"), admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.otpauthUri").value(org.hamcrest.Matchers.startsWith("otpauth://totp/OS:admin%40example.com?secret=")))
			.andReturn();
		byte[] secret = Base32.decode(firstMatch(setup, "\"secret\"\\s*:\\s*\"([^\"]+)\""));
		this.mvc.perform(withCsrf(post("/api/me/mfa/confirm"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"000000\"}")).andExpect(status().is(422));
		MvcResult confirmed = this.mvc
			.perform(withCsrf(post("/api/me/mfa/confirm"), admin).contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"" + currentCode(secret) + "\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.recoveryCodes.length()").value(10))
			.andReturn();
		List<String> recovery = allMatches(confirmed, "\"([a-z0-9]{5}-[a-z0-9]{5})\"");
		assertThat(recovery).hasSize(10);

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
		// Enrolment consumed the current step; a real person waits 30 s, the test takes the next step (inside the window).
		String code = Totp.code(secret, Totp.stepAt(this.clock.instant()) + 1);
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), second).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"" + code + "\"}")).andExpect(status().isNoContent());
		this.mvc.perform(get("/api/iam/users").cookie(second.cookie())).andExpect(status().isOk());
		Session third = login();
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), third).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"" + code + "\"}")).andExpect(status().is(422));

		// Recovery code works once.
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), third).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"" + recovery.getFirst() + "\"}")).andExpect(status().isNoContent());
		this.mvc.perform(get("/api/me/mfa").cookie(third.cookie())).andExpect(jsonPath("$.recoveryCodesLeft").value(9));
		Session fourth = login();
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), fourth).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"" + recovery.getFirst() + "\"}")).andExpect(status().is(422));

		// Five failures end the session.
		for (int i = 0; i < 3; i++) {
			this.mvc.perform(withCsrf(post("/api/auth/mfa"), fourth).contentType(MediaType.APPLICATION_JSON)
				.content("{\"code\":\"111111\"}")).andExpect(status().is(422));
		}
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), fourth).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"111111\"}")).andExpect(status().isUnauthorized());
		this.mvc.perform(get("/api/me").cookie(fourth.cookie())).andExpect(status().isUnauthorized());

		// Policy forbids the administrator from turning it off; an administrator cannot reset their own.
		this.mvc.perform(withCsrf(post("/api/me/mfa/disable"), second).contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"Admin-Password-2026\",\"code\":\"" + currentCode(secret) + "\"}"))
			.andExpect(status().is(422));
		MvcResult me = this.mvc.perform(get("/api/me").cookie(second.cookie())).andReturn();
		this.mvc.perform(withCsrf(post("/api/iam/users/" + firstMatch(me, "\"id\"\\s*:\\s*\"([^\"]+)\"") + "/mfa/reset"), second))
			.andExpect(status().is(422));

		// Logging in inside a verified session starts over: the new session is gated, the old one is gone.
		MvcResult relogin = this.mvc
			.perform(withCsrf(post("/api/auth/login"), second).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"admin@example.com\",\"password\":\"Admin-Password-2026\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mfa.verified").value(false))
			.andReturn();
		Cookie fresh = relogin.getResponse().getCookie("OS_SESSION");
		assertThat(fresh.getValue()).isNotEqualTo(second.cookie().getValue());
		this.mvc.perform(get("/api/iam/users").cookie(fresh))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.type").value("urn:os:problem:mfa-required"));
		this.mvc.perform(get("/api/me").cookie(second.cookie())).andExpect(status().isUnauthorized());
	}

	private String currentCode(byte[] secret) {
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
				.content("{\"email\":\"admin@example.com\",\"password\":\"Admin-Password-2026\"}"))
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
