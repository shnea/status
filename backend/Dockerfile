ARG JAVA_IMAGE=eclipse-temurin:17-jdk
FROM ${JAVA_IMAGE} AS build
WORKDIR /source
COPY gradle ./gradle
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY src ./src
RUN --mount=type=cache,target=/root/.gradle sh ./gradlew --no-daemon bootJar

FROM ${JAVA_IMAGE}
WORKDIR /app
COPY --from=build /source/build/libs/status-0.0.1-SNAPSHOT.jar ./app.jar
USER 10001:10001
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
