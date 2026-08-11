FROM golang:1.26-alpine AS build
WORKDIR /src
COPY . .
RUN go test ./... && CGO_ENABLED=0 go build -trimpath -o /ranker .
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /ranker /ranker
ENV LISTEN_ADDR=0.0.0.0:8090
EXPOSE 8090
ENTRYPOINT ["/ranker"]
