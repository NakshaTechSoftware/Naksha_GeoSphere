# Module: network — placeholder.
#
# No cloud resources are defined here yet. This module is intentionally
# inert (no `provider` requirements, nothing to apply) so the repository
# can document the planned shape of the infrastructure without being
# able to accidentally provision or cost anything.
#
# See README.md for the resources this module will eventually contain
# (VPC, subnets, security groups, NAT gateway) once a target cloud
# provider is chosen.

locals {
  not_implemented = "network module not yet implemented — see infrastructure/terraform/modules/network/README.md"
}
