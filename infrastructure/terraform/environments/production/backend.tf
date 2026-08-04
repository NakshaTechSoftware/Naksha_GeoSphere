# Environment: production — remote state backend.
#
# No backend is configured yet. Before this environment is ever applied
# for real, uncomment and fill in a real backend (values below are
# illustrative, not real) — production state should use locking and
# access restricted to the deployment role only:
#
# terraform {
#   backend "s3" {
#     bucket         = "naksha-geosphere-terraform-state"
#     key            = "production/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "naksha-geosphere-terraform-locks"
#     encrypt        = true
#   }
# }
#
# The bucket/table above must be provisioned out-of-band (or via a
# separate, bootstrap-only Terraform configuration) before this backend
# block can be enabled — Terraform cannot create its own state backend
# on first run.
