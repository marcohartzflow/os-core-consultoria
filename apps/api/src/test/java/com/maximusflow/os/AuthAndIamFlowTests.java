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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

	private static final String ADMIN_PASSWORD = "Admin-Password-2026";

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
			.content("{\"token\":\"" + token + "\",\"password\":\"Ana-Password-2026\"}"))
			.andExpect(status().isNoContent());

		// token is single use
		this.mvc.perform(withCsrf(post("/api/iam/invitations/accept"), csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + token + "\",\"password\":\"Ana-Password-2026\"}"))
			.andExpect(status().is(422));

		Session ana = login("ana@example.com", "Ana-Password-2026");
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
			.content("{\"token\":\"" + token + "\",\"password\":\"Bob-Password-2026\"}"))
			.andExpect(status().isNoContent());

		Csrf csrf = csrf();
		for (int i = 0; i < 5; i++) {
			this.mvc.perform(withCsrf(post("/api/auth/login"), csrf).contentType(MediaType.APPLICATION_JSON)
				.content(json("bob@example.com", "nope-" + i))).andExpect(status().isUnauthorized());
		}
		// locked: even the right password is refused, with the same generic 401
		this.mvc.perform(withCsrf(post("/api/auth/login"), csrf).contentType(MediaType.APPLICATION_JSON)
			.content(json("bob@example.com", "Bob-Password-2026"))).andExpect(status().isUnauthorized());

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

		this.mvc.perform(withCsrf(post("/api/me/password"), first.csrf()).cookie(first.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"" + ADMIN_PASSWORD + "\",\"newPassword\":\"Admin-Password-2027\"}"))
			.andExpect(status().isNoContent());

		this.mvc.perform(get("/api/me").cookie(first.cookie())).andExpect(status().isOk());
		this.mvc.perform(get("/api/me").cookie(second.cookie())).andExpect(status().isUnauthorized());

		// restore for other tests
		this.mvc.perform(withCsrf(post("/api/me/password"), first.csrf()).cookie(first.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"Admin-Password-2027\",\"newPassword\":\"" + ADMIN_PASSWORD + "\"}"))
			.andExpect(status().isNoContent());
		this.mvc.perform(withCsrf(delete("/api/me/sessions"), first.csrf()).cookie(first.cookie()))
			.andExpect(status().isNoContent());
	}

	@Test
	@Order(8)
	void cannotGrantPermissionsYouDoNotHold() throws Exception {
		Session admin = login(ADMIN_EMAIL, ADMIN_PASSWORD);
		MvcResult roles = this.mvc.perform(get("/api/iam/roles").cookie(admin.cookie())).andExpect(status().isOk())
			.andReturn();
		String adminRoleId = firstMatch(roles, "\"id\":\"([^\"]+)\",\"name\":\"Administrador\"");

		MvcResult manager = this.mvc
			.perform(withCsrf(post("/api/iam/roles"), admin.csrf()).cookie(admin.cookie())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"Gestor\",\"permissions\":[\"iam.user.read\",\"iam.user.update\"]}"))
			.andExpect(status().isCreated())
			.andReturn();
		String managerRoleId = jsonValue(manager, "id");

		MvcResult invited = this.mvc
			.perform(withCsrf(post("/api/iam/users"), admin.csrf()).cookie(admin.cookie())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"carol@example.com\",\"name\":\"Carol\",\"roleIds\":[\"" + managerRoleId + "\"]}"))
			.andExpect(status().isCreated())
			.andReturn();
		String token = jsonValue(invited, "invitationLink");
		token = token.substring(token.lastIndexOf('/') + 1);
		this.mvc.perform(withCsrf(post("/api/iam/invitations/accept"), csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"token\":\"" + token + "\",\"password\":\"Carol-Password-2026\"}"))
			.andExpect(status().isNoContent());
		String carolId = jsonValue(invited, "user.id");

		Session carol = login("carol@example.com", "Carol-Password-2026");
		// Carol holds iam.user.update but not the administrator's permissions: escalation refused.
		this.mvc.perform(withCsrf(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
			.patch("/api/iam/users/" + carolId), carol.csrf()).cookie(carol.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Carol\",\"roleIds\":[\"" + adminRoleId + "\",\"" + managerRoleId + "\"]}"))
			.andExpect(status().isForbidden());
		// Keeping what she already has is fine.
		this.mvc.perform(withCsrf(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
			.patch("/api/iam/users/" + carolId), carol.csrf()).cookie(carol.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Carol S.\",\"roleIds\":[\"" + managerRoleId + "\"]}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Carol S."));
	}

	@Test
	@Order(9)
	void lastActiveAdministratorCannotBeRemoved() throws Exception {
		Session admin = login(ADMIN_EMAIL, ADMIN_PASSWORD);
		MvcResult me = this.mvc.perform(get("/api/me").cookie(admin.cookie())).andExpect(status().isOk()).andReturn();
		String adminId = jsonValue(me, "id");
		this.mvc.perform(withCsrf(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
			.patch("/api/iam/users/" + adminId), admin.csrf()).cookie(admin.cookie())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Admin\",\"roleIds\":[]}"))
			.andExpect(status().is(422));
		this.mvc.perform(withCsrf(post("/api/iam/users/" + adminId + "/disable"), admin.csrf()).cookie(admin.cookie()))
			.andExpect(status().is(422));
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
