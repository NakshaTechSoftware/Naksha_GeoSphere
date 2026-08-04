# Module: network — placeholder variable declarations.
# No resources are defined yet; see README.md for the plan.

variable "environment" {
  description = "Deployment environment name (staging | production)."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be \"staging\" or \"production\"."
  }
}

variable "cidr_block" {
  description = "CIDR block for the network. No default — must be set explicitly per environment."
  type        = string
}

variable "availability_zone_count" {
  description = "Number of availability zones to spread subnets across."
  type        = number
  default     = 2
}
