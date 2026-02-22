---
name: docker-debugging
description: Use this skill when the user wants to debug Docker or Docker Compose issues. Triggers when the user has a container that won't start, a build that's failing, networking problems between containers, volume or data issues, or performance problems. Also use this when the user says things like "my container keeps restarting", "containers can't talk to each other", "my volume isn't working", "docker build is failing", "my container is slow", or "docker compose isn't working" — even if they don't know what the root cause is.
---

# Docker Debugging Cheatsheet (Docker + Docker Compose)

A cheatsheet of commands and patterns for diagnosing and fixing Docker and Docker Compose issues.

---

## 1. Containers Not Starting

### Check Container Status

```bash
# See all containers including stopped ones
docker ps -a

# See exit code and last state
docker inspect <container> --format='{{.State.Status}} | exit: {{.State.ExitCode}} | error: {{.State.Error}}'
```

Common exit codes:
- `0` — exited cleanly (check if it should be running)
- `1` — application error — check logs
- `125` — Docker daemon error
- `126` — permission error — command found but not executable
- `127` — command not found — wrong entrypoint or binary missing
- `137` — killed by OOM (out of memory) or `docker kill`
- `139` — segfault
- `143` — SIGTERM — graceful shutdown requested

---

### Read Logs

```bash
# Last 100 lines
docker logs <container> --tail 100

# Follow live
docker logs <container> -f

# With timestamps
docker logs <container> --timestamps

# Logs since a time
docker logs <container> --since 30m

# Search both stdout and stderr for errors
docker logs <container> 2>&1 | grep -i error

# Stderr only (suppress stdout)
docker logs <container> 2>&1 1>/dev/null | grep -i error
```

---

### Watch Real-Time Daemon Events

When a container is crash-looping and logs aren't enough, `docker events` shows daemon-level events as they happen:

```bash
# Watch all events live
docker events

# Filter to a specific container
docker events --filter container=<container>

# Filter by event type
docker events --filter event=die
docker events --filter event=oom

# Events from the last 10 minutes
docker events --since 10m

# Useful combo — watch for crashes
docker events --filter event=die --filter event=oom --filter event=kill
```

Common events to watch for:
- `die` — container exited (check exit code)
- `oom` — container was OOM killed
- `kill` — container received a kill signal
- `restart` — container was restarted by restart policy

---

### Inspect Container Config

```bash
# Full config dump
docker inspect <container>

# Just env vars
docker inspect <container> --format='{{range .Config.Env}}{{println .}}{{end}}'

# Just mounts
docker inspect <container> --format='{{json .Mounts}}' | jq

# Just network settings
docker inspect <container> --format='{{json .NetworkSettings}}' | jq
```

---

### Run Interactively to Debug Startup

```bash
# Override entrypoint to get a shell instead of running the app
docker run -it --entrypoint /bin/sh <image>

# Or bash if available
docker run -it --entrypoint /bin/bash <image>

# Run with same env as production
docker run -it --env-file .env --entrypoint /bin/sh <image>
```

---

### Exec Into a Running Container

```bash
docker exec -it <container> /bin/sh

# Or bash
docker exec -it <container> /bin/bash

# Run a single command
docker exec <container> env
docker exec <container> cat /etc/hosts
docker exec <container> ls -la /app
```

> If the container keeps crashing before you can exec in, use `--entrypoint /bin/sh` at `docker run` time to bypass the startup command.

---

### Debug Restart Loops

If a container keeps restarting, first check its restart policy and stop the loop:

```bash
# Check current restart policy
docker inspect <container> --format='{{.HostConfig.RestartPolicy.Name}}'

# Check how many times it has restarted
docker inspect <container> --format='Restarts: {{.RestartCount}}'

# Stop the restart loop without removing the container
docker update --restart=no <container>
docker stop <container>

# Now read logs from the stopped container
docker logs <container> --tail 100
```

Restart policy values:
- `no` — never restart (default)
- `always` — always restart, even on manual stop
- `unless-stopped` — restart unless manually stopped
- `on-failure` — only restart on non-zero exit code

> If the policy is `always` or `unless-stopped`, `docker stop` will immediately restart the container. Use `docker update --restart=no` first to break the loop, then stop it.

---

## 2. Build Failures

### Build With Full Output — No Cache

```bash
# Disable cache — forces every layer to rebuild
docker build --no-cache -t my-image .

# Show full build output (no truncation)
docker build --progress=plain -t my-image .

# Both
docker build --no-cache --progress=plain -t my-image .
```

---

### Inspect a Failed Build Layer

When a build fails mid-way, the layers up to the failure are cached. Run an interactive container from the last successful layer to debug:

```bash
# Build fails at step N — find the image ID of step N-1 in the output
docker run -it <image-id-of-last-successful-layer> /bin/sh

# Then manually run the failing command inside to see the real error
```

