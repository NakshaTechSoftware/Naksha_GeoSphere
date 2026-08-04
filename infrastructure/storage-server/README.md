# Naksha GeoSphere - Storage Server

This directory is a **self-contained deployment package**. It runs on a
**separate Windows machine** on the LAN (`192.168.10.81` in this setup)
that already hosts other, unrelated Docker projects. It provides only:

1. PostgreSQL with PostGIS
2. Redis
3. S3-compatible object storage (MinIO)
4. A one-shot bucket-initialization job

It runs **nothing else** - no frontend, no API, no worker, no Mailpit,
no reverse proxy, no customer-facing service of any kind.

## Isolation Guarantees

- Fixed Compose project name: **`naksha-geosphere-storage`**, passed
  explicitly on every command (`-p naksha-geosphere-storage`) and also
  set via `name:` in `compose.storage.yaml` - never inferred from the
  directory name.
- Dedicated Docker network (`naksha-geosphere-storage-network`) - never
  attaches to any existing network.
- **No named Docker volumes** - every data directory is a bind mount to
  an explicit path under `E:\Naksha_GeoSphere_Storage`, so it can never
  be touched by `docker volume prune` (or any volume command) run
  against another project.
- Every host port this project publishes is bound to the specific LAN IP
  `192.168.10.81` only (never `0.0.0.0`), on ports confirmed not to
  collide with this machine's existing occupied ports
  (`5434, 6380, 9004, 9005, 4594, 8088, 3100, 8100`):
  - PostgreSQL: `192.168.10.81:5544`
  - Redis: `192.168.10.81:6390`
  - Object storage API: `192.168.10.81:9010`
  - Object storage console: `192.168.10.81:9011`
- The stop script (`stop-storage.ps1`) runs `docker compose ... down`
  **without** `-v` - it never deletes a volume, and it is scoped to this
  project only. Nothing in this directory ever runs
  `docker system prune`, `docker volume prune`, `docker network prune`,
  or `docker compose down -v`.
- This project never stops, restarts, deletes, modifies, prunes,
  renames, or reuses any container, network, image, or volume belonging
  to another project (including `nakshatech_asset_management_local_master`,
  `davangere-db-local`, or any other existing project on this machine).

## Prerequisites on the Storage-Server Machine

- Docker Desktop (with Compose v2) installed and running
- The `E:\` drive present with room for `E:\Naksha_GeoSphere_Storage`
- Confirm `192.168.10.81` is actually an IP assigned to this machine's
  network interface (`ipconfig`) before starting

## Deploying to the Storage-Server Machine

From the **main project computer**, copy this directory to the
storage-server machine's deployment path. Run these exact commands from
the repo root (adjust the destination if the storage server is reachable
via a mapped/shared path instead of directly, e.g. through a network
share - the example below assumes you can reach it as `\\192.168.10.81\E$`
or have already transferred the files by another means such as a USB
drive or `robocopy` over an existing share):

```powershell
# On the MAIN PROJECT COMPUTER, from the repo root:

# Ensure the destination directory structure exists on the storage server
# (run this against a mapped drive/share to the storage server, or
# adjust to however you access that machine):
New-Item -ItemType Directory -Force -Path "\\192.168.10.81\E$\Naksha_GeoSphere_Storage\deployment"

# Copy the storage-server package
Copy-Item -Recurse -Force `
  -Path ".\infrastructure\storage-server\*" `
  -Destination "\\192.168.10.81\E$\Naksha_GeoSphere_Storage\deployment"
```

If you do not have (or do not want) SMB/admin-share access between the
two machines, copy the `infrastructure\storage-server\` folder over by
any other means you normally use (USB drive, `git clone` of this repo
directly on the storage-server machine, `scp`, etc.) so that its
contents end up at `E:\Naksha_GeoSphere_Storage\deployment` **on the
storage-server machine itself**.

### On the storage-server machine

```powershell
Set-Location "E:\Naksha_GeoSphere_Storage\deployment"

