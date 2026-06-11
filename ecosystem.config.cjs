/**
 * PM2 Ecosystem — HP Omen AI Server Task Workers
 *
 * Runs three Bull task worker instances, one per CRM environment.
 * Each subscribes to its own queue (task-execution:dev / staging / prd)
 * on the shared Redis (port 6381) and calls LiteLLM + vLLM locally.
 *
 * Usage:
 *   cd ~/aishacrm-2
 *   pm2 start ecosystem.config.cjs          # start all workers
 *   pm2 reload ecosystem.config.cjs         # zero-downtime reload
 *   pm2 logs                                # tail all worker logs
 *   pm2 save && pm2 startup                 # persist across reboots
 *
 * Secrets: each worker reads backend/.env.<APP_ENV> (or uses Doppler).
 * The env_<name> blocks below merge ON TOP of the file — Doppler injection
 * via `doppler run -- pm2 start ecosystem.config.cjs` is also supported.
 *
 * BRAID_TOOLS_DIR must point to the braid tool definitions directory.
 */

'use strict';

// DEPLOY_DIR is where sync-workers-to-ai-server.ps1 drops the files.
// If running from a full repo clone, override with: DEPLOY_DIR=$HOME/aishacrm-2 pm2 start ...
const REPO = process.env.DEPLOY_DIR || process.env.HOME + '/aisha-worker';
const ENTRY = REPO + '/backend/workers/worker-entry.js';
const REDIS = 'redis://localhost:6381';

// LiteLLM URLs per environment.
// Each environment's LiteLLM already has LOCAL_LLM_BASE_URL wired to vLLM
// on HP Omen (100.81.132.118:8000 via Tailscale). Workers call back to the
// environment-specific LiteLLM, never to vLLM directly.
//
// dev:     Windows laptop docker-compose (same LAN as HP Omen)
// staging: VPS-1 LiteLLM Coolify container, exposed on Tailscale via socat
//          systemd proxy (see scripts/setup-vps1-litellm-proxy.sh)
// prd:     Hetzner LiteLLM, port 4002 published, accessible via Tailscale
const LITELLM = {
  dev:     'http://192.168.7.157:4002',
  staging: 'http://100.78.61.119:4002',
  prd:     'http://100.105.182.29:4002',
};

/** Shared env for all workers (no LITELLM_BASE_URL — set per worker) */
const common = {
  TASK_QUEUE_REDIS_URL: REDIS,
  LITELLM_ENABLED: 'true',
  TELEMETRY_ENABLED: 'true',
  TELEMETRY_LOG_PATH: '/var/log/aisha/telemetry.ndjson',
  NODE_ENV: 'production',
};

module.exports = {
  apps: [
    // ── Development ─────────────────────────────────────────────────────────
    {
      name: 'worker-dev',
      script: ENTRY,
      cwd: REPO,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        ...common,
        APP_ENV: 'dev',
        LITELLM_BASE_URL: LITELLM.dev,
      },
      error_file: '/var/log/aisha/worker-dev-error.log',
      out_file: '/var/log/aisha/worker-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      kill_timeout: 10000, // 10s drain time for in-flight jobs
    },

    // ── Staging ──────────────────────────────────────────────────────────────
    {
      name: 'worker-staging',
      script: ENTRY,
      cwd: REPO,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        ...common,
        APP_ENV: 'staging',
        LITELLM_BASE_URL: LITELLM.staging,
      },
      error_file: '/var/log/aisha/worker-staging-error.log',
      out_file: '/var/log/aisha/worker-staging-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      kill_timeout: 10000,
    },

    // ── Production ───────────────────────────────────────────────────────────
    {
      name: 'worker-prd',
      script: ENTRY,
      cwd: REPO,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        ...common,
        APP_ENV: 'prd',
        LITELLM_BASE_URL: LITELLM.prd,
      },
      error_file: '/var/log/aisha/worker-prd-error.log',
      out_file: '/var/log/aisha/worker-prd-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      kill_timeout: 10000,
    },

    // ── LiteLLM proxy ────────────────────────────────────────────────────────
    // Uncomment if not managing LiteLLM separately.
    // {
    //   name: 'litellm',
    //   script: 'litellm',
    //   args: `--config ${REPO}/litellm_config.yaml --port 4000`,
    //   interpreter: 'none',
    //   autorestart: true,
    //   watch: false,
    //   error_file: '/var/log/aisha/litellm-error.log',
    //   out_file: '/var/log/aisha/litellm-out.log',
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss',
    // },
  ],
};
