package com.maximusflow.os;

import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.data.AuthenticatorAssertionResponse;
import com.webauthn4j.data.AuthenticatorAttestationResponse;
import com.webauthn4j.data.PublicKeyCredential;
import com.webauthn4j.data.PublicKeyCredentialCreationOptions;
import com.webauthn4j.data.PublicKeyCredentialRequestOptions;
import com.webauthn4j.data.client.Origin;
import com.webauthn4j.test.EmulatorUtil;
import com.webauthn4j.test.authenticator.webauthn.WebAuthnAuthenticatorAdaptor;
import com.webauthn4j.test.client.ClientPlatform;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A passkey as the second factor, end to end with an emulated authenticator (WebAuthn4J's test
 * client, the library behind Spring Security's relying party): enrolment as the first factor, login
 * with it, refusal of an answer made for another site, and the factor in the person's own data.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = { "os.iam.mfa.require-for-system-role=true",
		"os.app.base-url=https://portal.example.test" })
class PasskeyTests {

	private static final String PASSWORD = "Bootstrap-Secret-2026";

	private static final ObjectConverter WEBAUTHN4J = new ObjectConverter();

	private static final Base64.Encoder B64URL = Base64.getUrlEncoder().withoutPadding();

	@Autowired
	MockMvc mvc;

	private final ClientPlatform browser = new ClientPlatform(new Origin("https://portal.example.test"),
			new WebAuthnAuthenticatorAdaptor(EmulatorUtil.NONE_ATTESTATION_AUTHENTICATOR));

