FROM node:22-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
FROM golang:1.26-bookworm AS ranker
WORKDIR /src
COPY ranker/ ./
RUN go test ./... && CGO_ENABLED=0 go build -o /ranker .
FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /src
COPY api/pom.xml ./
COPY api/src ./src
RUN mvn -B package
FROM eclipse-temurin:21-jre
COPY --from=backend /src/target/catalog-api-1.0.0.jar /app/api/catalog.jar
COPY --from=ranker /ranker /app/ranker
COPY api/catalog.json /app/api/catalog.json
RUN apt-get update && apt-get install -y --no-install-recommends nginx python3 ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --create-home --uid 10001 demo
WORKDIR /app
COPY --from=frontend /src/frontend/dist/studio/browser /app/public
COPY deploy /app/deploy
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python3", "/app/deploy/start.py"]
