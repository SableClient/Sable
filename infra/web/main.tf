resource "cloudflare_worker" "site" {
  account_id = var.account_id
  name       = var.worker_name

  observability = {
    enabled = true
    logs = {
      enabled         = true
      invocation_logs = true
    }
  }

  subdomain = {
    enabled          = true
    previews_enabled = true
  }
}

resource "cloudflare_worker_version" "site" {
  account_id         = var.account_id
  compatibility_date = "2026-03-03"
  worker_id          = cloudflare_worker.site.id

  assets = {
    directory = abspath("${path.module}/../../dist")
    config = {
      not_found_handling = "single-page-application"
    }
  }
}

resource "cloudflare_workers_deployment" "site" {
  account_id  = var.account_id
  script_name = cloudflare_worker.site.name
  strategy    = "percentage"

  annotations = var.workers_message == null ? null : {
    workers_message = var.workers_message
  }

  versions = [{
    percentage = 100
    version_id = cloudflare_worker_version.site.id
  }]
}

resource "cloudflare_workers_custom_domain" "site" {
  account_id = var.account_id
  hostname   = var.custom_domain
  service    = cloudflare_worker.site.name
  zone_id    = var.zone_id

  depends_on = [cloudflare_workers_deployment.site]
}
