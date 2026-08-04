# Module: security — placeholder variable declarations.
# No resources are defined yet; see README.md for the plan.
#
# No variable here may ever default to a real secret value.

variable "environment" {
  description = "Deployment environment name (staging | production)."
  type        = string
}
