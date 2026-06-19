# Infrastructure

`infra/web` manages the Cloudflare Worker, immutable Worker versions, the live
production deployment, and the production custom domain.

Prerequisites:

- OpenTofu `1.11.x` installed locally
- Node.js/pnpm installed locally so you can build `dist/` before Worker uploads
- A Cloudflare account with the target zone already onboarded to Cloudflare
- A GitLab project to store the OpenTofu state
- A GitLab access token that can read and write that project's OpenTofu state

Required GitHub repository secrets:

- `TF_CLOUDFLARE_API_TOKEN`
- `TF_VAR_ACCOUNT_ID`
- `TF_VAR_ZONE_ID`
- `TF_HTTP_ADDRESS`
- `TF_HTTP_LOCK_ADDRESS`
- `TF_HTTP_UNLOCK_ADDRESS`
- `TF_HTTP_USERNAME`
- `TF_HTTP_PASSWORD`

The workflows map those secrets onto the actual runtime environment variable names
that Cloudflare and OpenTofu expect.

Cloudflare API token permissions:

- `Account > Workers Scripts > Edit`
- Scope the token to the specific Cloudflare account that owns the Worker.
- Scope the token to the specific zone that serves `charm.cloudhub.social`.
- Do not grant Pages or DNS edit permissions here. The Worker script upload and
  custom-domain attach endpoints used by this repo accept Workers Scripts Write, and
  Cloudflare creates the DNS record for the Worker custom domain automatically.

GitLab access token permissions:

- `api`

Helpful reference links:

- Create the main Cloudflare API token:
  https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Find your account ID and zone ID:
  https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/
- GitLab-managed OpenTofu state:
  https://docs.gitlab.com/user/infrastructure/iac/terraform_state/

Local setup:

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in shared values.
2. Copy `gitlab.http.tfbackend.example` to `gitlab.http.tfbackend` and fill in the
   GitLab project ID, state name, and username.
3. Run `pnpm install` from the repo root.
4. Export the GitLab access token as the backend password.
5. Export the Cloudflare API token for OpenTofu.
6. Run `pnpm run build` before `tofu plan` or `tofu apply`, because
   `cloudflare_worker_version` uploads the built Worker module from `dist/charm/`
   and static assets from `dist/client/`.
7. Initialize the backend.

Local OpenTofu production flow from the repo root:

```bash
pnpm run build
export TF_HTTP_PASSWORD="<your-gitlab-access-token>"
export CLOUDFLARE_API_TOKEN="<your-cloudflare-api-token>"
tofu -chdir=infra/web init -reconfigure -backend-config="../gitlab.http.tfbackend"
tofu -chdir=infra/web validate
tofu -chdir=infra/web plan -var-file="../terraform.tfvars"
tofu -chdir=infra/web apply -var-file="../terraform.tfvars"
```

Optional local OpenTofu deployment message:

```bash
export TF_VAR_workers_message="$(git log -1 --pretty=%s)"
tofu -chdir=infra/web apply -var-file="../terraform.tfvars"
```

If you already created local state before switching to GitLab state, use
`tofu -chdir=infra/web init -reconfigure -migrate-state -backend-config="../gitlab.http.tfbackend"`
once instead.

Preview builds:

- `infra/web/main.tf` enables preview URL capability with `subdomain.previews_enabled = true`.
- Pull request previews are handled by `.github/workflows/cloudflare-web-preview.yml`.
- The preview workflow uploads immutable Worker versions with aliases like `pr-60`.
- It does not promote preview versions to production.

```bash
npx wrangler versions upload -c dist/charm/wrangler.json --preview-alias pr-60
```

Production deploys:

- `.github/workflows/cloudflare-web-deploy.yml` comments PR plans for `infra/web` changes.
- That PR plan job only runs for same-repo PRs, not fork PRs, because it needs repo secrets.
- Fast-moving production deploys are handled by `.github/workflows/cloudflare-dev-deploy.yml`.
- Every push to `integration` that touches app or deploy inputs builds `dist/` and runs `wrangler deploy -c dist/charm/wrangler.json`.
- That updates the production Worker served from `charm.cloudhub.social` once the custom domain has been attached.
- Worker observability and persisted invocation logs are enabled in both OpenTofu and the generated Wrangler config.
- The deployed Worker now runs before static asset handling and forwards each request to the
  `ASSETS` binding. This is required for Cloudflare Worker observability, trace drains,
  and invocation logs to capture real browser traffic instead of treating the site as
  static-assets-only.
- Static asset headers are managed through `public/_headers`; Vite copies that file into `dist/` before Wrangler/OpenTofu upload the Worker assets.
- The stable release path remains available through `.github/workflows/cloudflare-web-deploy.yml` on `v*` tags or manual dispatch.
- `tofu apply` uploads the built Worker module from `dist/charm/index.js`, uploads
  static assets from `dist/client/` through `cloudflare_worker_version`, promotes
  the version with `cloudflare_workers_deployment`, and manages the Worker custom domain.
- To swap back to a release-only site, disable the `integration` production deploy workflow or change it back to `wrangler versions upload`, then use the OpenTofu workflow for tag/manual production deploys.
