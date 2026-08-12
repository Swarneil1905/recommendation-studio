FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src src
RUN mvn -B package
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 app
COPY --from=build /src/target/catalog-api-1.0.0.jar app.jar
COPY catalog.json .
ENV BIND_ADDRESS=0.0.0.0 PORT=8002 RANKER_URL=http://ranker:8090
USER 10001
EXPOSE 8002
CMD ["java","-XX:MaxRAMPercentage=65","-jar","app.jar"]
