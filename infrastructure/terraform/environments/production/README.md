# Environment: production

**Status: placeholder — not provisioned.** No `terraform apply` has been
run for this environment. `main.tf` in this directory documents the
intended module composition but does not instantiate a provider or any
resource.

## Intended Composition

```
network        -> production VPC, private/public subnets, multi-AZ
database       -> uses network's private subnets + database security group, longer backup retention than staging
queue          -> uses network's private subnets + queue security group, replicated
object-storage -> production-prefixed private buckets
security       -> production secrets manager entries + IAM roles, credential rotation enabled
application    -> uses network/database/queue/object-storage/security outputs, auto-scaling enabled
monitoring     -> production log retention, full alarm coverage, on-call notification channel
```

## Before This Can Be Applied

1. Choose a target cloud provider and add the corresponding
   `required_providers` entry plus a real (git-ignored) backend
   configuration for remote state — see `backend.tf` in this directory
   for the expected shape. Production state should use locking and
   restricted access.
2. Provide a `terraform.tfvars` (git-ignored; copy
   `terraform.tfvars.example`) with real, non-secret configuration
   values. Real secrets are never put in a `.tfvars` file.
3. Require a second reviewer on any `terraform plan` output before
   `terraform apply` against production.
4. Confirm `docs/DEPLOYMENT.md` and `docs/SECURITY.md` expectations
   (non-root containers, private database/queue/storage, signed-URL
   downloads, no debug/docs endpoints exposed) are all satisfied by the
   plan before applying.

## Explicit Guardrails

- No `*_HOST_PORT`-style public exposure of the database, Redis, or
  object storage — those must only be reachable from `application`
  compute inside the `network` module's private subnets, matching
  `compose.prod.yaml`'s behavior locally.
- Every container image reference must be pinned to an exact tag/digest,
  never `:latest`.
