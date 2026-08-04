# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Naksha GeoSphere, please report
it privately to **software.team@nakshatech.com** rather than opening a
public GitHub issue. Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (or a proof-of-concept)
- Any relevant logs or screenshots (with secrets redacted)

We aim to acknowledge reports within 3 business days.

## Scope (Current Phase)

This repository currently contains an engineering **foundation**, not the
production marketplace. There is no authentication, payment processing, or
user data storage implemented yet. Relevant current attack surface:

- The local Docker Compose stack (development credentials only — never
  exposed publicly)
- The FastAPI health endpoints
- CI/CD workflow configuration

See [docs/SECURITY.md](docs/SECURITY.md) for the full security roadmap
(authentication, authorization, signed URLs, rate limiting, payment webhook
validation, audit logging, malware scanning, and OWASP review) as the
marketplace is built out.

## Supported Versions

Pre-1.0: only the latest commit on `main` is supported.

## Development Credentials

All credentials in `.env.example` are non-functional placeholders. The
bootstrap scripts generate random local-only secrets. These values must
**never** be reused in staging or production.