---

### Check Build Context Size

A large build context slows builds and can cause unexpected failures. Check what's being sent:

```bash
# See build context size
du -sh .

# See what's NOT ignored (everything being sent to daemon)
docker build --no-cache . 2>&1 | head -5
```

Fix by adding to `.dockerignore`:

```
node_modules
.next
dist
.git
*.log
.env
```

---

### Diagnose Multi-Stage Build Issues

```bash
# Build only up to a specific stage
docker build --target builder -t debug-build .

# Then inspect that stage
docker run -it debug-build /bin/sh
```

---

### Inspect Image Size and Layers

Large images slow pulls, startup, and CI pipelines. Diagnose which layers are bloating the image:

```bash
# See image sizes
docker image ls

# See layer-by-layer breakdown of an image
docker history <image>

# Human-readable layer sizes
docker history <image> --format "{{.Size}}	{{.CreatedBy}}" | sort -rh | head -20
```

Common culprits:
- Installing build tools (`gcc`, `make`) in a final stage instead of a builder stage
- Leaving package manager caches (`apt`, `apk`, `npm`) in the image
- Copying entire project directory instead of just the built artifact
- Not using `.dockerignore`

Fix — clean up in the same RUN layer:

```dockerfile
# ✗ Cache left in image
RUN apt-get update && apt-get install -y curl

# ✓ Cache cleaned in same layer
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
```

---

## 3. Networking Issues

### List Networks and Inspect

```bash
# List all networks
docker network ls

# Inspect a network — see connected containers and IPs
docker network inspect <network-name>

# See which network a container is on
docker inspect <container> --format='{{json .NetworkSettings.Networks}}' | jq
```

---

### Test Connectivity Between Containers

```bash
# Ping another container by name (only works on same user-defined network)
docker exec <container-a> ping <container-b>

# Check DNS resolution
docker exec <container-a> nslookup <container-b>

# Test a port
docker exec <container-a> nc -zv <container-b> 5432

# curl a service
docker exec <container-a> curl -v http://<container-b>:3000/health
```

> Containers on the default `bridge` network can't resolve each other by name — only by IP. Use a **user-defined bridge network** for DNS-based resolution. Docker Compose creates one automatically.

---

### Check Port Bindings

```bash
# See what ports are exposed/bound
docker port <container>

# Check if host port is in use
lsof -i :<port>
ss -tulnp | grep <port>
```

---

### Diagnose "Connection Refused" vs "Host Unreachable"

- `Connection refused` → container is reachable but nothing is listening on that port. Check the app started correctly and is bound to `0.0.0.0`, not `127.0.0.1`.
- `No route to host` / `Host unreachable` → containers are on different networks or network is misconfigured.
- `Name does not resolve` → DNS not working. Containers are probably on the default bridge network — move to a user-defined network.

---

### Fix "App Binds to localhost Inside Container"

A common issue: app listens on `127.0.0.1:3000` inside the container, making it unreachable from outside.

```bash
# Verify what the app is bound to
docker exec <container> ss -tulnp
docker exec <container> netstat -tulnp
```

Fix: configure the app to bind to `0.0.0.0`:

```bash
# Node.js
HOST=0.0.0.0 node server.js

# Go / other — pass via env
APP_HOST=0.0.0.0
```

---

## 4. Volume & Data Issues

### List and Inspect Volumes

```bash
# List all volumes
docker volume ls

# Inspect a volume — find its mount point on the host
docker volume inspect <volume-name>

# See what's inside a volume
docker run --rm -v <volume-name>:/data alpine ls -la /data
```

---

### Check Mount Points Inside Container

```bash
# See all mounts
docker inspect <container> --format='{{json .Mounts}}' | jq

# Check from inside
docker exec <container> df -h
docker exec <container> ls -la /app/data
```

---

### Copy Files To/From Container

```bash
# Copy from container to host
docker cp <container>:/app/logs ./logs

# Copy from host to container
docker cp ./config.json <container>:/app/config.json
```

---

### Debug Volume Permission Issues

```bash
# Check file ownership inside container
docker exec <container> ls -la /data

# Run as root to inspect
docker exec -u root <container> ls -la /data

# Fix ownership (run as root)
docker exec -u root <container> chown -R node:node /data
```

Common cause: host files owned by a different UID than the container user. Fix in Dockerfile:

```dockerfile
RUN mkdir -p /data && chown -R node:node /data
USER node
```

---

### Dangling Volumes — Clean Up

```bash
# List dangling volumes (not attached to any container)
docker volume ls -f dangling=true

# Remove all dangling volumes
docker volume prune

# Nuclear option — removes ALL unused images, containers, networks, and volumes
# across ALL projects on this machine — not just the current one
docker system prune --volumes
```

