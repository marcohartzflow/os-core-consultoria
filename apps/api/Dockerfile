# syntax=docker/dockerfile:1
# Build context: apps/api. Produces a layered, non-root image of the API.

FROM eclipse-temurin:25-jdk@sha256:8c0a84ea11c8f6ed52600fc19f1040121f2a162998e9f50a5faebbbad9172dcc AS build
WORKDIR /workspace
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
# Warm the dependency cache in its own layer so source changes do not re-download everything.
RUN --mount=type=cache,target=/root/.gradle ./gradlew --no-daemon -q dependencies > /dev/null
COPY src src
RUN --mount=type=cache,target=/root/.gradle ./gradlew --no-daemon -x test bootJar \
    && cp "$(ls build/libs/*.jar | grep -v -- '-plain.jar')" app.jar \
    && java -Djarmode=tools -jar app.jar extract --layers --destination extracted

FROM eclipse-temurin:25-jre@sha256:fcd7fd7b387f94bb2ac461478a7436ad8e349924c374ea8313919624dceae636
RUN useradd --system --uid 1001 --create-home --shell /usr/sbin/nologin os
WORKDIR /app
COPY --from=build --chown=os:os /workspace/extracted/dependencies/ ./
COPY --from=build --chown=os:os /workspace/extracted/spring-boot-loader/ ./
COPY --from=build --chown=os:os /workspace/extracted/snapshot-dependencies/ ./
COPY --from=build --chown=os:os /workspace/extracted/application/ ./
USER os
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
