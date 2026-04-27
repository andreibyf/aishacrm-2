#!/usr/bin/env bash
# lockup-diagnostic.sh
# Read-only diagnostic for a VPS lockup window.
# Pulls VPS-side evidence (kernel, journal, sar, docker, cron, auth, disk)
# AND Cloudflare-side evidence (HTTP analytics, firewall events, tunnel logs)
# for a configurable time window, bundles into one tarball.
#
# Safe to run anytime. No mutations.
#
# Usage:
#   sudo CLOUDFLARE_ACCESS_TOKEN=cfat_xxx CF_ZONE_ID=... \
#        ./lockup-diagnostic.sh 2026-04-26 02:00 03:00
#
#   # or with all defaults edited inline below:
#   sudo ./lockup-diagnostic.sh
#
# Args (optional): DATE START_TIME END_TIME
#   DATE         YYYY-MM-DD in VPS local time (default: yesterday)
#   START_TIME   HH:MM (default: 02:00)
#   END_TIME     HH:MM (default: 03:00)
#
# Env vars:
#   CLOUDFLARE_ACCESS_TOKEN   API token (falls back to /opt/aishacrm/.env or argv)
#   CF_ZONE_ID                Zone ID (required for CF queries; skip if blank)
#   WINDOW_PAD_MIN            Minutes of padding before/after (default 15)
#   OUTPUT_DIR                Where to write artifacts (default /tmp/lockup-diag-<ts>)

set -uo pipefail

# ---------- CLI args ----------
LOCKUP_DATE="${1:-$(date -d 'yesterday' +%Y-%m-%d)}"
LOCKUP_START="${2:-02:00}:00"
LOCKUP_END="${3:-03:00}:00"
WINDOW_PAD_MIN="${WINDOW_PAD_MIN:-15}"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp/lockup-diag-$(date +%s)}"