	@Test
	void aPasskeyEnrolsAsTheFirstFactorAndCompletesLaterLogins() throws Exception {
		// Enrolment needs the password again, then the browser's answer to the options.
		Session admin = login();
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie()))
			.andExpect(jsonPath("$.type").value("urn:os:problem:mfa-enrolment-required"));
		this.mvc.perform(withCsrf(post("/api/me/passkeys/options"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"wrong-password-123\"}")).andExpect(status().is(422));
		MvcResult optionsResult = this.mvc.perform(withCsrf(post("/api/me/passkeys/options"), admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"currentPassword\":\"" + PASSWORD + "\"}"))
			.andExpect(status().isOk()).andReturn();
		// The password typed again renews the session id (ASVS 7.2.4); the ceremony's options stay in it.
		admin = renewed(optionsResult, admin);
		String options = optionsResult.getResponse().getContentAsString();
		PublicKeyCredential<AuthenticatorAttestationResponse, ?> created = this.browser
			.create(WEBAUTHN4J.getJsonConverter().readValue(options, PublicKeyCredentialCreationOptions.class));
		MvcResult registered = this.mvc.perform(withCsrf(post("/api/me/passkeys"), admin)
			.contentType(MediaType.APPLICATION_JSON).content(registration(created, "Notebook")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.recoveryCodes.length()").value(10))
			.andReturn();
		String recoveryCode = firstMatch(registered, "\"([a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5})\"");
		admin = renewed(registered, admin);
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie())).andExpect(status().isOk());
		this.mvc.perform(get("/api/me/mfa").cookie(admin.cookie()))
			.andExpect(jsonPath("$.enabled").value(true))
			.andExpect(jsonPath("$.totp").value(false))
			.andExpect(jsonPath("$.passkeys").value(1));

		// A later login stops at the password until the passkey answers.
		Session next = login();
		this.mvc.perform(get("/api/iam/users").cookie(next.cookie()))
			.andExpect(jsonPath("$.type").value("urn:os:problem:mfa-required"));
		// An answer signed for another site is refused, even with the right passkey.
		String request = requestOptions(next);
		ClientPlatform phishing = new ClientPlatform(new Origin("https://portal.example.test.evil.example"),
				this.browser.getAuthenticatorAdaptor());
		this.mvc.perform(withCsrf(post("/api/auth/mfa/passkey"), next).contentType(MediaType.APPLICATION_JSON)
			.content(assertion(phishing.get(WEBAUTHN4J.getJsonConverter().readValue(request,
					PublicKeyCredentialRequestOptions.class)))))
			.andExpect(status().is(422));
		this.mvc.perform(get("/api/iam/users").cookie(next.cookie())).andExpect(status().isForbidden());
		// The real site gets through.
		request = requestOptions(next);
		next = renewed(this.mvc.perform(withCsrf(post("/api/auth/mfa/passkey"), next)
			.contentType(MediaType.APPLICATION_JSON)
			.content(assertion(this.browser.get(WEBAUTHN4J.getJsonConverter().readValue(request,
					PublicKeyCredentialRequestOptions.class)))))
			.andExpect(status().isNoContent()).andReturn(), next);
		this.mvc.perform(get("/api/iam/users").cookie(next.cookie())).andExpect(status().isOk());

		// A recovery code also completes the login of an account whose only factor is a passkey.
		Session lostDevice = login();
		this.mvc.perform(withCsrf(post("/api/auth/mfa"), lostDevice).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"" + recoveryCode + "\"}")).andExpect(status().isNoContent());

		// The person's own data lists the passkey by its name; the policy keeps the only factor.
		this.mvc.perform(get("/api/me/data").cookie(next.cookie()))
			.andExpect(jsonPath("$.account.passkeys[0].label").value("Notebook"));
		MvcResult listed = this.mvc.perform(get("/api/me/passkeys").cookie(next.cookie()))
			.andExpect(jsonPath("$[0].label").value("Notebook")).andReturn();
		String id = firstMatch(listed, "\"id\"\\s*:\\s*\"([^\"]+)\"");
		this.mvc.perform(withCsrf(delete("/api/me/passkeys/" + id), next).contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"" + PASSWORD + "\"}")).andExpect(status().is(422));
	}

	// helpers

	record Session(Cookie cookie, Cookie xsrf) {
	}

	private String requestOptions(Session session) throws Exception {
		return this.mvc.perform(withCsrf(post("/api/auth/mfa/passkey/options"), session))
			.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	/** The browser's answer to a registration, in the JSON form of the WebAuthn API (Base64url fields). */
	private static String registration(PublicKeyCredential<AuthenticatorAttestationResponse, ?> credential,
			String label) {
		AuthenticatorAttestationResponse response = credential.getResponse();
		return """
				{"publicKey":{"label":"%s","credential":{"id":"%s","rawId":"%s","type":"public-key",
				"response":{"attestationObject":"%s","clientDataJSON":"%s","transports":[]},
				"clientExtensionResults":{}}}}""".formatted(label, credential.getId(), credential.getId(),
				B64URL.encodeToString(response.getAttestationObject()),
				B64URL.encodeToString(response.getClientDataJSON()));
	}

	private static String assertion(PublicKeyCredential<AuthenticatorAssertionResponse, ?> credential) {
		AuthenticatorAssertionResponse response = credential.getResponse();
		return """
				{"id":"%s","rawId":"%s","type":"public-key","response":{"authenticatorData":"%s",
				"clientDataJSON":"%s","signature":"%s","userHandle":"%s"},"clientExtensionResults":{}}"""
			.formatted(credential.getId(), credential.getId(), B64URL.encodeToString(response.getAuthenticatorData()),
					B64URL.encodeToString(response.getClientDataJSON()), B64URL.encodeToString(response.getSignature()),
					B64URL.encodeToString(response.getUserHandle()));
	}

	private Session login() throws Exception {
		Cookie xsrf = this.mvc.perform(get("/api/auth/csrf")).andReturn().getResponse().getCookie("XSRF-TOKEN");
		MvcResult login = this.mvc
			.perform(post("/api/auth/login").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"admin@example.com\",\"password\":\"" + PASSWORD + "\"}"))
			.andExpect(status().isOk())
			.andReturn();
		return renewed(login, new Session(login.getResponse().getCookie("OS_SESSION"), xsrf));
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
