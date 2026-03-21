variable "account_id" {
  description = "Cloudflare Account ID"
  type        = string
  sensitive   = true
}

variable "custom_domain" {
  description = "Custom domain attached to the Worker"
  type        = string
  default     = "app.cloudhub.social"
}

variable "worker_name" {
  description = "Cloudflare Worker name"
  type        = string
  default     = "sable"
}

variable "workers_message" {
  description = "Optional short message attached to Worker deployments"
  type        = string
  default     = null
}

variable "zone_id" {
  description = "Cloudflare Zone ID"
  type        = string
  sensitive   = true
}
