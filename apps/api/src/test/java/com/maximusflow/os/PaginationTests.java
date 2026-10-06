package com.maximusflow.os;

import java.time.LocalDate;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Every listing of the API pages, filters and sorts the same way: page, size (1 to 100) and a sort
 * limited to the fields the listing declares, answered as {content, page}.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PaginationTests {

	@Autowired
	MockMvc mvc;

	@Test
	void everyListingSharesTheSamePageContract() throws Exception {
		Session admin = login();
		// Test methods run in no fixed order: make sure every listing has a row.
		createTask(admin, "Pagination contract", "null", LocalDate.now().toString());
		for (String path : new String[] { "/api/iam/users", "/api/iam/roles", "/api/tasks" }) {
			this.mvc.perform(get(path).cookie(admin.cookie()).param("size", "1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.page.size").value(1))
				.andExpect(jsonPath("$.page.number").value(0))
				.andExpect(jsonPath("$.page.totalElements").value(greaterThanOrEqualTo(1)))
				.andExpect(jsonPath("$.page.totalPages").value(greaterThanOrEqualTo(1)));
			this.mvc.perform(get(path).cookie(admin.cookie()).param("size", "101")).andExpect(status().isBadRequest());
			this.mvc.perform(get(path).cookie(admin.cookie()).param("size", "0")).andExpect(status().isBadRequest());
			this.mvc.perform(get(path).cookie(admin.cookie()).param("page", "-1")).andExpect(status().isBadRequest());
		}
		// The audit trail pages by position (see AuditTrailTests), with the same size bounds.
		this.mvc.perform(get("/api/audit/events").cookie(admin.cookie()).param("size", "1"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content.length()").value(1))
			.andExpect(jsonPath("$.total").value(greaterThanOrEqualTo(1)))
			.andExpect(jsonPath("$.next").isNotEmpty());
		this.mvc.perform(get("/api/audit/events").cookie(admin.cookie()).param("size", "101"))
			.andExpect(status().isBadRequest());
	}

	@Test
	void sortingIsLimitedToTheFieldsAListingShows() throws Exception {
		Session admin = login();
		// A hidden column cannot be used to order rows (its values would leak through the order).
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie()).param("sort", "passwordHash"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.title").value("Parâmetros inválidos"));
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie()).param("sort", "email,sideways"))
			.andExpect(status().isBadRequest());
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie()).param("sort", "email,desc"))
			.andExpect(status().isOk());
	}

	@Test
	void usersFilterByTextStateAndSecondFactor() throws Exception {
		Session admin = login();
		invite(admin, "paula.pagination@example.com", "Paula Paginação");

		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie()).param("q", "PAULA"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[*].email").value(hasItem("paula.pagination@example.com")))
			.andExpect(jsonPath("$.content[*].email").value(not(hasItem("admin@example.com"))));
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie()).param("state", "INVITED"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[*].status").value(everyItem(org.hamcrest.Matchers.is("INVITED"))));
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie()).param("mfa", "true"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[*].mfaEnabled").value(everyItem(org.hamcrest.Matchers.is(true))));
		// Wildcards typed in the search box are plain characters.
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie()).param("q", "%"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.page.totalElements").value(0));
		this.mvc.perform(get("/api/iam/users").cookie(admin.cookie()).param("state", "SLEEPING"))
			.andExpect(status().isBadRequest());
	}

	@Test
	void rolesFilterBySystemFlag() throws Exception {
		Session admin = login();
		this.mvc.perform(get("/api/iam/roles").cookie(admin.cookie()).param("system", "true"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[*].system").value(everyItem(org.hamcrest.Matchers.is(true))))
			.andExpect(jsonPath("$.page.totalElements").value(1));
	}

	@Test
	void tasksFilterByStatusAssigneeAndDueDate() throws Exception {
		Session admin = login();
		String past = LocalDate.now().minusDays(3).toString();
		String future = LocalDate.now().plusDays(3).toString();
		createTask(admin, "Pagination overdue", "null", past);
		createTask(admin, "Pagination later", "null", future);

		this.mvc.perform(get("/api/tasks").cookie(admin.cookie()).param("q", "pagination")
			.param("status", "OPEN").param("unassigned", "true").param("dueBefore", LocalDate.now().toString()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[*].title").value(hasItem("Pagination overdue")))
			.andExpect(jsonPath("$.content[*].title").value(not(hasItem("Pagination later"))));
		this.mvc.perform(get("/api/tasks").cookie(admin.cookie()).param("q", "pagination").param("sort", "dueDate,desc"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content[0].title").value("Pagination later"));
		this.mvc.perform(get("/api/tasks").cookie(admin.cookie()).param("status", "LATE"))
			.andExpect(status().isBadRequest());
	}

	// helpers

	record Session(Cookie cookie, Cookie xsrf) {
	}

	private void invite(Session admin, String email, String name) throws Exception {
		this.mvc.perform(withCsrf(post("/api/iam/users"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"" + email + "\",\"name\":\"" + name + "\"}"))
			.andExpect(status().isCreated());
	}

	private void createTask(Session admin, String title, String assignee, String due) throws Exception {
		this.mvc.perform(withCsrf(post("/api/tasks"), admin).contentType(MediaType.APPLICATION_JSON)
			.content("{\"title\":\"" + title + "\",\"assigneeId\":" + assignee + ",\"dueDate\":\"" + due + "\"}"))
			.andExpect(status().isCreated());
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

	private static MockHttpServletRequestBuilder withCsrf(MockHttpServletRequestBuilder builder, Session session) {
		return builder.cookie(session.cookie(), session.xsrf()).header("X-XSRF-TOKEN", session.xsrf().getValue());
	}

}
