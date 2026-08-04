# Security

This document covers the security posture of the current foundation and
the roadmap for the marketplace features that will be built on it. For
how to report a vulnerability, see the root [SECURITY.md](../SECURITY.md).

## Secrets Management

- No credential (password, API key, token, connection string) is
  hardcoded anywhere in application code, Dockerfiles, or Compose files.
  Required secrets are declared as required fields with no default in
  `app/core/config.py` / `worker/core/config.py`, and enforced at the
  Compose layer via `${VAR:?error}`.
- `.env` is git-ignored; only `.env.example` (placeholders) is tracked.
- Local secrets are generated randomly by `scripts/bootstrap.ps1` /
  `scripts/bootstrap.sh` and never printed to the console.
- In production, secrets must come from a real secrets manager injected
  as environment variables at deploy time — see
  [DEPLOYMENT.md](DEPLOYMENT.md).
- Logs are structured JSON and never include credentials or full
  connection strings — only request correlation IDs, status, and
  human-readable detail strings (see `app/core/logging.py`).

## Authentication Roadmap (not implemented yet)

Planned: an `authentication` module issuing short-lived access tokens
(and refresh tokens) tied to a `users`/`organizations` model, with
password hashing via a modern algorithm (e.g. Argon2) and pgcrypto
available at the database layer for any additional secure identifiers.

## Authorization Roadmap (not implemented yet)

Planned: role-based access control scoped per organization (owner/admin/
member), enforced at the API layer via FastAPI dependencies, with every
domain module (`orders`, `downloads`, `licensing`, ...) checking
ownership before returning or mutating a resource. An `audit` module will
record who did what, when.

## Private Storage

All object-storage buckets
(`geosphere-source-data`, `geosphere-preview-data`,
`geosphere-order-output`, `geosphere-temporary-data`) are created with no
anonymous/public access (`mc anonymous set none` in
`infrastructure/docker/minio-init/create-buckets.sh`). No object is ever
served from a permanent public URL.

## Signed URLs (not implemented yet)

The object-storage client abstraction
(`app/services/storage_client.py`) and `SIGNED_URL_EXPIRY_SECONDS`
configuration exist specifically to support short-lived, pre-signed
download URLs once the `downloads` module is implemented — the API will
generate a URL scoped to exactly one object, valid for a short window
(default 900s), rather than exposing any bucket or object publicly.

## Rate Limiting (not implemented yet)

Not yet in place. Planned for public-facing endpoints (search, pricing,
auth) once implemented, likely via a Redis-backed limiter given Redis is
already part of the stack.

## Payment Webhook Validation (not implemented yet)

When the `payments` module is implemented, every inbound webhook from
the payment provider must have its signature verified against the
provider's signing secret before any order state changes — no webhook
payload should be trusted on content alone.

## Audit Logs (not implemented yet)

The `audit` module placeholder exists for recording security-relevant
events (auth attempts, order/payment state changes, admin actions) once
those modules exist.

## File Validation

`geospatial.validate_sample` (the worker task) validates GeoJSON geometry
**in memory only** — it never accepts or opens a filesystem path, so it
cannot be used to read arbitrary files even if task arguments were ever
attacker-influenced. Any future task that does handle uploaded files must
validate file type/size before processing and must never trust a
user-supplied path directly.

## Malware Scanning Roadmap (not implemented yet)

Planned for any future user-uploaded dataset ingestion path (e.g. if
users can contribute datasets) — uploaded files would be scanned before
being moved out of a quarantine/temporary bucket
(`geosphere-temporary-data` exists for this purpose).

## OWASP-Based Review

Practices already in place that map to the OWASP Top 10:
- **A01 Broken Access Control** — no protected resources exist yet;
  authorization roadmap above.
- **A02 Cryptographic Failures** — no secrets hardcoded; pgcrypto
  enabled for future use; TLS termination is a deployment-time concern
  (see DEPLOYMENT.md).
- **A03 Injection** — SQLAlchemy Core/ORM with parameterized queries
  throughout; no raw string-interpolated SQL anywhere in the codebase.
- **A05 Security Misconfiguration** — CORS/TrustedHost are
  environment-driven, not wildcarded; API docs are hard-disabled in
  production; stack traces are never returned to clients (see
  `app/core/middleware.py`).
- **A08 Software and Data Integrity Failures** — all dependencies are
  pinned to exact versions; `security-ci.yml` runs dependency and secret
  scanning on every change.
- **A09 Security Logging and Monitoring Failures** — structured JSON
  logs with request correlation IDs are in place from the start.

A full OWASP review should be repeated once authentication, payments, and
file upload are implemented — those introduce most of the remaining
attack surface.

## Backup and Recovery

Not yet applicable — there is no production data. When a production
database exists, responsibility for backup cadence, retention, and
tested restore procedures belongs to whoever operates the managed
Postgres instance (see [DEPLOYMENT.md](DEPLOYMENT.md)); this should be
documented here once that decision is made.
