# Environment: staging — variable declarations for the (currently
# commented-out) module composition in main.tf. No default here is a
# real value — see terraform.tfvars.example.

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "staging"
}

variable "network_cidr_block" {
  description = "CIDR block for the staging network."
  type        = string
  default     = null
}

variable "database_instance_class" {
  description = "Provider-specific database instance size for staging."
  type        = string
  default     = null
}

variable "queue_node_type" {
  description = "Provider-specific Redis node size for staging."
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
  description = "Destination for staging alarm notifications."
  type        = string
  default     = null
}
