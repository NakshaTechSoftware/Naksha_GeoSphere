# Module: network — placeholder outputs.
# These reference locals.tf placeholders, not real resources, until this
# module is implemented — see README.md.

output "network_id" {
  description = "ID of the created network (placeholder)."
  value       = local.not_implemented
}

output "private_subnet_ids" {
  description = "Subnet IDs for application/database/queue compute (placeholder)."
  value       = []
}

output "public_subnet_ids" {
  description = "Subnet IDs for ingress (placeholder)."
  value       = []
}

output "application_security_group_id" {
  description = "Security group ID for application compute (placeholder)."
  value       = local.not_implemented
}

output "database_security_group_id" {
  description = "Security group ID for the database module (placeholder)."
  value       = local.not_implemented
}

output "queue_security_group_id" {
  description = "Security group ID for the queue module (placeholder)."
  value       = local.not_implemented
}
