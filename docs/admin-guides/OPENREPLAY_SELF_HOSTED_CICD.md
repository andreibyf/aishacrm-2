# OpenReplay Self-Hosted via CI/CD

This guide makes OpenReplay deployment reproducible via GitHub Actions instead of manual host-only setup.

## What this pipeline does

- Uses workflow [openreplay-selfhosted-deploy.yml](../../.github/workflows/openreplay-selfhosted-deploy.yml)
- Fetches VPS credentials from Doppler
- Copies and runs installer wrapper [scripts/deploy/openreplay/install-openreplay.sh](../../scripts/deploy/openreplay/install-openreplay.sh)
- Installs OpenReplay on target host using upstream OpenReplay docker-compose installer

## Prerequisites

- Public DNS record exists (for example `replay.aishacrm.com`) and points to your host
- VPS credentials are present in Doppler config used by the workflow:
  - `PROD_VPS_HOST`
  - `PROD_VPS_USER`
  - `PROD_VPS_PORT`
  - `PROD_VPS_SSH_KEY`
- GitHub Actions secret/variables already configured for Doppler access:
  - `DOPPLER_TOKEN` (secret)
  - `DOPPLER_PROJECT` (variable)

## Run deployment

1. Open GitHub Actions.
2. Run workflow: `OpenReplay Self-Hosted Deploy`.
3. Provide inputs:
   - `environment`: `dev_personal` or `prd_prd`
   - `openreplay_domain`: your DNS name (for example `replay.aishacrm.com`)
   - `dns_public`: `y` for public DNS, `n` for private/internal DNS
   - `openreplay_branch`: usually `main`

## Post-deploy AiSHA configuration

Set these in Doppler (same environment used by AiSHA frontend):

- `VITE_OPENREPLAY_DASHBOARD_URL=https://<your-domain>`
- `VITE_OPENREPLAY_INGEST_POINT=https://<your-domain>/ingest`
- `VITE_OPENREPLAY_PROJECT_KEY=<OpenReplay project key>`

Then redeploy frontend using your standard release pipeline.

## Notes

- OpenReplay is deployed as a separate platform stack from AiSHA services.
- This workflow is intentionally `workflow_dispatch` only to avoid unintended infra changes on every release tag.
- If you want automatic deployment in production tags later, chain this workflow from `docker-release.yml` after explicit approval gates.
