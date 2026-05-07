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

function loadGuardHeredoc() {
  const src = loadInstaller();
  const heredocMatch = src.match(
    /cat > \/usr\/local\/bin\/coolify-auto-deploy-drift-guard\.sh <<'GUARD'\n([\s\S]*?)\nGUARD/,
  );
  assert.ok(heredocMatch, 'GUARD heredoc must be present');
  return heredocMatch[1];
}

test('healthy-state path exits 0 silently — the if/exit/fi block contains no logging', () => {
  const guardScript = loadGuardHeredoc();
  // The healthy-state block: `if [[ -z "${DRIFTED}" ]]; then ... exit 0 ... fi`
  // Inside that block (between `then` and the matching `fi`) there must be NO tee/logger,
  // otherwise the timer floods logs every 5 minutes on the 99.9% healthy path.
  const healthyBlockMatch = guardScript.match(
    /if \[\[ -z "\$\{DRIFTED\}" \]\]; then\s*([\s\S]*?)\s*fi/,
  );
  assert.ok(healthyBlockMatch, 'healthy-state if/then/fi block must exist');
  const healthyBlockBody = healthyBlockMatch[1];
  assert.doesNotMatch(
    healthyBlockBody,
    /tee -a "\$\{LOG\}"|logger -t coolify-drift-guard/,
    'healthy-state path must not invoke tee or logger — silent exit only',
  );
  assert.match(healthyBlockBody, /exit 0/, 'healthy-state path must exit 0');
});

test('drift detection captures exit code and fails loud on infra errors (not silently)', () => {
  const guardScript = loadGuardHeredoc();
  // The detection SQL output capture must NOT use `2>/dev/null || true` — that would
  // mask docker exec / psql failures (DB down, container renamed, auth) as healthy.
  // Instead it must capture stderr (`2>&1`), the exit code (`$?`), and bail with a
  // logged error if rc != 0. Otherwise the guard becomes a no-op the moment Coolify
  // is unreachable, which is exactly when staging is most at risk.
  // Scope to the guard heredoc — the wrapper .ps1 has the same string in a comment.
  assert.doesNotMatch(
    guardScript,
    /2>\/dev\/null \|\| true/,
    'guard heredoc must NOT swallow drift-check errors with `2>/dev/null || true`',
  );
  // Detection SQL: `SQL_RC=0` then `SQL_OUT=$(...) 2>&1) || SQL_RC=$?`
  // The `|| SQL_RC=$?` form is required so `set -e` doesn't kill the script
  // BEFORE the rc check fires (a bare $() assignment would).
  assert.match(
    guardScript,
    /SQL_RC=0\s*\nSQL_OUT=\$\(docker exec coolify-db psql[\s\S]*?2>&1\) \|\| SQL_RC=\$\?/,
    'detection SQL must use `SQL_RC=0` + `... 2>&1) || SQL_RC=$?` pattern (set -e safe)',
  );
  assert.match(
    guardScript,
    /if \[\[ \$SQL_RC -ne 0 \]\]; then[\s\S]*?logger -t coolify-drift-guard -p user\.err[\s\S]*?exit 1[\s\S]*?fi/,
    'on rc != 0 the guard must log at user.err priority and exit 1 (alert + systemd marks failed)',
  );
});

test('drift correction also fails loud — UPDATE failure cannot be silently lost', () => {
  const guardScript = loadGuardHeredoc();
  // Symmetric to the detection check: if drift is detected and the UPDATE fails,
  // we must NOT exit 0 thinking the guard "ran". The previous tick logged
  // "DRIFT DETECTED"; if we don't log "CORRECTION FAILED" too, journals will show
  // the drift but no resolution and the next push will still double-fire.
  assert.match(
    guardScript,
    /UPDATE_RC=0\s*\nUPDATE_OUT=\$\(docker exec coolify-db psql[\s\S]*?2>&1\) \|\| UPDATE_RC=\$\?/,
    'correction UPDATE must use `UPDATE_RC=0` + `... 2>&1) || UPDATE_RC=$?` pattern (set -e safe)',
  );
  assert.match(
    guardScript,
    /if \[\[ \$UPDATE_RC -ne 0 \]\]; then[\s\S]*?logger -t coolify-drift-guard -p user\.err[\s\S]*?exit 1[\s\S]*?fi/,
    'on UPDATE rc != 0 the guard must log at user.err priority and exit 1',
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
