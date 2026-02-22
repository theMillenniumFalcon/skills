---
name: go-api-setup
description: Use this skill when the user wants to set up a production-grade Go REST API. Triggers when the user asks to scaffold a Go API, set up a Go HTTP server, configure Chi router, add hot reload with Air, set up sqlc with pgx, write a Makefile for Go, or Dockerize a Go app. Also use this when the user says things like "create a Go API", "set up my Go backend", "scaffold a Go project", or "how should I structure my Go API" — even if they don't mention Chi or sqlc specifically.
---

# Go API Setup (Chi + pgx + sqlc + Air + slog + Makefile + Docker)

A skill for scaffolding a production-grade Go REST API with Chi router, PostgreSQL via pgx and sqlc, Air for hot reload, slog for structured logging, a Makefile for common tasks, and a multi-stage Dockerfile.

---

## Before You Start

- **Go installed?** Run `go version` — requires Go 1.21+ for `slog` (stdlib). If older, flag it.
- **Air installed?** Run `air -v`. If missing, install it: `go install github.com/air-verse/air@latest`
- **sqlc installed?** Run `sqlc version`. If missing: `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`
- **PostgreSQL running?** pgx requires a live DB connection for migrations and codegen. Confirm credentials are ready.
- **Module path?** The module path will be derived from the current folder name — confirm with the user what their GitHub username is (e.g. `github.com/username/my-api`). Replace `username` accordingly throughout this skill.

---

## Step 1: Initialize the Module and Folder Structure

Check the current folder name and use it as the module path:

```bash
# e.g. if you're in /home/user/my-api, run:
go mod init github.com/username/$(basename "$PWD")
```

Create the folder structure:

```bash
mkdir -p cmd/api \
  internal/handler \
  internal/middleware \
  internal/db/query \
  internal/db/sqlc \
  internal/config \
  migrations
```

Final structure:

```
my-api/
├── cmd/
│   └── api/
│       └── main.go
├── internal/
│   ├── config/
│   │   └── config.go
│   ├── handler/
│   │   └── health.go
│   ├── middleware/
│   │   └── logger.go
│   └── db/
│       ├── query/       ← raw SQL queries for sqlc
│       └── sqlc/        ← sqlc-generated code (don't edit)
├── migrations/          ← SQL migration files
├── sqlc.yaml
├── .air.toml
├── .env
├── .env.example
├── Makefile
├── Dockerfile
└── .dockerignore
```

---

## Step 2: Install Dependencies

```bash
go get github.com/go-chi/chi/v5
go get github.com/go-chi/chi/v5/middleware
go get github.com/jackc/pgx/v5
go get github.com/jackc/pgx/v5/pgxpool
go get github.com/joho/godotenv
```

---

## Step 3: Configure Environment Variables

Create `.env`:

```env
APP_ENV="development"
PORT="8080"
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DBNAME?sslmode=disable"
```

Create `.env.example` with empty values:

```env
APP_ENV=
PORT=
DATABASE_URL=
```

Add `.env` to `.gitignore`.

---

## Step 4: Create internal/config/config.go

```go
package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv      string
	Port        string
	DatabaseURL string
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	return &Config{
		AppEnv:      getEnv("APP_ENV", "development"),
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: mustGetEnv("DATABASE_URL"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func mustGetEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("required environment variable %s is not set", key)
	}
	return val
}
```

---

## Step 5: Create cmd/api/main.go

```go
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/username/my-api/internal/config"
	"github.com/username/my-api/internal/handler"
	"github.com/username/my-api/internal/middleware"
)

func main() {
	// Logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	// Config
	cfg := config.Load()

	// Database
	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(context.Background()); err != nil {
		slog.Error("database ping failed", "error", err)
		os.Exit(1)
	}
	slog.Info("database connected")

	// Router
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.Logger(logger))
	r.Use(chimiddleware.Recoverer)

	// Routes
	r.Get("/health", handler.Health())

	// Start server
	addr := fmt.Sprintf(":%s", cfg.Port)
	slog.Info("starting server", "addr", addr, "env", cfg.AppEnv)

	if err := http.ListenAndServe(addr, r); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}
```

---

## Step 6: Create Middleware and Handler

Create `internal/middleware/logger.go`:

```go
package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

func Logger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			start := time.Now()

			defer func() {
				logger.Info("request",
					"method", r.Method,
					"path", r.URL.Path,
					"status", ww.Status(),
					"duration", time.Since(start),
					"request_id", middleware.GetReqID(r.Context()),
				)
			}()

			next.ServeHTTP(ww, r)
		})
	}
}
```

