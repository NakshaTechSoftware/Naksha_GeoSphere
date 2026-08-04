# Environment: staging — placeholder composition.
#
# Intentionally contains no `terraform { required_providers {} }` block
# and no active `module` calls — nothing here can be applied as-is. See
# README.md for the intended module composition and the steps required
# before this environment can be provisioned for real.
#
# Once a target cloud provider is chosen, the composition will look
# roughly like this (illustrative only — types/attributes depend on the
# provider eventually chosen):
#
# module "network" {
#   source                  = "../../modules/network"
#   environment             = var.environment
#   cidr_block              = var.network_cidr_block
#   availability_zone_count = 2
# }
#
# module "database" {
#   source             = "../../modules/database"
#   environment        = var.environment
#   subnet_ids         = module.network.private_subnet_ids
#   security_group_id  = module.network.database_security_group_id
#   instance_class     = var.database_instance_class
# }
#
# module "queue" {
#   source             = "../../modules/queue"
#   environment        = var.environment
#   subnet_ids         = module.network.private_subnet_ids
#   security_group_id  = module.network.queue_security_group_id
#   node_type          = var.queue_node_type
# }
#
# module "object_storage" {
#   source              = "../../modules/object-storage"
#   environment         = var.environment
#   bucket_name_prefix  = "naksha-geosphere-staging"
# }
#
# module "security" {
#   source      = "../../modules/security"
#   environment = var.environment
# }
#
# module "application" {
#   source                          = "../../modules/application"
#   environment                     = var.environment
#   public_subnet_ids               = module.network.public_subnet_ids
#   private_subnet_ids              = module.network.private_subnet_ids
#   application_security_group_id   = module.network.application_security_group_id
#   database_endpoint               = module.database.endpoint
#   queue_endpoint                  = module.queue.endpoint
#   secrets_arn_prefix              = module.security.secrets_arn_prefix
#   web_image                       = var.web_image
#   api_image                       = var.api_image
#   worker_image                    = var.worker_image
# }
#
# module "monitoring" {
#   source                = "../../modules/monitoring"
#   environment           = var.environment
#   notification_channel  = var.monitoring_notification_channel
#   log_retention_days    = 14
# }
