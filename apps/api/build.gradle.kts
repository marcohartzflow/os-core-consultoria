plugins {
	java
	id("org.springframework.boot") version "4.1.1"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "com.maximusflow"
version = "0.0.1-SNAPSHOT"
description = "Maximus Flow OS core API"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(25)
	}
}

repositories {
	mavenCentral()
}

extra["springAiVersion"] = "2.0.1"
extra["springModulithVersion"] = "2.1.1"
extra["springdocVersion"] = "3.1.1"
extra["bouncyCastleVersion"] = "1.86"
// Patch releases above the ones Spring Boot 4.1.1 manages, for vulnerabilities with a fix that the
// image scan (Grype, CI) reports: Tomcat 11.0.24 (critical), Jackson 3.1.5 and 2.21.5 (high). Same
// release lines, so nothing else changes; drop each line once Spring Boot manages that version or a
// newer one ("Customizing managed versions" in the Spring Boot Gradle plugin documentation).
extra["tomcat.version"] = "11.0.26"
extra["jackson-bom.version"] = "3.1.7"
extra["jackson-2-bom.version"] = "2.21.7"
extra["webauthn4jVersion"] = "0.31.9.RELEASE"

val mockitoAgent by configurations.creating

dependencies {
	implementation("org.springframework.boot:spring-boot-starter-actuator")
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.springframework.boot:spring-boot-starter-flyway")
	implementation("org.springframework.boot:spring-boot-starter-security")
	// Passkeys (WebAuthn) as a second factor: Spring Security's relying party, built on WebAuthn4J.
	implementation("org.springframework.security:spring-security-webauthn")
	implementation("org.springframework.boot:spring-boot-starter-session-jdbc")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.springframework.boot:spring-boot-starter-mail")
	implementation("org.springframework.boot:spring-boot-starter-webmvc")
	implementation("org.flywaydb:flyway-database-postgresql")
	implementation("org.springframework.ai:spring-ai-starter-model-anthropic")
	implementation("org.springframework.ai:spring-ai-starter-model-chat-memory-repository-jdbc")
	implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:${property("springdocVersion")}")
	// Required by Argon2PasswordEncoder (Spring Security does not ship the Argon2 implementation).
	implementation("org.bouncycastle:bcprov-jdk18on:${property("bouncyCastleVersion")}")
	implementation("org.springframework.modulith:spring-modulith-observability-api")
	implementation("org.springframework.modulith:spring-modulith-starter-core")
	implementation("org.springframework.modulith:spring-modulith-starter-jdbc")
	developmentOnly("org.springframework.boot:spring-boot-docker-compose")
	runtimeOnly("org.postgresql:postgresql")
	developmentOnly("org.springframework.ai:spring-ai-spring-boot-docker-compose")
	runtimeOnly("org.springframework.modulith:spring-modulith-actuator")
	runtimeOnly("org.springframework.modulith:spring-modulith-observability-core")
	runtimeOnly("org.springframework.modulith:spring-modulith-runtime")
	annotationProcessor("org.springframework.boot:spring-boot-configuration-processor")
	testImplementation("org.springframework.boot:spring-boot-starter-actuator-test")
	testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
	testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
	testImplementation("org.springframework.boot:spring-boot-starter-security-test")
	testImplementation("org.springframework.boot:spring-boot-starter-session-jdbc-test")
	testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
	testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
	testImplementation("org.springframework.boot:spring-boot-testcontainers")
	testImplementation("org.springframework.ai:spring-ai-spring-boot-testcontainers")
	testImplementation("org.springframework.modulith:spring-modulith-starter-test")
	testImplementation("org.testcontainers:testcontainers-junit-jupiter")
	// Authenticator emulator from the WebAuthn4J project (the library behind Spring Security's passkeys),
	// at the version spring-security-webauthn resolves.
	testImplementation("com.webauthn4j:webauthn4j-test:${property("webauthn4jVersion")}")
	testImplementation("org.testcontainers:testcontainers-postgresql")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
	// Mockito's inline mock maker must be loaded as a Java agent; dynamic attach is deprecated by the JDK.
	mockitoAgent("org.mockito:mockito-core") { isTransitive = false }
}

dependencyManagement {
	imports {
		mavenBom("org.springframework.modulith:spring-modulith-bom:${property("springModulithVersion")}")
		mavenBom("org.springframework.ai:spring-ai-bom:${property("springAiVersion")}")
	}
}

tasks.withType<Test> {
	useJUnitPlatform()
	// DatabaseRolesTests runs the deploy's role script: a change to it alone must re-run the tests.
	inputs.file("../../deploy/postgres-roles.sh")
	doFirst {
		jvmArgs("-javaagent:${mockitoAgent.asPath}")
	}
	// Testcontainers mounts the Docker socket of the Docker *host* into Ryuk. With Colima the client
	// socket lives under ~/.colima, which does not exist inside the VM; /var/run/docker.sock does,
	// and it is also the right path for Docker Desktop and Linux. Testcontainers 2 reads this only
	// from the environment, so it is set here for the IDE, the CLI and CI alike.
	if (System.getenv("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE") == null) {
		environment("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")
	}
}
