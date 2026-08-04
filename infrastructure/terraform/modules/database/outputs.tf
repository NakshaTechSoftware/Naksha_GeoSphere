# Module: database — placeholder outputs.
# See README.md — credentials are never exposed as a Terraform output.

output "endpoint" {
  description = "Database connection host (placeholder)."
  value       = local.not_implemented
}

output "port" {
  description = "Database connection port (placeholder)."
  value       = 5432
}

output "database_name" {
  description = "Application database name (placeholder)."
  value       = local.not_implemented
}
