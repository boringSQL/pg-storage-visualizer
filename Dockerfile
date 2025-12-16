FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o pg-storage-visualizer ./cmd/pg-storage-visualizer

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/pg-storage-visualizer .
EXPOSE 8080
ENV DATABASE_URL=postgres://postgres:postgres@db:5432/demo?sslmode=disable
ENTRYPOINT ["./pg-storage-visualizer"]
