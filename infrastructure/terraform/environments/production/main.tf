# Environment: production — placeholder composition.
#
# Intentionally contains no `terraform { required_providers {} }` block
# and no active `module` calls — nothing here can be applied as-is. See
# README.md for the intended module composition and the required
# guardrails before this environment can be provisioned for real.
#
# Once a target cloud provider is chosen, the composition mirrors
# staging/main.tf with production-appropriate sizing (multi-AZ,
# auto-scaling, longer backup retention, full monitoring coverage) —
# see README.md.
