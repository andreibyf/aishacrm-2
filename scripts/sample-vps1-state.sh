#!/usr/bin/env bash
# 1-minute sampler for VPS-1. Writes a single-line CSV record per call so
# we have continuous pre-lockup state to look at after the next wedge.
#
# Install on VPS-1:
#   sudo install -m0755 /tmp/sample-vps1-state.sh /usr/local/bin/sample-vps1-state.sh
#   ( crontab -l 2>/dev/null; echo "* * * * * /usr/local/bin/sample-vps1-state.sh >> /var/log/vps1-state.csv 2>&1" ) | crontab -
#
# After the next lockup, grab /var/log/vps1-state.csv and look at the trend
# in the columns leading up to the wedge.
set +e

ts=$(date -u +%FT%TZ)
load1=$(awk '{print $1}' /proc/loadavg)
mem_used_kb=$(awk '/^MemTotal:/{t=$2}/^MemAvailable:/{a=$2}END{print t-a}' /proc/meminfo)
swap_used_kb=$(awk '/^SwapTotal:/{t=$2}/^SwapFree:/{f=$2}END{print t-f}' /proc/meminfo)
psi_cpu=$(awk '/^some/{print $2}' /proc/pressure/cpu | head -1 | sed 's/avg10=//')
psi_mem=$(awk '/^some/{print $2}' /proc/pressure/memory | head -1 | sed 's/avg10=//')

slice_cg=$(find /sys/fs/cgroup -maxdepth 4 -name aishacrm.slice -type d 2>/dev/null | head -1)
slice_mem=0
slice_throttled=0
if [ -n "$slice_cg" ]; then
  slice_mem=$(cat "$slice_cg/memory.current" 2>/dev/null || echo 0)
  slice_throttled=$(awk '/^nr_throttled/{print $2}' "$slice_cg/cpu.stat" 2>/dev/null || echo 0)
fi

# Memory of the three known-escapee processes by container name
sentinel_rss=$(docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' coolify-sentinel 2>/dev/null | awk '{print $2}' | head -1)
proxy_rss=$(docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' coolify-proxy 2>/dev/null | awk '{print $2}' | head -1)
landing_rss=$(docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' aisha-landing-page 2>/dev/null | awk '{print $2}' | head -1)

dockerd_rss=$(ps -o rss= -p "$(pgrep -x dockerd | head -1)" 2>/dev/null | tr -d ' ')
journal_rss=$(ps -o rss= -p "$(pgrep -x systemd-journal | head -1)" 2>/dev/null | tr -d ' ')

echo "$ts,load1=$load1,mem_used_kb=$mem_used_kb,swap_used_kb=$swap_used_kb,psi_cpu_avg10=$psi_cpu,psi_mem_avg10=$psi_mem,slice_mem_bytes=$slice_mem,slice_nr_throttled=$slice_throttled,sentinel=${sentinel_rss:-NA},proxy=${proxy_rss:-NA},landing=${landing_rss:-NA},dockerd_rss_kb=${dockerd_rss:-NA},journal_rss_kb=${journal_rss:-NA}"
