# Module: object-storage — placeholder variable declarations.
# No resources are defined yet; see README.md for the plan.

variable "environment" {
  description = "Deployment environment name (staging | production)."
  type        = string
}

variable "bucket_name_prefix" {
  description = "Prefix applied to all bucket names, e.g. \"naksha-geosphere-prod\"."
  type        = string
}

variable "temporary_data_expiry_days" {
  description = "Lifecycle expiry, in days, for objects in the temporary-data bucket."
  type        = number
  default     = 7
}
