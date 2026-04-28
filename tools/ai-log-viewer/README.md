# AiSHA AI Activity Log Viewer

Real-time dashboard for monitoring AI/LLM activity from `llm_activity_logs` table in Supabase.

## Features

- 📊 **Real-time Stats**: Total calls, avg duration, token usage, error rate
- 🔍 **Powerful Filters**: Time range, provider, status, capability
- 🎨 **Clean UI**: Dark theme, color-coded statuses
- ⚡ **Lightweight**: Single-file Express server, no database needed
- 🔄 **Auto-refresh**: Updates every 30 seconds

## Why This Exists

You asked: _"I need to have visibility into logs, especially anything AI related. Uptime Kuma does not offer that, and I keep coming to you to investigate."_

This gives you **direct access** to all AI activity logs from VPS-2 without SSH-ing into VPS-1.

---

## Quick Deploy on VPS-2

### 1. Clone repo (if not already)

```bash
cd /opt
git clone https://github.com/andreibyf/aishacrm-2.git
cd aishacrm-2/tools/ai-log-viewer
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set environment variables

```bash
export SUPABASE_URL="https://efzqxjpfewkrgpdootte.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>"
export PORT=3030
```

Or use a `.env` file (add `dotenv` package):

```bash
echo "SUPABASE_URL=https://efzqxjpfewkrgpdootte.supabase.co" > .env
echo "SUPABASE_SERVICE_ROLE_KEY=<key>" >> .env
echo "PORT=3030" >> .env
```

### 4. Run the server

```bash
npm start
```

### 5. Access the dashboard

Open in browser: `http://<VPS-2-IP>:3030`

Example: `http://147.189.173.238:3030` (replace with your VPS-2 IP)

---

## Run as systemd service (production)

Create `/etc/systemd/system/ai-log-viewer.service`:

```ini
[Unit]
Description=AiSHA AI Log Viewer
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/aishacrm-2/tools/ai-log-viewer
Environment="SUPABASE_URL=https://efzqxjpfewkrgpdootte.supabase.co"
Environment="SUPABASE_SERVICE_ROLE_KEY=<your-key>"
Environment="PORT=3030"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
systemctl daemon-reload
systemctl enable ai-log-viewer
systemctl start ai-log-viewer
systemctl status ai-log-viewer
```

Check logs:

```bash
journalctl -u ai-log-viewer -f
```

---

## Firewall / Reverse Proxy

### Option A: Cloudflare Tunnel (recommended)

Add to existing `cloudflared` config on VPS-2:

```yaml
ingress:
  - hostname: logs.aishacrm.com
    service: http://localhost:3030
  # ... existing rules
```

### Option B: Direct port access

Open port 3030:

```bash
ufw allow 3030/tcp
```

### Option C: Nginx reverse proxy

Add to existing nginx config:

```nginx
location /ai-logs/ {
  proxy_pass http://localhost:3030/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

---

## Usage Examples

### Filter by provider

Select "OpenAI" or "Anthropic" from dropdown → Click Refresh

### Check errors in last hour

- Time Range: "Last 1 hour"
- Status: "Error"
- Click Refresh

### Monitor CARE workflow AI calls

- Time Range: "Last 6 hours"
- Capability: "Chat Tools"
- Look for `tools_called` column showing Braid tools

### Export data (future enhancement)

Currently view-only. To export, use SQL directly:

```sql
COPY (
  SELECT * FROM llm_activity_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
) TO '/tmp/ai-logs.csv' CSV HEADER;
```

---

## API Endpoints

### `GET /api/logs`

Query params:

- `hours` - Time range in hours (default: 24)
- `provider` - Filter by provider (openai, anthropic, groq, local)
- `status` - Filter by status (success, error, failover)
- `capability` - Filter by capability (chat_tools, json_strict, etc)
- `limit` - Max results (default: 100)

Example:

```bash
curl "http://localhost:3030/api/logs?hours=1&provider=openai&status=error"
```

### `GET /health`

Health check endpoint.

---

## Scaling Considerations

As you get more clients:

1. **CARE Rate Limiting** (already implemented in v7.1.23):
   - `CARE_RATE_LIMIT_MAX=10` - max 10 concurrent workflows
   - `CARE_RATE_LIMIT_DURATION=60000` - per 60 seconds
   - Adjust via Doppler when needed

2. **Log Retention** (already implemented in migration 151):
   - Auto-cleanup after 90 days via pg_cron
   - Indexes on `tenant_id`, `created_at`, `provider`, `status`

3. **This Log Viewer**:
   - Queries are read-only, no write impact
   - Uses indexed columns for fast queries
   - Limit default is 100 rows (configurable)

---

## Troubleshooting

### "Failed to load logs: HTTP 500"

Check Supabase credentials:

```bash
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

### "No logs found"

1. Verify backend is logging to `llm_activity_logs`:

```sql
SELECT COUNT(*) FROM llm_activity_logs;
```

2. Check if table exists and RLS policies allow service role:

```sql
SELECT * FROM llm_activity_logs LIMIT 1;
```

### Port 3030 already in use

Change port in `.env` or environment variable:

```bash
PORT=3031 npm start
```

---

## Alternative: Metabase

If you prefer a more powerful BI tool, install Metabase on VPS-2:

```bash
docker run -d -p 3030:3000 --name metabase metabase/metabase
```

Connect to Supabase Postgres and build custom dashboards with charts, exports, scheduled reports, etc.

**Pros**: More features, charts, CSV export, scheduled emails  
**Cons**: Heavier (200MB+), requires configuration

---

## Support

Issues? Check:

1. Supabase connection: `curl https://efzqxjpfewkrgpdootte.supabase.co/rest/v1/`
2. Service logs: `journalctl -u ai-log-viewer -f`
3. Browser console (F12) for frontend errors
