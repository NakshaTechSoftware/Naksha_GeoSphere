# Module: application — placeholder variable declarations.
# No resources are defined yet; see README.md for the plan.

variable "environment" {
  description = "Deployment environment name (staging | production)."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs (from the network module) for the load balancer."
  type        = list(string)
  default     = []
}

variable "private_subnet_ids" {
  description = "Private subnet IDs (from the network module) for application compute."
  type        = list(string)
  default     = []
}

variable "application_security_group_id" {
  description = "Security group ID (from the network module) for application compute."
  type        = string
  default     = null
}

variable "database_endpoint" {
  description = "Database connection host (from the database module)."
  type        = string
  default     = null
}

variable "queue_endpoint" {
  description = "Redis connection host (from the queue module)."
  type        = string
  default     = null
}

variable "secrets_arn_prefix" {
  description = "Prefix identifying where application secrets live (from the security module)."
  type        = string
  default     = null
}

variable "web_image" {
  description = "Pinned container image reference for the web service. Never \"latest\"."
  type        = string
  default     = null
}

variable "api_image" {
  description = "Pinned container image reference for the api service. Never \"latest\"."
  type        = string
  default     = null
}

variable "worker_image" {
  description = "Pinned container image reference for the worker service. Never \"latest\"."
  type        = string
  default     = null
}
