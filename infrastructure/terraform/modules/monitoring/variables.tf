# Module: monitoring — placeholder variable declarations.
# No resources are defined yet; see README.md for the plan.

variable "environment" {
  description = "Deployment environment name (staging | production)."
  type        = string
}

variable "notification_channel" {
  description = "Destination for alarm notifications (e.g. an email address or webhook URL)."
  type        = string
  default     = null
}

variable "log_retention_days" {
  description = "How long application logs are retained."
  type        = number
  default     = 30
}