# ---------- Cloudflare config ----------
CF_ZONE_ID="${CF_ZONE_ID:-}"
# Try env, then aishacrm .env files commonly used on the VPS
if [ -z "${CLOUDFLARE_ACCESS_TOKEN:-}" ]; then
  for envf in /opt/aishacrm/.env /opt/aishacrm-2/.env /root/aishacrm/.env "$HOME/aishacrm/.env" "$HOME/aishacrm-2/.env"; do
    if [ -f "$envf" ]; then
      v=$(grep -E '^CLOUDFLARE_ACCESS_TOKEN=' "$envf" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
      if [ -n "$v" ]; then export CLOUDFLARE_ACCESS_TOKEN="$v"; break; fi
    fi
  done
fi
CLOUDFLARE_ACCESS_TOKEN="${CLOUDFLARE_ACCESS_TOKEN:-}"

# ---------- Preflight ----------
need_root() { [ "$(id -u)" -eq 0 ] || { echo "ERROR: run as root or with sudo (need journalctl/dmesg/auth logs)"; exit 1; }; }
need_root

if ! date -d "$LOCKUP_DATE $LOCKUP_START" >/dev/null 2>&1; then
  echo "ERROR: invalid date/time: $LOCKUP_DATE $LOCKUP_START"; exit 1
fi

START_TS="$LOCKUP_DATE $LOCKUP_START"
END_TS="$LOCKUP_DATE $LOCKUP_END"
# epoch math — "$TS - N minutes" string form is mis-parsed as TZ offset by GNU date
START_EPOCH=$(date -d "$START_TS" +%s)
END_EPOCH=$(date -d "$END_TS" +%s)
PAD_START=$(date -d "@$((START_EPOCH - WINDOW_PAD_MIN * 60))" "+%Y-%m-%d %H:%M:%S")
PAD_END=$(date -d "@$((END_EPOCH + WINDOW_PAD_MIN * 60))" "+%Y-%m-%d %H:%M:%S")
ISO_START=$(date -u -d "@$((START_EPOCH - WINDOW_PAD_MIN * 60))" "+%Y-%m-%dT%H:%M:%SZ")
ISO_END=$(date -u -d "@$((END_EPOCH + WINDOW_PAD_MIN * 60))" "+%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

cat > 00-window.txt <<EOF
host:        $(hostname)
script_run:  $(date)
window_local: $START_TS  ->  $END_TS
window_padded_local: $PAD_START  ->  $PAD_END
window_padded_utc:   $ISO_START  ->  $ISO_END
output_dir:  $OUTPUT_DIR
cf_token_present: $([ -n "$CLOUDFLARE_ACCESS_TOKEN" ] && echo yes || echo no)
cf_zone_id_present: $([ -n "$CF_ZONE_ID" ] && echo yes || echo no)
EOF
cat 00-window.txt

# ---------- 01 reboots / uptime ----------
{
  echo "=== last reboot ==="; last reboot 2>/dev/null | head -10
  echo "=== who -b ==="; who -b
  echo "=== uptime ==="; uptime
  echo "=== last shutdown ==="; last -x shutdown 2>/dev/null | head -5
} > 01-reboots.txt

# ---------- 02 kernel (window-scoped + lockup keywords) ----------
{
  echo "=== journalctl -k window ==="
  journalctl -k --since "$PAD_START" --until "$PAD_END" --no-pager 2>&1 | head -2000
  echo
  echo "=== dmesg keywords (full buffer) ==="
  dmesg -T 2>/dev/null | grep -iE 'oom|killed process|hung_task|soft lockup|hard lockup|i/o error|memory cgroup|watchdog|panic|bug:' | tail -100
} > 02-kernel.txt

# ---------- 03 journalctl window ----------
journalctl --since "$PAD_START" --until "$PAD_END" --no-pager > 03-journal.txt 2>&1

# ---------- 04 errors only ----------
journalctl --since "$PAD_START" --until "$PAD_END" -p err --no-pager > 04-journal-errors.txt 2>&1

# ---------- 05 sysstat history ----------
{
  if command -v sar >/dev/null 2>&1; then
    DAY=$(date -d "$LOCKUP_DATE" +%d)
    SARFILE_BIN="/var/log/sysstat/sa$DAY"
    SARFILE_TXT="/var/log/sysstat/sar$DAY"
    SARFILE=""
    [ -f "$SARFILE_BIN" ] && SARFILE="$SARFILE_BIN"
    [ -z "$SARFILE" ] && [ -f "$SARFILE_TXT" ] && SARFILE="$SARFILE_TXT"
    if [ -n "$SARFILE" ]; then
      HS=$(date -d "$PAD_START" "+%H:%M:%S"); HE=$(date -d "$PAD_END" "+%H:%M:%S")
      echo "--- CPU ---";       sar -u -f "$SARFILE" -s "$HS" -e "$HE" 2>&1
      echo "--- LOAD ---";      sar -q -f "$SARFILE" -s "$HS" -e "$HE" 2>&1
      echo "--- MEM ---";       sar -r -f "$SARFILE" -s "$HS" -e "$HE" 2>&1
      echo "--- SWAP ---";      sar -S -f "$SARFILE" -s "$HS" -e "$HE" 2>&1
      echo "--- IO ---";        sar -b -f "$SARFILE" -s "$HS" -e "$HE" 2>&1
      echo "--- DISK ---";      sar -d -p -f "$SARFILE" -s "$HS" -e "$HE" 2>&1
      echo "--- NETWORK ---";   sar -n DEV -f "$SARFILE" -s "$HS" -e "$HE" 2>&1
      echo "--- TCP ---";       sar -n TCP,ETCP -f "$SARFILE" -s "$HS" -e "$HE" 2>&1
    else
      echo "sysstat sa file not found (expected /var/log/sysstat/sa$DAY)"
    fi
  else
    echo "sar not installed. apt-get install sysstat to retain CPU/mem/IO history."
  fi
} > 05-sar.txt

# ---------- 06 cron / scheduled jobs ----------
{
  echo "=== /etc/crontab ==="; cat /etc/crontab 2>/dev/null
  echo; echo "=== /etc/cron.d/ ==="
  for f in /etc/cron.d/*; do [ -f "$f" ] && echo "## $f" && cat "$f"; done
  echo; echo "=== /etc/cron.daily/ entries ==="; ls -la /etc/cron.daily/ 2>/dev/null
  echo; echo "=== user crontabs ==="
  for u in $(cut -d: -f1 /etc/passwd); do
    ct=$(crontab -u "$u" -l 2>/dev/null)
    [ -n "$ct" ] && echo "## user: $u" && echo "$ct"
  done
  echo; echo "=== systemd timers ==="; systemctl list-timers --all --no-pager 2>/dev/null
} > 06-cron.txt

# ---------- 07 docker ----------
{
  if command -v docker >/dev/null 2>&1; then
    echo "=== docker ps -a ==="; docker ps -a
    echo; echo "=== docker stats snapshot ==="; docker stats --no-stream
    echo; echo "=== docker events in window ==="
    timeout 8 docker events --since "$PAD_START" --until "$PAD_END" 2>/dev/null
    echo; echo "=== docker disk usage ==="; docker system df
  else
    echo "docker not installed"
  fi
} > 07-docker.txt

if command -v docker >/dev/null 2>&1; then
  for c in $(docker ps -a --format '{{.Names}}'); do
    safe=$(echo "$c" | tr '/' '_')
    {
      echo "=== logs $c (window) ==="
      docker logs --since "$PAD_START" --until "$PAD_END" "$c" 2>&1 | tail -c 1000000
    } > "08-docker-${safe}.log"
  done
fi

# ---------- 09 auth / ssh ----------
{
  echo "=== sshd in window ==="
  journalctl -t sshd --since "$PAD_START" --until "$PAD_END" --no-pager 2>&1
  echo; echo "=== last logins (any time) ==="; last -F | head -30
  echo; echo "=== failed logins (any time) ==="; lastb -F 2>/dev/null | head -20
} > 09-auth.txt

# ---------- 10 disk / fs ----------
{
  echo "=== df -h ==="; df -h
  echo; echo "=== df -i ==="; df -i
  echo; echo "=== mounts ==="; mount
  echo; echo "=== lsblk ==="; lsblk
  echo; echo "=== smartctl summary (if installed) ==="
  if command -v smartctl >/dev/null 2>&1; then
    for d in $(lsblk -dn -o NAME | grep -E '^(sd|nvme|vd)'); do
      echo "## /dev/$d"; smartctl -H "/dev/$d" 2>&1 | head -10
    done
  else echo "smartctl not installed"; fi
} > 10-disk.txt

# ---------- 11 cloudflare GraphQL analytics ----------
if [ -n "$CF_ZONE_ID" ] && [ -n "$CLOUDFLARE_ACCESS_TOKEN" ]; then
  cat > /tmp/cf-q.json <<EOF
{
  "query": "query (\$z:String!, \$s:Time!, \$e:Time!) { viewer { zones(filter:{zoneTag:\$z}) { httpRequests1mGroups(filter:{datetime_geq:\$s, datetime_leq:\$e}, orderBy:[datetime_ASC], limit:120) { dimensions{datetime} sum{requests bytes cachedRequests cachedBytes responseStatusMap{edgeResponseStatus requests}} uniq{uniques} } firewallEventsAdaptive(filter:{datetime_geq:\$s, datetime_leq:\$e}, orderBy:[datetime_ASC], limit:200) { datetime action source clientIP clientCountryName ruleId clientRequestPath edgeResponseStatus userAgent } } } }",
  "variables": {"z":"$CF_ZONE_ID","s":"$ISO_START","e":"$ISO_END"}
}
EOF
  curl -s -X POST https://api.cloudflare.com/client/v4/graphql \
       -H "Authorization: Bearer $CLOUDFLARE_ACCESS_TOKEN" \
       -H "Content-Type: application/json" \
       --data @/tmp/cf-q.json > 11-cloudflare-http.json
  rm -f /tmp/cf-q.json

  cat > /tmp/cf-q2.json <<EOF
{
  "query": "query (\$z:String!, \$s:Time!, \$e:Time!) { viewer { zones(filter:{zoneTag:\$z}) { httpRequestsAdaptiveGroups(filter:{datetime_geq:\$s, datetime_leq:\$e, edgeResponseStatus_geq:500}, orderBy:[datetime_ASC], limit:200) { dimensions{datetime edgeResponseStatus originResponseStatus clientRequestHTTPHost clientRequestPath} sum{requests} } } } }",
  "variables": {"z":"$CF_ZONE_ID","s":"$ISO_START","e":"$ISO_END"}
}
EOF
  curl -s -X POST https://api.cloudflare.com/client/v4/graphql \
       -H "Authorization: Bearer $CLOUDFLARE_ACCESS_TOKEN" \
       -H "Content-Type: application/json" \
       --data @/tmp/cf-q2.json > 11-cloudflare-5xx.json
  rm -f /tmp/cf-q2.json
else
  echo "skipped: CF_ZONE_ID or CLOUDFLARE_ACCESS_TOKEN missing" > 11-cloudflare-SKIPPED.txt
fi

# ---------- 12 cloudflared tunnel ----------
{
  if systemctl list-units --type=service --all 2>/dev/null | grep -q cloudflared; then
    echo "=== cloudflared status ==="; systemctl status cloudflared --no-pager 2>&1 | head -30
    echo; echo "=== cloudflared journal in window ==="
    journalctl -u cloudflared --since "$PAD_START" --until "$PAD_END" --no-pager 2>&1
  else
    echo "cloudflared service not present on this VPS"
  fi
} > 12-cloudflared.txt

# ---------- 13 process accounting (if enabled) ----------
{
  if command -v sa >/dev/null 2>&1; then
    echo "=== top processes by CPU (acct) ==="; sa -m 2>&1 | head -30
  else
    echo "psacct/acct not installed"
  fi
} > 13-process-acct.txt

# ---------- 14 redis (if running locally as a docker container) ----------
if command -v docker >/dev/null 2>&1; then
  for rc in aishacrm-redis-memory aishacrm-redis-cache; do
    if docker ps --format '{{.Names}}' | grep -q "^$rc\$"; then
      {
        echo "=== $rc INFO ==="; docker exec "$rc" redis-cli INFO 2>&1 | head -100
        echo; echo "=== $rc SLOWLOG GET 50 ==="; docker exec "$rc" redis-cli SLOWLOG GET 50 2>&1
        echo; echo "=== $rc LATENCY HISTORY ==="; docker exec "$rc" redis-cli LATENCY LATEST 2>&1
      } > "14-$rc.txt"
    fi
  done
fi

# ---------- bundle ----------
cd "$(dirname "$OUTPUT_DIR")"
TARNAME="lockup-diag-$(hostname)-$(date +%Y%m%d-%H%M%S).tar.gz"
tar czf "$TARNAME" "$(basename "$OUTPUT_DIR")" 2>/dev/null

echo
echo "============================================================"
echo "DONE"
echo "Bundle:  $(pwd)/$TARNAME"
echo "Size:    $(du -h "$TARNAME" 2>/dev/null | cut -f1)"
echo
echo "Files in $OUTPUT_DIR:"
find "$OUTPUT_DIR" -maxdepth 1 -type f | sort
echo
echo "============================================================"
echo "Next:"
echo "  scp $(pwd)/$TARNAME you@laptop:."
echo "  # or print key files inline on this VPS:"
echo "  cat $OUTPUT_DIR/00-window.txt"
echo "  cat $OUTPUT_DIR/02-kernel.txt"
echo "  head -200 $OUTPUT_DIR/04-journal-errors.txt"
echo "  cat $OUTPUT_DIR/06-cron.txt"
