# Module: queue — placeholder variable declarations.
# No resources are defined yet; see README.md for the plan.

variable "environment" {
  description = "Deployment environment name (staging | production)."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs (from the network module) to place the queue in."
  type        = list(string)
  default     = []
}

variable "security_group_id" {
  description = "Security group ID (from the network module) restricting queue access."
  type        = string
  default     = null
}

variable "node_type" {
  description = "Provider-specific Redis node size."
  type        = string
  default     = null
}
