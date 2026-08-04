# Module: security — placeholder outputs.
# Only identifiers/ARNs are ever output here — never a secret value.

output "secrets_arn_prefix" {
  description = "Identifier the application module uses to reference secrets at deploy time (placeholder)."
  value       = local.not_implemented
}
