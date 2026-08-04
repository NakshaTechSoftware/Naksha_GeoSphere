# Module: security

**Status: placeholder — not implemented.**

## Purpose

Will provision secrets management and IAM wiring shared across the other
modules — the production equivalent of the local `.env` file, but
without ever storing a real secret in Terraform state as plain text
where the provider offers a write-only/managed alternative.

## Planned Resources

- Secrets manager entries for: database credentials, MinIO/S3
  credentials (if not using IAM-role-based access instead), the
  application `SECRET_KEY`, and any future third-party API keys
  (payment provider, email provider)
- IAM roles/policies scoped to exactly what each compute target needs
  (least privilege) — `application` compute gets read access to its
  secrets and access to only its four object-storage buckets, nothing
  broader
- Rotation policy for credentials that support it

## Inputs (planned)

| Name | Type | Description |
|---|---|---|
| `environment` | string | `staging` \| `production` |

## Outputs (planned)

| Name | Description |
|---|---|
| `secrets_arn_prefix` | Identifier the `application` module uses to reference secrets at deploy time (not the secret values themselves) |

## Explicit Rule

No file in this module (or anywhere in this repository) may contain a
real credential, provider account ID, or access key. Values are always
sourced from the operator's own credential store /
environment at `terraform apply` time (e.g. via a `TF_VAR_*` environment
variable or a `.tfvars` file that is itself git-ignored — see the root
[.gitignore](../../../../.gitignore), which excludes all `*.tfvars`
except `*.tfvars.example`).
