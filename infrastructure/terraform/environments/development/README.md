# Environment: development

**Status: not provisioned.**

Local development does **not** use Terraform at all — it uses Docker
Compose (`compose.yaml` + `compose.dev.yaml`) exclusively, which needs no
cloud account, no credentials, and no `terraform apply`. See
[docs/LOCAL_SETUP.md](../../../docs/LOCAL_SETUP.md).

This directory exists only so the environment layout is complete and
consistent (development/staging/production), and as a place to
eventually stand up a cheap, ephemeral cloud environment for integration
testing, if that ever becomes necessary — that has not been decided yet
and nothing here should be applied.

If a cloud development environment is ever needed, it would compose the
same modules as `staging`/`production` with smaller instance sizes and
more aggressive resource teardown (e.g. nightly destroy/recreate) — see
those environments' `README.md` for the module composition pattern.
