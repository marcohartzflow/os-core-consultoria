package com.maximusflow.os;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.maximusflow.os.ai.internal.tools.RegisteredTool;
import com.maximusflow.os.ai.internal.tools.ToolRegistry;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.UserDirectory;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The example module proves the full cycle: one annotated use case is reachable as REST and as an
 * agent tool, both under the same permission, rules and audit.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TasksModuleTests {

	@Autowired
	MockMvc mvc;

	@Autowired
	ToolRegistry registry;

	@Autowired
	UserDirectory userDirectory;

	@AfterEach
	void clearContext() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void useCasesAreExposedAsToolsWithTheirPermissions() {
		assertThat(this.registry.all()).extracting(RegisteredTool::name).contains("tasks_list", "tasks_get",
				"tasks_create", "tasks_complete", "tasks_delete");
		assertThat(this.registry.find("tasks_delete")).get().extracting(RegisteredTool::destructive).isEqualTo(true);
		assertThat(this.registry.forPermissions(Set.of("tasks.task.read"))).extracting(RegisteredTool::name)
			.containsExactly("tasks_get", "tasks_list");
	}

	@Test
	void restAndToolShareTheSameUseCase() throws Exception {
		Session admin = login();

		// Created through REST...
		MvcResult created = this.mvc
			.perform(withCsrf(post("/api/tasks"), admin).contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"Fechar folha de setembro\",\"dueDate\":\"2026-10-05\"}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("OPEN"))
			.andExpect(jsonPath("$.assignee").doesNotExist())
			.andReturn();
		String restId = firstMatch(created, "\"id\"\\s*:\\s*\"([^\"]+)\"");

		// ...and through the agent tool, acting as the same person.
		actAsAdmin();
		RegisteredTool create = this.registry.find("tasks_create").orElseThrow();
		String reply = create.callback().call("{\"title\":\"Revisar contrato\",\"assigneeId\":\"" + adminId() + "\"}",
				new ToolContext(Map.of()));
		assertThat(reply).contains("\"title\":\"Revisar contrato\"").contains("\"status\":\"OPEN\"");
		String toolId = reply.replaceAll(".*?\"id\":\"([^\"]+)\".*", "$1");

		// Both land in the same list, visible over REST with the same shape.
		this.mvc.perform(get("/api/tasks").cookie(admin.cookie()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[?(@.id == '" + restId + "')].title").value("Fechar folha de setembro"))
			.andExpect(jsonPath("$.content[?(@.id == '" + toolId + "')].assignee.name").value("Admin"));

		// The tool refuses an assignee that does not exist; the rule lives in the use case.
		// (MockMvc clears the thread's SecurityContext after each request, so act again.)
		actAsAdmin();
		assertThatThrownBy(() -> create.callback().call(
				"{\"title\":\"x\",\"assigneeId\":\"" + UUID.randomUUID() + "\"}", new ToolContext(Map.of())))
			.hasRootCauseMessage("Responsável não encontrado");

		// Completing twice is a business error (422), deletion is 204 and then 404.
		this.mvc.perform(withCsrf(post("/api/tasks/" + restId + "/complete"), admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("DONE"))
			.andExpect(jsonPath("$.completedAt").isNotEmpty());
		this.mvc.perform(withCsrf(post("/api/tasks/" + restId + "/complete"), admin)).andExpect(status().is(422));
		this.mvc.perform(withCsrf(delete("/api/tasks/" + restId), admin)).andExpect(status().isNoContent());
		this.mvc.perform(get("/api/tasks/" + restId).cookie(admin.cookie())).andExpect(status().isNotFound());
		this.mvc.perform(withCsrf(delete("/api/tasks/" + toolId), admin)).andExpect(status().isNoContent());
	}

	@Test
	void toolExecutionIsDeniedWithoutThePermissionEvenIfTheModelNamesIt() {
		actAs(Set.of("tasks.task.read"));
		RegisteredTool create = this.registry.find("tasks_create").orElseThrow();
		assertThatThrownBy(() -> create.callback().call("{\"title\":\"x\"}", new ToolContext(Map.of())))
			.hasCauseInstanceOf(AccessDeniedException.class);
	}

	@Test
	void restIsDeniedWithoutTheSession() throws Exception {
		this.mvc.perform(get("/api/tasks")).andExpect(status().isUnauthorized());
	}

	// helpers

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

	private UUID adminId() {
		return this.userDirectory.findByEmail("admin@example.com").orElseThrow().id();
	}

	private void actAsAdmin() {
		AccountSnapshot admin = this.userDirectory.findByEmail("admin@example.com").orElseThrow();
		actAs(admin.permissions());
	}

	private void actAs(Set<String> permissions) {
		AccountSnapshot admin = this.userDirectory.findByEmail("admin@example.com").orElseThrow();
		OsPrincipal principal = new OsPrincipal(admin.id(), admin.email(), admin.name(), null, true, true,
				permissions);
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(
				UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
		SecurityContextHolder.setContext(context);
	}

	private static String firstMatch(MvcResult result, String regex) throws Exception {
		String body = result.getResponse().getContentAsString();
		Matcher matcher = Pattern.compile(regex).matcher(body);
		assertThat(matcher.find()).as("pattern %s in %s", regex, body).isTrue();
		return matcher.group(1);
	}

}