# Create the persistent data directories (idempotent)
New-Item -ItemType Directory -Force -Path "E:\Naksha_GeoSphere_Storage\data\postgres"
New-Item -ItemType Directory -Force -Path "E:\Naksha_GeoSphere_Storage\data\redis"
New-Item -ItemType Directory -Force -Path "E:\Naksha_GeoSphere_Storage\data\object-storage"
New-Item -ItemType Directory -Force -Path "E:\Naksha_GeoSphere_Storage\backups"
New-Item -ItemType Directory -Force -Path "E:\Naksha_GeoSphere_Storage\logs"

# Create your real environment file (never commit this)
Copy-Item ".env.storage.example" ".env.storage"
notepad ".env.storage"   # fill in POSTGRES_PASSWORD, REDIS_PASSWORD, S3_ACCESS_KEY, S3_SECRET_KEY

# Start
.\scripts\start-storage.ps1

# Validate
.\scripts\check-storage.ps1
```

## Day-to-Day Commands

All commands below assume you are in
`E:\Naksha_GeoSphere_Storage\deployment` on the storage-server machine.

| Purpose | Command |
|---|---|
| Start | `.\scripts\start-storage.ps1` |
| Stop (data preserved) | `.\scripts\stop-storage.ps1` |
| Restart | `.\scripts\restart-storage.ps1` |
| Validate | `.\scripts\check-storage.ps1` |
| Backup PostgreSQL | `.\scripts\backup-postgres.ps1` |
| Restore PostgreSQL (destructive, confirms first) | `.\scripts\restore-postgres.ps1 -BackupFile <name>.dump` |
| Raw compose status | `docker compose -p naksha-geosphere-storage --env-file .env.storage -f compose.storage.yaml ps` |
| Raw compose logs | `docker compose -p naksha-geosphere-storage --env-file .env.storage -f compose.storage.yaml logs -f` |

Always include `-p naksha-geosphere-storage --env-file .env.storage`
when running `docker compose` by hand in this directory - never rely on
the current directory name to pick the project.

## PostgreSQL Access Model

- `POSTGRES_USER` (from `.env.storage`) is the application's own
  database user - **not** a PostgreSQL superuser. The first-boot init
  script (`init/database/01-init-extensions-and-restrict-user.sh`)
  enables `postgis`/`pgcrypto` while the role is still a superuser
  (required to create those extensions), then immediately strips
  `SUPERUSER`/`CREATEDB`/`CREATEROLE` from it. It keeps full DML/DDL
  rights inside its own database.
- Authentication uses SCRAM-SHA-256 (`POSTGRES_HOST_AUTH_METHOD` and
  `POSTGRES_INITDB_ARGS` are set explicitly in `compose.storage.yaml`).
- This init script only runs once, the first time
  `E:\Naksha_GeoSphere_Storage\data\postgres` is empty. If you ever need
  to add a new extension later, you'll need a temporarily
  superuser-capable session - this is intentional least-privilege
  behavior.

## Object Storage

Four private buckets are created idempotently by the `minio-init`
one-shot service (`init/object-storage/create-buckets.sh`), which exits
`0` once it has confirmed all four exist:

- `geosphere-source-data`
- `geosphere-preview-data`
- `geosphere-order-output`
- `geosphere-temporary-data`

None are ever made public (`mc anonymous set none` is applied to each).

## Connecting the Main Application

See `.env.remote-storage.example` at the repo root, and
`compose.remote-storage.yaml`. On the **main project computer**:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml -f compose.remote-storage.yaml up --build -d
```

This starts only `web`, `api`, `worker`, and `mailpit` on the main
project computer - no local PostgreSQL, Redis, object storage, or
bucket-init service is started. `web`, `api`, and `worker` connect to
this storage server over the LAN using the values in the main app's
`.env` (merged in from `.env.remote-storage.example`), which must match
this directory's `.env.storage` exactly.

## Safety Rules This Package Follows

- Never runs `docker system prune`, `docker volume prune`,
  `docker network prune`, or `docker compose down -v`.
- Never removes an existing container or volume belonging to any other
  project.
- `stop-storage.ps1` stops only the `naksha-geosphere-storage` project.
- No file in this directory contains a real credential - `.env.storage`
  is git-ignored and must be created locally on the storage-server
  machine from `.env.storage.example`.
