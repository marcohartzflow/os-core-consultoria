# syntax=docker/dockerfile:1
# Build context: apps/api. Produces a layered, non-root image of the API.

FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
# Warm the dependency cache in its own layer so source changes do not re-download everything.
RUN --mount=type=cache,target=/root/.gradle ./gradlew --no-daemon -q dependencies > /dev/null
COPY src src
RUN --mount=type=cache,target=/root/.gradle ./gradlew --no-daemon -x test bootJar \
    && cp build/libs/*-SNAPSHOT.jar app.jar \
    && java -Djarmode=tools -jar app.jar extract --layers --destination extracted

FROM eclipse-temurin:25-jre
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
