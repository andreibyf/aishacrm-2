/**
 * 4VD-37: Lock the contract of scripts/install-coolify-drift-guard.ps1 →
 * /usr/local/bin/coolify-auto-deploy-drift-guard.sh on VPS-2.
 *
 * The bash script lives outside the repo (it's deployed to VPS-2 by the .ps1
 * installer). We test the embedded heredoc body inside the .ps1 to verify:
 *   - The drift-detection SQL targets the correct app IDs (12, 13, 15, 19)
 *   - The correction SQL is idempotent (only updates rows that drifted)
 *   - The script exits 0 on healthy state without logging noise
 *   - The systemd timer fires every 5 minutes, also at boot
 *
 * If the .ps1's heredoc is edited and the contract drifts, this test fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INSTALLER_PATH = path.resolve(__dirname, '../../../scripts/install-coolify-drift-guard.ps1');

function loadInstaller() {
  return fs.readFileSync(INSTALLER_PATH, 'utf8');
}

test('installer file exists', () => {
  assert.ok(fs.existsSync(INSTALLER_PATH), 'install-coolify-drift-guard.ps1 must exist');
});

test('drift detection SQL targets staging apps 12, 13, 15, 19', () => {
  const src = loadInstaller();
  // STAGING_IDS is interpolated as "12,13,15,19"
  assert.match(src, /STAGING_IDS='12,13,15,19'/, 'staging app IDs hardcoded');
  // Detection query
  assert.match(
    src,
    /SELECT application_id FROM application_settings\s+WHERE application_id IN \(\$\{STAGING_IDS\}\) AND is_auto_deploy_enabled = true/,
    'detection SELECT must filter by staging IDs and is_auto_deploy_enabled = true',
  );
});

test('correction SQL is idempotent — only updates drifted rows', () => {
  const src = loadInstaller();
  // The UPDATE must filter `WHERE ... AND is_auto_deploy_enabled = true`
  // so it never touches rows that are already correctly false.
  assert.match(
    src,
    /UPDATE application_settings\s+SET is_auto_deploy_enabled = false, updated_at = NOW\(\)\s+WHERE application_id IN \(\$\{STAGING_IDS\}\) AND is_auto_deploy_enabled = true/,
    'correction UPDATE must be idempotent (only flips rows that drifted)',
  );
  assert.match(src, /RETURNING application_id;/, 'must RETURN updated rows for log audit trail');
});

test('script exits 0 silently on healthy state (no log noise every 5 min)', () => {
  const src = loadInstaller();
  // The heredoc must contain `if [[ -z "${DRIFTED}" ]]; then exit 0; fi`
  // (or equivalent) BEFORE any tee/logger call.
  const heredocMatch = src.match(
    /cat > \/usr\/local\/bin\/coolify-auto-deploy-drift-guard\.sh <<'GUARD'\n([\s\S]*?)\nGUARD/,
  );
  assert.ok(heredocMatch, 'GUARD heredoc must be present');
  const guardScript = heredocMatch[1];

  // Healthy-path early-exit must come BEFORE any logging
  const healthyExitIdx = guardScript.search(/if \[\[ -z "\$\{DRIFTED\}" \]\]; then[\s\S]*?exit 0/);
  const firstLogIdx = guardScript.search(/tee -a "\$\{LOG\}"|logger -t coolify-drift-guard/);
  assert.notStrictEqual(healthyExitIdx, -1, 'healthy-state early exit must exist');
  assert.notStrictEqual(firstLogIdx, -1, 'logging must exist for drift case');
  assert.ok(
    healthyExitIdx < firstLogIdx,
    'early-exit on healthy state must come BEFORE any tee/logger calls — otherwise the timer floods logs every 5 minutes',
  );
});

test('systemd timer fires every 5 minutes and at boot', () => {
  const src = loadInstaller();
  assert.match(src, /OnBootSec=1min/, 'must run shortly after boot to catch upgrade-induced drift');
  assert.match(src, /OnUnitActiveSec=5min/, 'must run every 5 minutes after boot');
  assert.match(
    src,
    /Persistent=true/,
    'persistent=true so missed runs (during VPS-2 reboot) are caught up',
  );
});

test('systemd service runs the guard script and ships output to journal', () => {
  const src = loadInstaller();
  assert.match(
    src,
    /ExecStart=\/usr\/local\/bin\/coolify-auto-deploy-drift-guard\.sh/,
    'service ExecStart must point at the installed guard script',
  );
  assert.match(src, /StandardOutput=journal/, 'stdout to journald');
  assert.match(src, /StandardError=journal/, 'stderr to journald');
  assert.match(src, /Type=oneshot/, 'must be Type=oneshot (timer-driven, not long-running)');
});

test('guard logs to both /var/log AND journalctl for redundancy', () => {
  const src = loadInstaller();
  assert.match(src, /LOG=\/var\/log\/coolify-drift-guard\.log/, 'log file path canonical');
  assert.match(src, /tee -a "\$\{LOG\}"/, 'also writes to log file');
  assert.match(
    src,
    /logger -t coolify-drift-guard -p user\.warning/,
    'WARNING priority for drift detection',
  );
  assert.match(
    src,
    /logger -t coolify-drift-guard -p user\.notice/,
    'NOTICE priority for correction confirmation',
  );
});

test('installer self-tests the guard end-to-end before declaring success', () => {
  const src = loadInstaller();
  // The installer must induce drift on app 13, run guard, verify cleanup
  assert.match(
    src,
    /UPDATE application_settings SET is_auto_deploy_enabled = true WHERE application_id = 13/,
    'self-test induces drift on app 13',
  );
  assert.match(
    src,
    /\/usr\/local\/bin\/coolify-auto-deploy-drift-guard\.sh/,
    'self-test runs guard manually after inducing drift',
  );
  assert.match(
    src,
    /SELECT application_id, is_auto_deploy_enabled, updated_at\s+FROM application_settings WHERE application_id IN \(12,13,15,19\)/,
    'self-test final-state assertion query',
  );
});

test('timer is enabled to start automatically on VPS-2 reboot', () => {
  const src = loadInstaller();
  assert.match(
    src,
    /systemctl enable --now coolify-drift-guard\.timer/,
    'must enable AND start the timer in one step',
  );
  assert.match(src, /WantedBy=timers\.target/, 'timer auto-starts via timers.target on boot');
});