Create `internal/handler/health.go`:

```go
package handler

import (
	"encoding/json"
	"net/http"
)

func Health() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}
```

---

## Step 7: Configure sqlc

Create `sqlc.yaml` at the root:

```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "internal/db/query"
    schema: "migrations"
    gen:
      go:
        package: "db"
        out: "internal/db/sqlc"
        emit_json_tags: true
        emit_interface: true
        emit_empty_slices: true
```

Write SQL queries in `internal/db/query/` and run:

```bash
make db/generate
```

> sqlc reads your migration files in `migrations/` for schema and your query files in `internal/db/query/` for queries. Generated code goes to `internal/db/sqlc/` — never edit those files manually.

---

## Step 8: Configure Air (Hot Reload)

Create `.air.toml` at the root:

```toml
root = "."
tmp_dir = "tmp"

[build]
  cmd = "go build -o ./tmp/main ./cmd/api"
  bin = "./tmp/main"
  delay = 1000
  exclude_dir = ["tmp", "vendor", "internal/db/sqlc"]
  include_ext = ["go", "env"]
  kill_delay = "0s"
  rerun = false
  rerun_delay = 500

[log]
  time = false

[color]
  main = "magenta"
  watcher = "cyan"
  build = "yellow"
  runner = "green"

[misc]
  clean_on_exit = true
```

---

## Step 9: Create Makefile

Create `Makefile` at the root:

```makefile
.PHONY: dev build run lint test db/generate db/migrate docker/build docker/run

# ── Dev ──────────────────────────────────────────────────────────
dev:
	air

build:
	go build -o bin/api ./cmd/api

run:
	go run ./cmd/api

# ── Code Quality ─────────────────────────────────────────────────
lint:
	golangci-lint run ./...

test:
	go test ./... -v -race -cover

# ── Database ─────────────────────────────────────────────────────
db/generate:
	sqlc generate

db/migrate:
	@echo "Run your migrations here (goose, migrate, etc.)"

# ── Docker ───────────────────────────────────────────────────────
docker/build:
	docker build -t my-api .

docker/run:
	docker run --env-file .env -p 8080:8080 my-api
```

---

## Step 10: Create Multi-Stage Dockerfile

Create `Dockerfile` at the root:

```dockerfile
# ── Build Stage ───────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Build binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/api ./cmd/api

# ── Final Stage ───────────────────────────────────────────────────
FROM alpine:3.20

WORKDIR /app

# ca-certificates for HTTPS, tzdata for timezones
RUN apk --no-cache add ca-certificates tzdata

COPY --from=builder /app/bin/api .

EXPOSE 8080

ENTRYPOINT ["./api"]
```

Create `.dockerignore`:

```
tmp/
bin/
.env
.env.local
.git
.gitignore
*.md
```

---

## Final Verification Checklist

- [ ] `go run ./cmd/api` starts without errors
- [ ] `curl http://localhost:8080/health` returns `{"status":"ok"}`
- [ ] `make dev` starts Air and reloads on file changes
- [ ] `make build` produces a binary in `bin/`
- [ ] `make db/generate` runs sqlc without errors
- [ ] `make docker/build` builds the image successfully
- [ ] `make docker/run` starts the container and health check passes
- [ ] Logs output as JSON in production (`APP_ENV=production`)

---

## Common Errors

**`air: command not found`**
Air isn't installed or `$GOPATH/bin` isn't in your `PATH`. Run `go install github.com/air-verse/air@latest` and add `export PATH=$PATH:$(go env GOPATH)/bin` to your shell profile.

**`sqlc: command not found`**
Same as above — `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest` and ensure `$GOPATH/bin` is in `PATH`.

**`pgxpool: failed to connect`**
Database isn't running or `DATABASE_URL` is malformed. Check the connection string format: `postgresql://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=disable`.

**`undefined: slog`**
Go version is older than 1.21. `slog` was added to the stdlib in 1.21 — run `go install golang.org/dl/go1.23.0@latest` to upgrade.

**`chi/middleware` import conflict**
You imported `chi/v5/middleware` and named it `middleware` — but so did your own `internal/middleware` package. Alias one of them: `chimiddleware "github.com/go-chi/chi/v5/middleware"` (already done in `main.go` above).

**Docker build fails with `go.sum` mismatch**
Run `go mod tidy` locally before building — the `go.sum` file must be up to date before copying into the Docker build context.