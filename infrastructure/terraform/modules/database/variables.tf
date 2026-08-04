# Module: database — placeholder variable declarations.
# No resources are defined yet; see README.md for the plan.

variable "environment" {
  description = "Deployment environment name (staging | production)."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs (from the network module) to place the database in."
  type        = list(string)
  default     = []
}

variable "security_group_id" {
  description = "Security group ID (from the network module) restricting database access."
  type        = string
  default     = null
}

variable "instance_class" {
  description = "Provider-specific database instance size."
  type        = string
  default     = null
}

variable "allocated_storage_gb" {
  description = "Initial storage allocation, in GB."
  type        = number
  default     = 20
}

variable "backup_retention_days" {
  description = "Automated backup retention window, in days."
  type        = number
  default     = 7
}
