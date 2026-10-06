package com.maximusflow.os;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end security behaviour through the real filter chain, session store and database:
 * deny by default, CSRF, login, permissions, invitation, disable, lockout and logout.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AuthAndIamFlowTests {

	private static final String ADMIN_EMAIL = "admin@example.com";

	private static final String ADMIN_PASSWORD = "Bootstrap-Secret-2026";

	@Autowired
	MockMvc mvc;

	@Test
	@Order(1)
	void unauthenticatedRequestsGetProblemDetail401() throws Exception {
		this.mvc.perform(get("/api/me"))
			.andExpect(status().isUnauthorized())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.status").value(401));
	}

	@Test
	@Order(2)
	void loginWithoutCsrfTokenIsRejected() throws Exception {
		this.mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.content(json(ADMIN_EMAIL, ADMIN_PASSWORD)))
			.andExpect(status().isForbidden());
	}

	@Test
	@Order(3)
	void wrongPasswordIs401AndDoesNotCreateSession() throws Exception {
		Csrf csrf = csrf();
		this.mvc.perform(withCsrf(post("/api/auth/login"), csrf).contentType(MediaType.APPLICATION_JSON)
			.content(json(ADMIN_EMAIL, "wrong-password-value")))
			.andExpect(status().isUnauthorized())
			.andExpect(cookie().doesNotExist("OS_SESSION"));
	}

	@Test
	@Order(4)
	void loginThenMeThenLogout() throws Exception {
		Session admin = login(ADMIN_EMAIL, ADMIN_PASSWORD);

		this.mvc.perform(get("/api/me").cookie(admin.cookie()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value(ADMIN_EMAIL))
			.andExpect(jsonPath("$.roles[0]").value("Administrador"))
			.andExpect(jsonPath("$.permissions").isArray())
			.andExpect(jsonPath("$.permissions[?(@ == 'iam.user.create')]").exists());

		this.mvc.perform(withCsrf(post("/api/auth/logout"), admin.csrf()).cookie(admin.cookie()))
			.andExpect(status().isNoContent());

		this.mvc.perform(get("/api/me").cookie(admin.cookie())).andExpect(status().isUnauthorized());
	}

	@Test
	@Order(5)
	void inviteAcceptLoginAndPermissionDenied() throws Exception {
		Session admin = login(ADMIN_EMAIL, ADMIN_PASSWORD);

		MvcResult invited = this.mvc
			.perform(withCsrf(post("/api/iam/users"), admin.csrf()).cookie(admin.cookie())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"Ana@Example.com\",\"name\":\"Ana\",\"roleIds\":[]}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.user.email").value("ana@example.com"))
			.andExpect(jsonPath("$.user.status").value("INVITED"))
			.andReturn();
		String link = jsonValue(invited, "invitationLink");
		String token = link.substring(link.lastIndexOf('/') + 1);

		this.mvc.perform(withCsrf(post("/api/iam/invitations/accept"), csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + token + "\",\"password\":\"short\"}"))
			.andExpect(status().is(422));

		this.mvc.perform(withCsrf(post("/api/iam/invitations/accept"), csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + token + "\",\"password\":\"Ana-Passphrase-2026\"}"))
			.andExpect(status().isNoContent());

		// token is single use
		this.mvc.perform(withCsrf(post("/api/iam/invitations/accept"), csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + token + "\",\"password\":\"Ana-Passphrase-2026\"}"))
			.andExpect(status().is(422));

		Session ana = login("ana@example.com", "Ana-Passphrase-2026");
		this.mvc.perform(get("/api/me").cookie(ana.cookie()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.permissions").isEmpty());
		this.mvc.perform(get("/api/iam/users").cookie(ana.cookie()))
			.andExpect(status().isForbidden())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));

		// admin disables Ana: her session stops working
		String anaId = jsonValue(invited, "user.id");
		this.mvc.perform(withCsrf(post("/api/iam/users/" + anaId + "/disable"), admin.csrf()).cookie(admin.cookie()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("DISABLED"));
		this.mvc.perform(get("/api/me").cookie(ana.cookie())).andExpect(status().isUnauthorized());
	}

	@Test
	@Order(6)
	void accountLocksAfterRepeatedFailures() throws Exception {
		Session admin = login(ADMIN_EMAIL, ADMIN_PASSWORD);
		MvcResult invited = this.mvc
			.perform(withCsrf(post("/api/iam/users"), admin.csrf()).cookie(admin.cookie())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"bob@example.com\",\"name\":\"Bob\"}"))
			.andExpect(status().isCreated())
			.andReturn();
		String link = jsonValue(invited, "invitationLink");
		String token = link.substring(link.lastIndexOf('/') + 1);
		this.mvc.perform(withCsrf(post("/api/iam/invitations/accept"), csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + token + "\",\"password\":\"Bob-Passphrase-2026\"}"))
			.andExpect(status().isNoContent());

		Csrf csrf = csrf();
		for (int i = 0; i < 5; i++) {
			this.mvc.perform(withCsrf(post("/api/auth/login"), csrf).contentType(MediaType.APPLICATION_JSON)
				.content(json("bob@example.com", "nope-" + i))).andExpect(status().isUnauthorized());
		}
		// locked: even the right password is refused, with the same generic 401
		this.mvc.perform(withCsrf(post("/api/auth/login"), csrf).contentType(MediaType.APPLICATION_JSON)
			.content(json("bob@example.com", "Bob-Passphrase-2026"))).andExpect(status().isUnauthorized());

		String bobId = jsonValue(invited, "user.id");
		this.mvc.perform(get("/api/iam/users/" + bobId).cookie(admin.cookie()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.locked").value(true));
	}

	@Test
	@Order(7)
	void selfServicePasswordChangeKeepsCurrentSessionAndDropsOthers() throws Exception {
		Session first = login(ADMIN_EMAIL, ADMIN_PASSWORD);
		Session second = login(ADMIN_EMAIL, ADMIN_PASSWORD);

		MvcResult changed = this.mvc.perform(withCsrf(post("/api/me/password"), first.csrf()).cookie(first.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"" + ADMIN_PASSWORD + "\",\"newPassword\":\"Nimda-Passphrase-2027\"}"))
			.andExpect(status().isNoContent())
			.andReturn();

		// The session survives under a new id; the id it had before, and every other session, are gone.
		this.mvc.perform(get("/api/me").cookie(first.cookie())).andExpect(status().isUnauthorized());
		first = new Session(changed.getResponse().getCookie("OS_SESSION"), first.csrf());
		this.mvc.perform(get("/api/me").cookie(first.cookie())).andExpect(status().isOk());
		this.mvc.perform(get("/api/me").cookie(second.cookie())).andExpect(status().isUnauthorized());

		// restore for other tests
		MvcResult restored = this.mvc.perform(withCsrf(post("/api/me/password"), first.csrf()).cookie(first.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"Nimda-Passphrase-2027\",\"newPassword\":\"" + ADMIN_PASSWORD + "\"}"))
			.andExpect(status().isNoContent())
			.andReturn();
		first = new Session(restored.getResponse().getCookie("OS_SESSION"), first.csrf());
		this.mvc.perform(withCsrf(delete("/api/me/sessions"), first.csrf()).cookie(first.cookie()))
			.andExpect(status().isNoContent());
	}

	@Test
	@Order(8)
	void delegatedUserManagersCanInviteRenameAndDisableButNeverGiveAccess() throws Exception {
		Session admin = login(ADMIN_EMAIL, ADMIN_PASSWORD);
		String adminRoleId = adminRoleId(admin);

		// Reserved permissions never enter a custom role.
		this.mvc.perform(withCsrf(post("/api/iam/roles"), admin.csrf()).cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Suporte\",\"permissions\":[\"iam.user.read\",\"iam.user.mfa.reset\"]}"))
			.andExpect(status().is(422))
			.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("reservada")));
		String managerRoleId = jsonValue(this.mvc
			.perform(withCsrf(post("/api/iam/roles"), admin.csrf()).cookie(admin.cookie())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"Gestor\",\"permissions\":[\"iam.user.read\",\"iam.user.update\","
						+ "\"iam.user.create\",\"iam.user.disable\",\"iam.role.read\"]}"))
			.andExpect(status().isCreated())
			.andReturn(), "id");
		String carolId = inviteAndAccept(admin, "carol@example.com", "Carol", managerRoleId, "Lorac-Passphrase-2026");
		Session carol = login("carol@example.com", "Lorac-Passphrase-2026");

		// Carol invites without roles and renames; she cannot give anyone access, herself included.
		this.mvc.perform(withCsrf(post("/api/iam/users"), carol.csrf()).cookie(carol.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"nina@example.com\",\"name\":\"Nina\"}"))
			.andExpect(status().isCreated());
		this.mvc.perform(withCsrf(post("/api/iam/users"), carol.csrf()).cookie(carol.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"otto@example.com\",\"name\":\"Otto\",\"roleIds\":[\"" + managerRoleId + "\"]}"))
			.andExpect(status().isForbidden());
		this.mvc.perform(withCsrf(put("/api/iam/users/" + carolId + "/roles"), carol.csrf()).cookie(carol.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"roleIds\":[\"" + managerRoleId + "\",\"" + adminRoleId + "\"]}"))
			.andExpect(status().isForbidden());
		this.mvc.perform(withCsrf(patch("/api/iam/users/" + carolId), carol.csrf()).cookie(carol.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Carol S.\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Carol S."));
		// Nor manage roles.
		this.mvc.perform(withCsrf(post("/api/iam/roles"), carol.csrf()).cookie(carol.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Minha\",\"permissions\":[\"iam.user.read\"]}"))
			.andExpect(status().isForbidden());

		// Granting the administrator role needs the granting person's password.
		String daveBody = "{\"email\":\"dave@example.com\",\"name\":\"Dave\",\"roleIds\":[\"" + adminRoleId + "\"]";
		this.mvc.perform(withCsrf(post("/api/iam/users"), admin.csrf()).cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content(daveBody + "}"))
			.andExpect(status().is(422));
		this.mvc.perform(withCsrf(post("/api/iam/users"), admin.csrf()).cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content(daveBody + ",\"currentPassword\":\"wrong-password-value\"}"))
			.andExpect(status().is(422));
		MvcResult daveCreated = this.mvc
			.perform(withCsrf(post("/api/iam/users"), admin.csrf()).cookie(admin.cookie())
				.contentType(MediaType.APPLICATION_JSON)
				.content(daveBody + ",\"currentPassword\":\"" + ADMIN_PASSWORD + "\"}"))
			.andExpect(status().isCreated())
			.andReturn();
		String daveId = jsonValue(daveCreated, "user.id");
		// The password typed again is a re-authentication: the session id changes (ASVS 7.2.4).
		admin = renewed(daveCreated, admin);

		// Carol cannot act on an account that holds more than she does.
		this.mvc.perform(withCsrf(post("/api/iam/users/" + daveId + "/invitations"), carol.csrf()).cookie(carol.cookie()))
			.andExpect(status().isForbidden());
		this.mvc.perform(withCsrf(patch("/api/iam/users/" + daveId), carol.csrf()).cookie(carol.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Dave X\"}"))
			.andExpect(status().isForbidden());
		this.mvc.perform(withCsrf(post("/api/iam/users/" + daveId + "/disable"), carol.csrf()).cookie(carol.cookie()))
			.andExpect(status().isForbidden());
		this.mvc.perform(withCsrf(post("/api/iam/users/" + daveId + "/mfa/reset"), carol.csrf()).cookie(carol.cookie()))
			.andExpect(status().isForbidden());
		this.mvc.perform(withCsrf(post("/api/iam/users/" + daveId + "/invitations"), admin.csrf()).cookie(admin.cookie()))
			.andExpect(status().isOk());
	}

	@Test
	@Order(9)
	void thePortalKeepsAtLeastTwoActiveAdministrators() throws Exception {
		Session admin = login(ADMIN_EMAIL, ADMIN_PASSWORD);
		String adminRoleId = adminRoleId(admin);
		MvcResult me = this.mvc.perform(get("/api/me").cookie(admin.cookie())).andExpect(status().isOk()).andReturn();
		String adminId = jsonValue(me, "id");
		this.mvc.perform(get("/api/iam/users/administrators").cookie(admin.cookie()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.active").value(1))
			.andExpect(jsonPath("$.minimum").value(2))
			.andExpect(jsonPath("$.belowMinimum").value(true));

		// Only one: it can lose neither the role nor its access.
		this.mvc.perform(withCsrf(put("/api/iam/users/" + adminId + "/roles"), admin.csrf()).cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"roleIds\":[]}"))
			.andExpect(status().is(422));

		// Two administrators: still the minimum, neither can be removed.
		String eva = inviteAndAccept(admin, "eva@example.com", "Eva", null, "Ave-Passphrase-2026");
		admin = renewed(this.mvc.perform(withCsrf(put("/api/iam/users/" + eva + "/roles"), admin.csrf()).cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"roleIds\":[\"" + adminRoleId + "\"],\"currentPassword\":\"" + ADMIN_PASSWORD + "\"}"))
			.andExpect(status().isOk()).andReturn(), admin);
		this.mvc.perform(get("/api/iam/users/administrators").cookie(admin.cookie()))
			.andExpect(jsonPath("$.active").value(2))
			.andExpect(jsonPath("$.belowMinimum").value(false));
		this.mvc.perform(withCsrf(post("/api/iam/users/" + eva + "/disable"), admin.csrf()).cookie(admin.cookie()))
			.andExpect(status().is(422));

		// A third one makes room.
		String fabio = inviteAndAccept(admin, "fabio@example.com", "Fabio", null, "Oibaf-Passphrase-2026");
		admin = renewed(this.mvc.perform(withCsrf(put("/api/iam/users/" + fabio + "/roles"), admin.csrf()).cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"roleIds\":[\"" + adminRoleId + "\"],\"currentPassword\":\"" + ADMIN_PASSWORD + "\"}"))
			.andExpect(status().isOk()).andReturn(), admin);
		this.mvc.perform(withCsrf(post("/api/iam/users/" + eva + "/disable"), admin.csrf()).cookie(admin.cookie()))
			.andExpect(status().isOk());
		// Nobody disables themself.
		this.mvc.perform(withCsrf(post("/api/iam/users/" + adminId + "/disable"), admin.csrf()).cookie(admin.cookie()))
			.andExpect(status().is(422));
	}

	@Test
	@Order(10)
	void theCatalogFlagsReservedPermissionsAndTheSystemRoleHoldsThem() throws Exception {
		Session admin = login(ADMIN_EMAIL, ADMIN_PASSWORD);
		MvcResult catalog = this.mvc.perform(get("/api/iam/permissions").cookie(admin.cookie()))
			.andExpect(status().isOk())
			.andReturn();
		String body = catalog.getResponse().getContentAsString();
		for (String reserved : new String[] { "iam.role.create", "iam.role.update", "iam.role.delete",
				"iam.user.roles.assign", "iam.user.mfa.reset", "iam.user.anonymize" }) {
			assertThat(body).contains("\"key\":\"" + reserved + "\"");
			this.mvc.perform(get("/api/iam/permissions").cookie(admin.cookie()))
				.andExpect(jsonPath("$[?(@.key == '" + reserved + "')].reserved").value(true));
		}
		this.mvc.perform(get("/api/iam/permissions").cookie(admin.cookie()))
			.andExpect(jsonPath("$[?(@.key == 'iam.user.update')].reserved").value(false))
			.andExpect(jsonPath("$[?(@.key == 'audit.event.export')].reserved").value(false));
		this.mvc.perform(get("/api/me").cookie(admin.cookie()))
			.andExpect(jsonPath("$.permissions").value(org.hamcrest.Matchers.hasItem("iam.user.roles.assign")));

		// Adding a reserved permission to an existing custom role is refused as well.
		String roleId = jsonValue(this.mvc
			.perform(withCsrf(post("/api/iam/roles"), admin.csrf()).cookie(admin.cookie())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"Auditoria\",\"permissions\":[\"audit.event.read\",\"audit.event.export\"]}"))
			.andExpect(status().isCreated())
			.andReturn(), "id");
		this.mvc.perform(withCsrf(put("/api/iam/roles/" + roleId), admin.csrf()).cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Auditoria\",\"permissions\":[\"audit.event.read\",\"iam.user.anonymize\"]}"))
			.andExpect(status().is(422));
		// The system role is never editable.
		this.mvc.perform(withCsrf(put("/api/iam/roles/" + adminRoleId(admin)), admin.csrf()).cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Administrador\",\"permissions\":[]}"))
			.andExpect(status().is(422));
	}

	private String adminRoleId(Session admin) throws Exception {
		MvcResult roles = this.mvc.perform(get("/api/iam/roles").cookie(admin.cookie())).andExpect(status().isOk())
			.andReturn();
		return firstMatch(roles, "\"id\":\"([^\"]+)\",\"name\":\"Administrador\"");
	}

	/** Invites with at most one (non-system) role and accepts; returns the new user's id. */
	private String inviteAndAccept(Session admin, String email, String name, String roleId, String password)
			throws Exception {
		String roles = (roleId != null) ? ",\"roleIds\":[\"" + roleId + "\"]" : "";
		MvcResult invited = this.mvc
			.perform(withCsrf(post("/api/iam/users"), admin.csrf()).cookie(admin.cookie())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"" + email + "\",\"name\":\"" + name + "\"" + roles + "}"))
			.andExpect(status().isCreated())
			.andReturn();
		String link = jsonValue(invited, "invitationLink");
		this.mvc.perform(withCsrf(post("/api/iam/invitations/accept"), csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + link.substring(link.lastIndexOf('/') + 1) + "\",\"password\":\"" + password
					+ "\"}"))
			.andExpect(status().isNoContent());
		return jsonValue(invited, "user.id");
	}

	// helpers

	record Csrf(Cookie cookie, String token) {
	}

	record Session(Cookie cookie, Csrf csrf) {
	}

	private Csrf csrf() throws Exception {
		MvcResult result = this.mvc.perform(get("/api/auth/csrf")).andExpect(status().isNoContent()).andReturn();
		Cookie cookie = result.getResponse().getCookie("XSRF-TOKEN");
		assertThat(cookie).isNotNull();
		return new Csrf(cookie, cookie.getValue());
	}

	private static MockHttpServletRequestBuilder withCsrf(MockHttpServletRequestBuilder builder, Csrf csrf) {
		return builder.cookie(csrf.cookie()).header("X-XSRF-TOKEN", csrf.token());
	}

	private Session login(String email, String password) throws Exception {
		Csrf csrf = csrf();
		MvcResult result = this.mvc
			.perform(withCsrf(post("/api/auth/login"), csrf).contentType(MediaType.APPLICATION_JSON)
				.content(json(email, password)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value(email))
			.andExpect(cookie().httpOnly("OS_SESSION", true))
			.andExpect(cookie().sameSite("OS_SESSION", "Lax"))
			.andReturn();
		Cookie session = result.getResponse().getCookie("OS_SESSION");
		assertThat(session).isNotNull();
		return new Session(session, csrf);
	}

	/** The session after a response that renewed its id; the CSRF token is not tied to the id and stays. */
	private static Session renewed(MvcResult result, Session before) {
		Cookie cookie = result.getResponse().getCookie("OS_SESSION");
		return new Session((cookie != null) ? cookie : before.cookie(), before.csrf());
	}

	private static String json(String email, String password) {
		return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
	}

	private static String jsonValue(MvcResult result, String path) throws Exception {
		String key = path.substring(path.lastIndexOf('.') + 1);
		return firstMatch(result, "\"" + key + "\"\\s*:\\s*\"([^\"]+)\"");
	}

	private static String firstMatch(MvcResult result, String regex) throws Exception {
		String body = result.getResponse().getContentAsString();
		Matcher matcher = Pattern.compile(regex).matcher(body);
		assertThat(matcher.find()).as("pattern %s in %s", regex, body).isTrue();
		return matcher.group(1);
	}

}
