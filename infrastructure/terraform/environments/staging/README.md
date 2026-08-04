# Environment: staging

**Status: placeholder — not provisioned.** No `terraform apply` has been
run for this environment. `main.tf` in this directory documents the
intended module composition but does not instantiate a provider or any
resource.

## Intended Composition

```
network        -> staging VPC, private/public subnets
database       -> uses network's private subnets + database security group
queue          -> uses network's private subnets + queue security group
object-storage -> staging-prefixed private buckets
security       -> staging secrets manager entries + IAM roles
application    -> uses network/database/queue/object-storage/security outputs
monitoring     -> staging log retention (shorter than production), alarms
```

## Before This Can Be Applied

1. Choose a target cloud provider and add the corresponding
   `required_providers` entry plus a real (git-ignored) backend
   configuration for remote state — see `backend.tf` in this directory
   for the expected shape.
2. Provide a `terraform.tfvars` (git-ignored; copy
   `terraform.tfvars.example`) with real, non-secret configuration
   values (CIDR ranges, instance sizes). Real secrets are never put in a
   `.tfvars` file — they belong in the `security` module's secrets
   manager, populated out-of-band.
3. Run `terraform init`, `terraform plan`, and review the plan carefully
   before ever running `terraform apply`.

## Purpose of Staging

A smaller-scale, disposable mirror of `production` used to validate
infrastructure changes and full-stack integration before they reach
production traffic.