---

## 5. Performance Issues

### Resource Usage — Live Stats

```bash
# Live CPU, memory, network, disk for all containers
docker stats

# Specific container
docker stats <container>

# One-shot snapshot (no stream)
docker stats --no-stream
```

---

### Container Using Too Much Memory

```bash
# Check memory limit and usage
docker inspect <container> --format='{{.HostConfig.Memory}} bytes limit'
docker stats <container> --no-stream --format "{{.MemUsage}}"

# Check for OOM kills (exit code 137)
docker inspect <container> --format='{{.State.OOMKilled}}'
```

Fix — set a memory limit:

```bash
docker run -m 512m my-image
```

In Docker Compose — use `mem_limit` for regular `docker compose up`:

```yaml
services:
  app:
    mem_limit: 512m       # works with plain docker compose up
```

> The `deploy.resources.limits` syntax only applies in Docker Swarm mode — it's silently ignored by plain `docker compose up` unless you pass `--compatibility`.

---

### Slow Builds — Layer Cache Analysis

```bash
# Build with timing info
docker build --progress=plain . 2>&1 | grep -E "^#[0-9]+ \[|DONE|CACHED"
```

Tips:
- Copy dependency files (`package.json`, `go.mod`) before source files — changes to source won't invalidate the dependency install layer
- Put rarely-changed layers at the top of the Dockerfile
- Use `--mount=type=cache` for package manager caches in BuildKit

```dockerfile
# ✓ Cache-friendly ordering
COPY package.json bun.lockb ./
RUN bun install                  # cached unless package.json changes

COPY . .                         # source changes don't bust install cache
RUN bun run build
```

---

### Slow Container Startup

```bash
# Time how long startup takes
time docker run --rm my-image echo "started"

# Check what's happening during startup
docker run my-image 2>&1 | head -20
```

Common causes: waiting for DB to be ready, slow DNS resolution, large image with slow decompress. Use `wait-for-it.sh` or `depends_on: condition: service_healthy` in Compose.

---

## 6. Docker Compose Specific

### Validate Compose File

```bash
# Check for syntax errors
docker compose config

# Check with a specific file
docker compose -f docker-compose.prod.yml config
```

---

### Start, Stop, Rebuild

```bash
# Start and follow logs
docker compose up

# Start detached
docker compose up -d

# Rebuild images before starting
docker compose up --build

# Force recreate containers (picks up config changes)
docker compose up --force-recreate

# Stop and remove containers (keeps volumes)
docker compose down

# Stop and remove containers + volumes
docker compose down -v
```

---

### Logs in Compose

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app

# Last 50 lines per service
docker compose logs --tail 50
```

---

### Exec Into a Compose Service

```bash
docker compose exec app /bin/sh
docker compose exec db psql -U postgres
```

---

### Service Won't Start — Dependency Order

`depends_on` only waits for a container to start, not for the service inside it to be ready. Use health checks:

```yaml
services:
  db:
    image: postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: .
    depends_on:
      db:
        condition: service_healthy   # waits for healthcheck to pass
```

---

### Env Vars Not Being Picked Up

```bash
# See what env vars Compose resolves to
docker compose config | grep -A5 environment

# Check which .env file is loaded
docker compose --env-file .env.local up
```

> Docker Compose automatically loads `.env` from the same directory as `docker-compose.yml`. For other files, pass `--env-file` explicitly.

---

### Networking in Compose — Service DNS

In Docker Compose, services can reach each other by **service name** as the hostname:

```yaml
services:
  app:
    environment:
      DATABASE_URL: postgres://postgres:password@db:5432/mydb  # 'db' is the service name
  db:
    image: postgres
```

```bash
# Verify DNS works
docker compose exec app nslookup db
docker compose exec app ping db
```

---

## Quick Reference — Debugging Checklist

| Problem | First Command to Run |
|---------|---------------------|
| Container won't start | `docker logs <container> --tail 50` |
| Unexpected exit | `docker inspect <container> --format='{{.State.ExitCode}}'` |
| Can't exec in (crashes too fast) | `docker run -it --entrypoint /bin/sh <image>` |
| Build failing | `docker build --no-cache --progress=plain .` |
| Containers can't talk | `docker exec <a> ping <b>` + `docker network inspect` |
| Port not accessible | `docker port <container>` + `docker exec <c> ss -tulnp` |
| Volume data missing | `docker run --rm -v <vol>:/data alpine ls /data` |
| High memory usage | `docker stats --no-stream` + check `OOMKilled` |
| Slow builds | Check layer order — deps before source |
| Compose service not ready | Add `healthcheck` + `depends_on: condition: service_healthy` |
| Env vars not loading | `docker compose config \| grep environment` |