# Remote Server Runbook (Thin-Client Team Setup)

This is the day-to-day runbook for teams whose laptops don't have the
storage/resources to run Docker, PostgreSQL, Redis, or MinIO locally.
Code is written and pushed from laptops; everything actually *runs* on
one always-on shared server.

This is a leaner variant of the "remote storage" topology described in
[DEPLOYMENT.md](DEPLOYMENT.md#storage-topologies) — instead of a
`compose.remote-storage.yaml` overlay, it points the base `compose.yaml`
services directly at an already-running, natively-installed storage
stack via `.env`, and only ever builds/starts `api`, `worker`, and `web`.

## Architecture

- **Laptops** — VS Code (or VS Code Remote-SSH) only. No Docker, no
  databases, no local builds. Just editing and `git push`.
- **Shared remote server** — a single always-on machine that:
  - Runs PostgreSQL/PostGIS, Redis, and MinIO **natively** (not in
    Docker) — see [infrastructure/storage-server/](../infrastructure/storage-server/).
  - Runs the application (`api`, `worker`, `web`) in Docker containers,
    built from whatever is currently on `main`.
- **GitHub** — the single source of truth. The remote server never has
  code changes made directly on it; it only ever runs `git pull`.

```
Laptop A ─┐
          ├─ git push ──▶ GitHub (main) ──▶ git pull ──▶ Remote server
Laptop B ─┘                                              ├─ postgres (native, :5544)
                                                           ├─ redis    (native, :6390)
                                                           ├─ minio    (native, :9010)
                                                           └─ docker compose: api, worker, web
```

## One-time setup on the remote server

### 1. Clone the repo

```bash
git clone https://github.com/NakshaTechSoftware/Naksha_GeoSphere.git
cd Naksha_GeoSphere
```

### 2. Create `.env`

```bash
cp .env.example .env
```

Edit `.env` and set these keys to point at the storage services already
running on this same box, instead of the Docker-service-name defaults
(`postgres`, `redis`, `minio`) that `.env.example` assumes. Use the
server's own **LAN IP**, not `localhost`/`127.0.0.1` — the `api` and
`worker` containers get their own network namespace, so `localhost`
inside a container refers to the container itself, not the host. The
LAN IP works both from the host and from containers on it.

```ini
# --- PostgreSQL (native on this box, not a container) ---
DATABASE_URL=postgresql+asyncpg://<db_user>:<db_password>@<server-ip>:5544/naksha_geosphere
POSTGRES_HOST=<server-ip>
POSTGRES_PORT=5544
POSTGRES_DB=naksha_geosphere
POSTGRES_USER=<db_user>
POSTGRES_PASSWORD=<db_password>

# --- Redis (native on this box) ---
REDIS_URL=redis://:<redis_password>@<server-ip>:6390/0
CELERY_BROKER_URL=redis://:<redis_password>@<server-ip>:6390/0
CELERY_RESULT_BACKEND=redis://:<redis_password>@<server-ip>:6390/1

# --- MinIO/S3 (native on this box) ---
MINIO_ENDPOINT=<server-ip>:9010
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=<s3_access_key>
MINIO_SECRET_KEY=<s3_secret_key>
S3_FORCE_PATH_STYLE=true

# --- Public URLs — use the server's LAN IP, not localhost ---
API_URL=http://api:8000
PUBLIC_API_URL=http://<server-ip>:8000
NEXT_PUBLIC_API_URL=http://<server-ip>:8000
FRONTEND_URL=http://<server-ip>:3000
CORS_ORIGINS=http://<server-ip>:3000
TRUSTED_HOSTS=localhost,127.0.0.1,api,<server-ip>
```

Real values for `<db_user>`, `<db_password>`, `<redis_password>`,
`<s3_access_key>`, `<s3_secret_key>`, and `<server-ip>` live in the
storage server's own `infrastructure/storage-server/.env.storage` (or
wherever that deployment keeps its secrets) — never copy them into this
doc or commit them anywhere. See [SECURITY.md](SECURITY.md).

**Why `NEXT_PUBLIC_API_URL` matters more here than usual:** it's a
Next.js *build-time* variable, baked into the client JS bundle when the
`web` image is built. If it's ever `localhost`, every teammate's browser
tries to reach their own laptop instead of the server. Get it right
*before* building — changing it later requires a rebuild, not a
restart.

### 3. Bring up only the application containers

Do **not** run a bare `docker compose up -d`. The default service list
in `compose.yaml` includes `postgres`, `redis`, `minio`, and
`minio-init` — running those would create new, empty containers that
collide on the same ports as the already-running native services. Name
the services explicitly every time:

```bash
docker compose up -d --build api worker web
```

### 4. Apply database migrations

```bash
docker compose exec api alembic upgrade head
```

## Daily workflow

**On a laptop:**

1. Write code, commit, push to `main` (or open a PR and merge it).

**On the remote server** (SSH or VS Code Remote-SSH), whenever someone
wants to see the latest code running:

```bash
cd Naksha_GeoSphere
git pull origin main
docker compose up -d --build api worker web
```

`--build` picks up code and dependency changes; `up -d` only recreates
containers whose image or config actually changed, so it's safe to run
this every time without worrying about unnecessary restarts.

**From any laptop on the same network**, open a browser to:

- Frontend: `http://<server-ip>:3000`
- Backend API docs: `http://<server-ip>:8000/docs`
- Backend health: `http://<server-ip>:8000/api/v1/health/ready`

## Verifying a deploy

```bash
docker compose ps
curl http://localhost:8000/api/v1/health/ready
```

Expect `{"status":"healthy", ...}` with `database`, `redis`, and
`object_storage` all reporting `"healthy"`. If any of those fail, it's
almost always a stale/incorrect value in `.env`, not the application
code — recheck host/port/credentials against the storage server's own
config before debugging further.

## Troubleshooting

- **`address already in use` on 5432/6379/9000 when starting the
  stack** — you (or a script) ran a bare `docker compose up -d` and it
  tried to start the local `postgres`/`redis`/`minio` services. Tear
  those specific containers down and re-run with the explicit
  `api worker web` service list from Step 3.
- **Frontend loads but every API call fails from teammates' browsers,
  though `curl` from the server works** — `NEXT_PUBLIC_API_URL` was
  still `localhost` at build time. Fix it in `.env` and rebuild
  (`docker compose up -d --build web`).
- **A teammate off the LAN (different network/remote work) can't reach
  the server** — a private LAN IP like `192.168.x.x` isn't reachable
  from outside that network. They'll need a VPN into the LAN (e.g.
  WireGuard/Tailscale) or the server needs a real public
  IP/domain with the relevant ports exposed and secured.
- **`alembic upgrade head` fails with a connection error** — the `api`
  container can't reach Postgres. Confirm `DATABASE_URL` in `.env` uses
  the server's LAN IP, not `127.0.0.1`/`localhost` (see the network
  namespace note above), and that the native Postgres service is
  actually running (`systemctl status postgresql` or equivalent).

## See also

- [DEPLOYMENT.md](DEPLOYMENT.md) — the general production-deployment
  reference this runbook specializes for a single shared LAN server.
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) — full reference
  for every `.env` key.
- [SECURITY.md](SECURITY.md) — secrets handling.
- [infrastructure/storage-server/](../infrastructure/storage-server/) —
  how the native Postgres/Redis/MinIO stack on the remote server itself
  is set up and configured.
