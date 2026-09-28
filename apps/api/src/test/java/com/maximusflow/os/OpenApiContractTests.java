package com.maximusflow.os;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import jakarta.servlet.http.Cookie;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Exports the OpenAPI document to packages/contracts/openapi.json, the source of the generated
 * TypeScript types. CI fails when the committed file is stale, so the front end can never drift
 * from the API. The document requires a session, like every other API resource.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OpenApiContractTests {

	@Autowired
	MockMvc mvc;

	@Test
	void exportsTheDocumentWithNullabilityAndRequiredFields() throws Exception {
		Cookie session = loginAsAdmin();
		MvcResult result = this.mvc.perform(get("/api/v3/api-docs").cookie(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.components.schemas.UserSummary.required").isArray())
			.andExpect(jsonPath("$.components.schemas.UserSummary.required[?(@ == 'id')]").exists())
			.andExpect(jsonPath("$.components.schemas.UserSummary.properties.lastLoginAt.type[1]").value("null"))
			.andExpect(jsonPath("$.components.schemas.TaskSummary.properties.assignee.anyOf").isArray())
			.andReturn();
		this.mvc.perform(get("/api/v3/api-docs")).andExpect(status().isUnauthorized());

		ObjectMapper stable = JsonMapper.builder().enable(SerializationFeature.INDENT_OUTPUT)
			.enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS).build();
		Object document = stable.readValue(result.getResponse().getContentAsString(), Object.class);
		Path target = repositoryRoot().resolve("packages/contracts/openapi.json");
		Files.createDirectories(target.getParent());
		Files.writeString(target, stable.writeValueAsString(document) + "\n", StandardCharsets.UTF_8);
		assertThat(target).exists();
	}

	private static Path repositoryRoot() {
		Path dir = Path.of(System.getProperty("user.dir")).toAbsolutePath();
		while (dir != null && !Files.exists(dir.resolve("pnpm-workspace.yaml"))) {
			dir = dir.getParent();
		}
		if (dir == null) {
			throw new IllegalStateException("pnpm-workspace.yaml not found above " + System.getProperty("user.dir"));
		}
		return dir;
	}

	private Cookie loginAsAdmin() throws Exception {
		MvcResult csrf = this.mvc.perform(get("/api/auth/csrf")).andReturn();
		Cookie xsrf = csrf.getResponse().getCookie("XSRF-TOKEN");
		MvcResult login = this.mvc
			.perform(post("/api/auth/login").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"admin@example.com\",\"password\":\"Admin-Password-2026\"}"))
			.andExpect(status().isOk())
			.andReturn();
		return login.getResponse().getCookie("OS_SESSION");
	}

}
