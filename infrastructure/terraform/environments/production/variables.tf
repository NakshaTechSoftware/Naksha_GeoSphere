# Environment: production — variable declarations for the (currently
# commented-out) module composition described in main.tf/README.md. No
# default here is a real value — see terraform.tfvars.example.

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "production"
}

variable "network_cidr_block" {
  description = "CIDR block for the production network."
  type        = string
  default     = null
}

variable "database_instance_class" {
  description = "Provider-specific database instance size for production."
  type        = string
  default     = null
}

variable "database_backup_retention_days" {
  description = "Automated backup retention window for production."
  type        = number
  default     = 30
}

variable "queue_node_type" {
  description = "Provider-specific Redis node size for production."
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

variable "monitoring_notification_channel" {
  description = "Destination for production alarm/on-call notifications."
  type        = string
  default     = null
}
