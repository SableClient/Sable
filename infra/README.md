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
- Scope the token to the specific zone that serves `app.sable.moe`.
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
   `cloudflare_worker_version` uploads the built `dist/` assets.
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
- Previews are handled by Cloudflare Workers Builds, not GitHub Actions.
- Connect the repo once in Cloudflare Workers Builds.
- Set the Cloudflare Builds deploy command to `npx wrangler versions upload`.
- This disables automatic deployments while still allowing Cloudflare to build PRs/branches and save them as preview versions.
- That keeps Cloudflare from promoting `dev` commits to production. Production stays on the OpenTofu/GitHub Actions path in this repo.

```bash
npx wrangler versions upload
```

Production deploys:

- `.github/workflows/cloudflare-web-deploy.yml` comments PR plans for `infra/web` changes.
- That PR plan job only runs for same-repo PRs, not fork PRs, because it needs repo secrets.
- The same workflow applies production on pushes to `dev` or manual dispatch.
- `tofu apply` uploads `dist/` through `cloudflare_worker_version` and promotes it with `cloudflare_workers_deployment`.
- Production lives on `app.sable.moe`.
